package com.gamemetrics.internal

import android.content.ContentProvider
import android.content.ContentValues
import android.content.pm.ProviderInfo
import android.database.Cursor
import android.net.Uri
import android.util.Log
import com.gamemetrics.GameMetrics

class GameMetricsInitProvider : ContentProvider() {

        override fun onCreate(): Boolean {
                val ctx = context ?: return false
                val appInfo = ctx.packageManager.getApplicationInfo(
                        ctx.packageName,
                        android.content.pm.PackageManager.GET_META_DATA,
                )
                val meta = appInfo.metaData ?: return false

                val autoInit = meta.getBoolean("com.gamemetrics.AUTO_INIT", true)
                if (!autoInit) {
                        Log.d(GameMetricsClient.TAG, "Auto-init disabled via meta-data")
                        return true
                }

                val apiKey = meta.getString("com.gamemetrics.API_KEY")
                val projectId = meta.getString("com.gamemetrics.PROJECT_ID")

                if (apiKey.isNullOrBlank() || projectId.isNullOrBlank()) {
                        Log.w(
                                GameMetricsClient.TAG,
                                "Missing com.gamemetrics.API_KEY or com.gamemetrics.PROJECT_ID meta-data — skipping auto-init",
                        )
                        return true
                }

                val loggingOnly = meta.getBoolean("com.gamemetrics.LOGGING_ONLY", false)
                val debugLogPayloads = meta.getBoolean("com.gamemetrics.DEBUG_LOG_PAYLOADS", false)
                GameMetrics.init(ctx, apiKey, projectId, loggingOnly, debugLogPayloads)
                return true
        }

        override fun attachInfo(context: android.content.Context?, info: ProviderInfo?) {
                if (info == null) throw NullPointerException("GameMetricsInitProvider ProviderInfo is null")
                if (info.authority == "com.gamemetrics.gamemetricsinitprovider") {
                        throw IllegalStateException(
                                "Incorrect provider authority in manifest. " +
                                        "Use \${applicationId}.gamemetricsinitprovider"
                        )
                }
                super.attachInfo(context, info)
        }

        override fun query(u: Uri, p: Array<out String>?, s: String?, sa: Array<out String>?, so: String?): Cursor? = null
        override fun getType(uri: Uri): String? = null
        override fun insert(uri: Uri, values: ContentValues?): Uri? = null
        override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
        override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
