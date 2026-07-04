package com.gamemetrics.internal.sink

import com.gamemetrics.internal.db.EventEntity

internal interface EventSink {
        /** Sends [events] as a single batch request. The list must already be within the server cap. */
        suspend fun send(events: List<EventEntity>): SendResult
}

/** Outcome of a batch send, so callers can decide whether to delete, drop, or keep-and-retry. */
internal sealed interface SendResult {
        /** 201 — the whole batch was stored; the rows are safe to delete from Room. */
        data object Delivered : SendResult

        /**
         * 400/413 — the server rejected the batch as a client bug (malformed / too large). It will
         * never succeed as-is, so it must be dropped (or quarantined) rather than retried forever.
         */
        data class Rejected(val code: Int, val body: String) : SendResult

        /**
         * Network failure / 5xx / 429 — transient. Keep the rows in Room and retry later.
         * [retryAfterMs] carries a 429 `Retry-After` hint when the server provided one.
         */
        data class Retry(val retryAfterMs: Long? = null) : SendResult
}
