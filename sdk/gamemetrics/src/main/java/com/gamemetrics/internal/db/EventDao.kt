package com.gamemetrics.internal.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query

@Dao
internal interface EventDao {
        @Insert
        suspend fun insert(event: EventEntity)

        @Query("SELECT * FROM events ORDER BY timestamp ASC LIMIT :limit")
        suspend fun getOldest(limit: Int = 100): List<EventEntity>

        @Query("DELETE FROM events WHERE id IN (:ids)")
        suspend fun deleteByIds(ids: List<Long>)
}
