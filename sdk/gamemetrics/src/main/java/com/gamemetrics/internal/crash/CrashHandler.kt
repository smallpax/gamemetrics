package com.gamemetrics.internal.crash

import android.util.Log
import com.gamemetrics.internal.GameMetricsClient

/**
 * [Thread.UncaughtExceptionHandler] that gives the SDK a chance to persist the crash as an event
 * and synchronously push pending events to the server *before the process dies* — WorkManager's
 * deferred flush never runs once the process is being killed.
 *
 * The blocking flush is hard-capped (see [GameMetricsClient.flushBlockingOnCrash]) so it can never
 * hang the dying process. Afterwards it always chains to the previously installed default handler
 * so normal crash reporting / the system crash dialog still happen.
 */
internal class CrashHandler(
    private val client: GameMetricsClient,
    private val previous: Thread.UncaughtExceptionHandler?,
) : Thread.UncaughtExceptionHandler {

    override fun uncaughtException(thread: Thread, throwable: Throwable) {
        try {
            client.flushBlockingOnCrash(throwable)
        } catch (t: Throwable) {
            // Never let our own failure swallow the original crash.
            Log.w(GameMetricsClient.TAG, "Crash flush failed: ${t.message}")
        } finally {
            // Chain so the default handler (system dialog / other reporters) still runs.
            previous?.uncaughtException(thread, throwable)
        }
    }
}
