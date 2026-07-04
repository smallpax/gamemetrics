package com.gamemetrics.internal.flush

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.gamemetrics.GameMetrics
import com.gamemetrics.internal.GameMetricsClient
import com.gamemetrics.internal.db.GameMetricsDatabase
import com.gamemetrics.internal.sink.LoggingSink
import com.gamemetrics.internal.sink.SendResult

internal class FlushWorker(
        context: Context,
        params: WorkerParameters,
) : CoroutineWorker(context, params) {

        override suspend fun getForegroundInfo(): ForegroundInfo {
                val channelId = "gamemetrics_sync"
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        val channel = NotificationChannel(channelId, "GameMetrics Sync", NotificationManager.IMPORTANCE_LOW)
                        val nm = applicationContext.getSystemService(NotificationManager::class.java)
                        nm.createNotificationChannel(channel)
                }
                val notification = NotificationCompat.Builder(applicationContext, channelId)
                        .setSmallIcon(android.R.drawable.ic_popup_sync)
                        .setContentTitle("Syncing analytics")
                        .build()
                return ForegroundInfo(NOTIFICATION_ID, notification)
        }

        override suspend fun doWork(): Result {
                val db = GameMetricsDatabase.create(applicationContext)
                try {
                        val dao = db.eventDao()
                        val sink = GameMetrics.client?.createSink() ?: LoggingSink()

                        // Drain the queue one ≤500-event batch (= one request) at a time.
                        while (true) {
                                val batch = dao.getOldest(GameMetricsClient.MAX_BATCH_SIZE)
                                if (batch.isEmpty()) break
                                when (val result = sink.send(batch)) {
                                        is SendResult.Delivered -> dao.deleteByIds(batch.map { it.id })
                                        is SendResult.Rejected -> {
                                                // Client bug: this batch will never succeed. Log loudly and drop it
                                                // so it can't block the queue forever.
                                                Log.e(
                                                        GameMetricsClient.TAG,
                                                        "Dropping ${batch.size} events — server rejected batch as malformed " +
                                                                "(HTTP ${result.code}): ${result.body}",
                                                )
                                                dao.deleteByIds(batch.map { it.id })
                                        }
                                        is SendResult.Retry -> {
                                                // Transient: keep the rows and retry later.
                                                return if (result.retryAfterMs != null) {
                                                        GameMetrics.client?.scheduleDelayedFlush(result.retryAfterMs)
                                                        Result.success()
                                                } else {
                                                        Result.retry()
                                                }
                                        }
                                }
                        }
                        return Result.success()
                } finally {
                        db.close()
                }
        }

        companion object {
                const val NOTIFICATION_ID = 29_100
        }
}
