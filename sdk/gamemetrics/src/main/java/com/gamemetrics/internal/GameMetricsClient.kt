package com.gamemetrics.internal

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.gamemetrics.internal.context.DeviceContext
import com.gamemetrics.internal.crash.CrashHandler
import com.gamemetrics.internal.db.EventEntity
import com.gamemetrics.internal.db.GameMetricsDatabase
import com.gamemetrics.internal.flush.FlushWorker
import com.gamemetrics.internal.sink.EventSink
import com.gamemetrics.internal.sink.HttpSink
import com.gamemetrics.internal.sink.LoggingSink
import com.gamemetrics.internal.sink.SendResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

internal class GameMetricsClient(
        private val context: Context,
        val apiKey: String,
        val projectId: String,
        val loggingOnly: Boolean = false,
        private val debugLogPayloads: Boolean = false,
) {
        val sessionId: String = UUID.randomUUID().toString()

        @Volatile
        var userId: String? = null
                private set

        private val userProperties = mutableMapOf<String, String>()

        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        private val buffer = ConcurrentLinkedQueue<EventEntity>()
        private val dbReady = AtomicBoolean(false)

        /** Standard device/app context, collected once and merged into every event's params. */
        private val deviceContext: DeviceContext = DeviceContext.collect(context)

        @Volatile
        private lateinit var database: GameMetricsDatabase

        init {
                Log.d(TAG, "Initializing — apiKey=${apiKey.take(8)}…, projectId=$projectId, session=$sessionId")

                // Install the crash-safe upload handler as early as possible, chaining the previous one.
                val previous = Thread.getDefaultUncaughtExceptionHandler()
                Thread.setDefaultUncaughtExceptionHandler(CrashHandler(this, previous))

                // Flush promptly when the app goes to background instead of waiting for the periodic worker.
                registerLifecycleFlush()

                scope.launch {
                        database = GameMetricsDatabase.create(context)
                        dbReady.set(true)
                        drainBuffer()
                        scheduleFlush()
                }
        }

        fun setUserId(userId: String?) {
                this.userId = userId
        }

        fun setUserProperty(key: String, value: String) {
                synchronized(userProperties) {
                        userProperties[key] = value
                }
        }

        fun trackEvent(name: String, params: Map<String, Any>? = null) {
                enqueue(buildEntity(name, params))
        }

        /** Reused by both [com.gamemetrics.GameMetrics.logException] and the crash handler. */
        fun trackException(throwable: Throwable) {
                enqueue(exceptionEvent(throwable))
        }

        private fun exceptionEvent(throwable: Throwable): EventEntity =
                buildEntity(
                        "exception",
                        mapOf(
                                "message" to (throwable.message ?: ""),
                                "stacktrace" to throwable.stackTraceToString(),
                        ),
                )

        /** Builds the persisted event, merging the auto-collected [deviceContext] under `context`. */
        private fun buildEntity(name: String, params: Map<String, Any>?): EventEntity {
                val merged = if (params != null) JSONObject(params) else JSONObject()
                merged.put("context", deviceContext.asJson())
                return EventEntity(
                        eventName = name,
                        userId = userId,
                        sessionId = sessionId,
                        params = merged.toString(),
                        timestamp = System.currentTimeMillis(),
                )
        }

        private fun enqueue(entity: EventEntity) {
                if (dbReady.get()) {
                        scope.launch {
                                database.eventDao().insert(entity)
                        }
                } else {
                        buffer.add(entity)
                }
        }

        private suspend fun drainBuffer() {
                val dao = database.eventDao()
                while (true) {
                        val event = buffer.poll() ?: break
                        dao.insert(event)
                }
        }

        fun flush() {
                val request = OneTimeWorkRequestBuilder<FlushWorker>()
                        .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                        .build()
                WorkManager.getInstance(context).enqueueUniqueWork(
                        FLUSH_WORK_NAME_IMMEDIATE,
                        ExistingWorkPolicy.KEEP,
                        request,
                )
        }

        /** Re-schedules a flush after a server-requested delay (429 Retry-After), replacing any pending one. */
        fun scheduleDelayedFlush(delayMs: Long) {
                Log.d(TAG, "Rate limited — scheduling retry flush in ${delayMs}ms")
                val request = OneTimeWorkRequestBuilder<FlushWorker>()
                        .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
                        .build()
                WorkManager.getInstance(context).enqueueUniqueWork(
                        FLUSH_WORK_NAME_IMMEDIATE,
                        ExistingWorkPolicy.REPLACE,
                        request,
                )
        }

        /**
         * Synchronously persist the crash event and push everything pending to the server before the
         * process dies. Runs on a daemon thread that we [Thread.join] with a hard budget so it can
         * never hang the dying process, regardless of socket state. Best-effort by design.
         */
        fun flushBlockingOnCrash(throwable: Throwable) {
                val worker = Thread {
                        try {
                                runBlocking {
                                        val db = if (dbReady.get()) database else GameMetricsDatabase.create(context)
                                        val dao = db.eventDao()

                                        // Persist any events buffered before the DB was ready.
                                        while (true) {
                                                val buffered = buffer.poll() ?: break
                                                dao.insert(buffered)
                                        }

                                        // Persist the crash itself first, so it survives even if the send fails.
                                        dao.insert(exceptionEvent(throwable))

                                        // One batched request per ≤500 events — faster than N POSTs when
                                        // racing process death.
                                        val sink = createCrashSink()
                                        while (true) {
                                                val batch = dao.getOldest(MAX_BATCH_SIZE)
                                                if (batch.isEmpty()) break
                                                when (val result = sink.send(batch)) {
                                                        is SendResult.Delivered -> dao.deleteByIds(batch.map { it.id })
                                                        is SendResult.Rejected -> {
                                                                Log.e(TAG, "Crash flush dropping ${batch.size} rejected events (HTTP ${result.code})")
                                                                dao.deleteByIds(batch.map { it.id })
                                                        }
                                                        // Racing death — leave the rows for the worker on next launch.
                                                        is SendResult.Retry -> break
                                                }
                                        }
                                }
                        } catch (t: Throwable) {
                                Log.w(TAG, "Crash flush send failed: ${t.message}")
                        }
                }.apply {
                        name = "gm-crash-flush"
                        isDaemon = true
                }

                worker.start()
                worker.join(CRASH_FLUSH_BUDGET_MS)
                if (worker.isAlive) {
                        Log.w(TAG, "Crash flush exceeded ${CRASH_FLUSH_BUDGET_MS}ms budget — abandoning so the process can die")
                } else {
                        Log.d(TAG, "Crash flush completed within budget")
                }
        }

        private fun registerLifecycleFlush() {
                val observer = object : DefaultLifecycleObserver {
                        override fun onStop(owner: LifecycleOwner) {
                                Log.d(TAG, "App backgrounded — flushing pending events")
                                flush()
                        }
                }
                // ProcessLifecycleOwner must be observed from the main thread.
                Handler(Looper.getMainLooper()).post {
                        ProcessLifecycleOwner.get().lifecycle.addObserver(observer)
                }
        }

        private fun scheduleFlush() {
                val request = PeriodicWorkRequestBuilder<FlushWorker>(15, TimeUnit.MINUTES)
                        .setConstraints(
                                Constraints.Builder()
                                        .setRequiredNetworkType(NetworkType.CONNECTED)
                                        .build()
                        )
                        .build()

                WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                        FLUSH_WORK_NAME,
                        ExistingPeriodicWorkPolicy.KEEP,
                        request,
                )
        }

        fun createSink(): EventSink {
                return if (loggingOnly) LoggingSink() else HttpSink(apiKey, logPayloads = debugLogPayloads)
        }

        /** Sink for the crash path: short HTTP timeouts so a dead network fails fast within the budget. */
        private fun createCrashSink(): EventSink {
                return if (loggingOnly) {
                        LoggingSink()
                } else {
                        HttpSink(
                                apiKey,
                                connectTimeoutMs = CRASH_HTTP_TIMEOUT_MS,
                                readTimeoutMs = CRASH_HTTP_TIMEOUT_MS,
                                logPayloads = debugLogPayloads,
                        )
                }
        }

        companion object {
                const val TAG = "GameMetrics"
                const val FLUSH_WORK_NAME = "com.gamemetrics.flush"
                const val FLUSH_WORK_NAME_IMMEDIATE = "com.gamemetrics.flush.immediate"

                /** Server cap on events per /v1/events/batch request; callers chunk to this. */
                const val MAX_BATCH_SIZE = 500

                /** Hard wall-clock cap on the crash flush so the dying process is never hung. */
                const val CRASH_FLUSH_BUDGET_MS = 3_000L

                /** Per-connection timeout on the crash path; kept under the overall budget. */
                const val CRASH_HTTP_TIMEOUT_MS = 2_500
        }
}
