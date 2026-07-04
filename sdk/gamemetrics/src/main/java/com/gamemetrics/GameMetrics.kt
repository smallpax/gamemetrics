package com.gamemetrics

import android.content.Context
import com.gamemetrics.internal.GameMetricsClient

object GameMetrics {

        internal var client: GameMetricsClient? = null

        fun init(
                context: Context,
                apiKey: String,
                projectId: String,
                loggingOnly: Boolean = false,
                debugLogPayloads: Boolean = false,
        ) {
                client = GameMetricsClient(context.applicationContext, apiKey, projectId, loggingOnly, debugLogPayloads)
        }

        fun trackEvent(name: String, params: Map<String, Any>? = null) {
                requireClient().trackEvent(name, params)
        }

        fun trackScreen(screenName: String) {
                requireClient().trackEvent("screen_view", mapOf("screen_name" to screenName))
        }

        fun setUserId(userId: String?) {
                requireClient().setUserId(userId)
        }

        fun setUserProperty(key: String, value: String) {
                requireClient().setUserProperty(key, value)
        }

        fun flush() {
                requireClient().flush()
        }

        fun logException(throwable: Throwable) {
                requireClient().trackException(throwable)
        }

        private fun requireClient(): GameMetricsClient {
                return client
                        ?: throw IllegalStateException(
                                "GameMetrics is not initialized. " +
                                        "Ensure com.gamemetrics.API_KEY and com.gamemetrics.PROJECT_ID " +
                                        "meta-data are set, or call GameMetrics.init() manually."
                        )
        }
}
