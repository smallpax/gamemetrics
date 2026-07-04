package com.gamemetrics.internal.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "events")
internal data class EventEntity(
        @PrimaryKey(autoGenerate = true)
        val id: Long = 0,
        @ColumnInfo(name = "event_name")
        val eventName: String,
        @ColumnInfo(name = "user_id")
        val userId: String?,
        @ColumnInfo(name = "session_id")
        val sessionId: String,
        @ColumnInfo(name = "params")
        val params: String?,
        @ColumnInfo(name = "timestamp")
        val timestamp: Long,
)
