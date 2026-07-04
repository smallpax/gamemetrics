package com.gamemetrics.internal.sink

import android.util.Log
import com.gamemetrics.internal.GameMetricsClient
import com.gamemetrics.internal.db.EventEntity
import org.json.JSONObject

internal class LoggingSink : EventSink {

        override suspend fun send(events: List<EventEntity>): SendResult {
                for (event in events) {
                        val payload = JSONObject().apply {
                                put("event_name", event.eventName)
                                put("user_id", event.userId ?: JSONObject.NULL)
                                put("session_id", event.sessionId)
                                put("params", if (event.params != null) JSONObject(event.params) else JSONObject.NULL)
                                put("timestamp", event.timestamp)
                        }
                        Log.d(GameMetricsClient.TAG, payload.toString(2))
                }
                return SendResult.Delivered
        }
}
