package com.gamemetrics.sample

import android.os.Bundle
import android.widget.Button
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.gamemetrics.GameMetrics

class MainActivity : AppCompatActivity() {
        override fun onCreate(savedInstanceState: Bundle?) {
                super.onCreate(savedInstanceState)
                enableEdgeToEdge()
                setContentView(R.layout.activity_main)
                ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
                        val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
                        v.setPadding(
                                systemBars.left,
                                systemBars.top,
                                systemBars.right,
                                systemBars.bottom
                        )
                        insets
                }

                findViewById<Button>(R.id.btnTrackEvent).setOnClickListener {
                        GameMetrics.trackEvent("button_click", mapOf("button" to "track_event", "count" to 1))
                        toast("Event tracked")
                }

                findViewById<Button>(R.id.btnTrackScreen).setOnClickListener {
                        GameMetrics.trackScreen("main_screen")
                        toast("Screen tracked")
                }

                findViewById<Button>(R.id.btnSetUserId).setOnClickListener {
                        GameMetrics.setUserId("user-42")
                        GameMetrics.setUserProperty("plan", "premium")
                        toast("User ID & property set")
                }

                findViewById<Button>(R.id.btnLogException).setOnClickListener {
                        GameMetrics.logException(RuntimeException("Test exception from sample app"))
                        toast("Exception logged")
                }

                findViewById<Button>(R.id.btnFlush).setOnClickListener {
                        GameMetrics.flush()
                        toast("Flush enqueued")
                }

                findViewById<Button>(R.id.btnForceCrash).setOnClickListener {
                        // Uncaught on the main thread — exercises the crash-safe upload path:
                        // the SDK logs the crash event and blocking-flushes before the process dies.
                        throw RuntimeException("Forced crash from sample app at ${System.currentTimeMillis()}")
                }
        }

        private fun toast(msg: String) {
                Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        }
}
