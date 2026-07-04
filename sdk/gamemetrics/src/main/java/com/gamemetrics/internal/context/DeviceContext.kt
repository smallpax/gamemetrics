package com.gamemetrics.internal.context

import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.util.Log
import com.gamemetrics.internal.GameMetricsClient
import org.json.JSONObject

/**
 * Auto-collected device/app analytics context, gathered **once** at SDK init and attached to
 * every event under the nested `context` key inside `params`.
 *
 * Documented shape (stable — treat as part of the SDK contract):
 * ```
 * "context": {
 *   "device":  { "model": "Pixel 7", "manufacturer": "Google" },
 *   "os":      { "release": "14", "sdk_int": 34 },
 *   "app":     { "version_name": "1.0", "version_code": 1 },
 *   "screen":  { "width": 1080, "height": 2400, "density": 2.75 },
 *   "locale":  "en-US",
 *   "network": "wifi" | "cellular" | "none"
 * }
 * ```
 *
 * The developer passes none of this. Network type reflects connectivity at init time (context is
 * captured once, per the SDK contract). Everything here rides inside the `params` jsonb column, so
 * no server-side schema change is required.
 */
internal class DeviceContext private constructor(private val json: JSONObject) {

    /** Returns a fresh copy so callers can merge into per-event params without mutating the cache. */
    fun asJson(): JSONObject = JSONObject(json.toString())

    companion object {
        fun collect(context: Context): DeviceContext {
            val json = JSONObject()
            try {
                json.put(
                    "device",
                    JSONObject()
                        .put("model", Build.MODEL)
                        .put("manufacturer", Build.MANUFACTURER),
                )
                json.put(
                    "os",
                    JSONObject()
                        .put("release", Build.VERSION.RELEASE)
                        .put("sdk_int", Build.VERSION.SDK_INT),
                )
                json.put("app", appJson(context))
                json.put("screen", screenJson(context))
                json.put("locale", localeTag(context))
                json.put("network", networkType(context))
            } catch (e: Exception) {
                // Context is best-effort — never let collection failures break tracking.
                Log.w(GameMetricsClient.TAG, "Device context collection failed: ${e.message}")
            }
            return DeviceContext(json)
        }

        private fun appJson(context: Context): JSONObject {
            val out = JSONObject()
            try {
                val pm = context.packageManager
                val info = pm.getPackageInfo(context.packageName, 0)
                out.put("version_name", info.versionName ?: JSONObject.NULL)
                val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    info.longVersionCode
                } else {
                    @Suppress("DEPRECATION")
                    info.versionCode.toLong()
                }
                out.put("version_code", code)
            } catch (e: PackageManager.NameNotFoundException) {
                Log.w(GameMetricsClient.TAG, "App version unavailable: ${e.message}")
            }
            return out
        }

        private fun screenJson(context: Context): JSONObject {
            val metrics = context.resources.displayMetrics
            return JSONObject()
                .put("width", metrics.widthPixels)
                .put("height", metrics.heightPixels)
                .put("density", metrics.density.toDouble())
        }

        private fun localeTag(context: Context): String {
            val config = context.resources.configuration
            val locale = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                config.locales[0]
            } else {
                @Suppress("DEPRECATION")
                config.locale
            }
            return locale.toLanguageTag()
        }

        private fun networkType(context: Context): String {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return "none"
            val network = cm.activeNetwork ?: return "none"
            val caps = cm.getNetworkCapabilities(network) ?: return "none"
            return when {
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "wifi"
                else -> "none"
            }
        }
    }
}
