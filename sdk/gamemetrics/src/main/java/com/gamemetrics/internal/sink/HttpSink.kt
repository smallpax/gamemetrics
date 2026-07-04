package com.gamemetrics.internal.sink

import android.util.Log
import com.gamemetrics.internal.GameMetricsClient
import com.gamemetrics.internal.db.EventEntity
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal class HttpSink(
        private val apiKey: String,
        private val endpointUrl: String = DEFAULT_BATCH_ENDPOINT,
        private val connectTimeoutMs: Int = 30_000,
        private val readTimeoutMs: Int = 30_000,
        // Full-payload logging can expose PII, so it is opt-in and off by default.
        private val logPayloads: Boolean = false,
) : EventSink {

        /**
         * Sends the whole [events] list to /v1/events/batch as ONE request. The caller is responsible
         * for chunking to the server cap ([GameMetricsClient.MAX_BATCH_SIZE]).
         */
        override suspend fun send(events: List<EventEntity>): SendResult {
                if (events.isEmpty()) return SendResult.Delivered

                val body = JSONObject().apply {
                        put("events", JSONArray().apply { events.forEach { put(eventJson(it)) } })
                }

                Log.d(GameMetricsClient.TAG, "Batch POST → $endpointUrl (${events.size} events in 1 request)")
                if (logPayloads) {
                        Log.d(GameMetricsClient.TAG, "Batch body → $body")
                }

                val connection = (URL(endpointUrl).openConnection() as HttpURLConnection).apply {
                        requestMethod = "POST"
                        setRequestProperty("Content-Type", "application/json")
                        setRequestProperty("x-api-key", apiKey)
                        doOutput = true
                        connectTimeout = connectTimeoutMs
                        readTimeout = readTimeoutMs
                }

                return try {
                        connection.outputStream.use { out ->
                                OutputStreamWriter(out, Charsets.UTF_8).use { it.write(body.toString()) }
                        }
                        val code = connection.responseCode
                        when {
                                code in 200..299 -> {
                                        Log.d(GameMetricsClient.TAG, "Flushed ${events.size} events in 1 batch request (HTTP $code)")
                                        SendResult.Delivered
                                }
                                // Malformed / too large: a client bug that will never succeed as-is.
                                code == 400 || code == 413 -> {
                                        val errorBody = connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                                        SendResult.Rejected(code, errorBody)
                                }
                                // Rate limited: honor Retry-After (seconds) if present.
                                code == 429 -> {
                                        val retryAfterMs = parseRetryAfterMs(connection.getHeaderField("Retry-After"))
                                        Log.w(GameMetricsClient.TAG, "Batch rate limited (HTTP 429); retry after ${retryAfterMs ?: "backoff"}ms")
                                        SendResult.Retry(retryAfterMs)
                                }
                                // 5xx and any other unexpected status: transient, keep and retry.
                                else -> {
                                        val errorBody = connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                                        Log.w(GameMetricsClient.TAG, "Batch POST transient failure: HTTP $code — $errorBody")
                                        SendResult.Retry()
                                }
                        }
                } catch (e: Exception) {
                        Log.w(GameMetricsClient.TAG, "Batch POST failed: ${e.message}")
                        SendResult.Retry()
                } finally {
                        connection.disconnect()
                }
        }

        private fun eventJson(event: EventEntity): JSONObject = JSONObject().apply {
                put("event_name", event.eventName)
                put("user_id", event.userId ?: JSONObject.NULL)
                put("session_id", event.sessionId)
                put("params", if (event.params != null) JSONObject(event.params) else JSONObject.NULL)
                put("timestamp", isoFormat.format(Date(event.timestamp)))
        }

        /** Retry-After is sent in seconds by the server; tolerate a missing/garbage value. */
        private fun parseRetryAfterMs(header: String?): Long? =
                header?.trim()?.toLongOrNull()?.let { it * 1000L }

        private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
        }

        companion object {
                const val HOST = "10.0.2.2"
                const val DEFAULT_BATCH_ENDPOINT = "http://$HOST:3000/v1/events/batch"
        }
}
