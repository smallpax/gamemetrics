package com.gamemetrics.internal.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [EventEntity::class], version = 1, exportSchema = false)
internal abstract class GameMetricsDatabase : RoomDatabase() {
        abstract fun eventDao(): EventDao

        companion object {
                fun create(context: Context): GameMetricsDatabase {
                        return Room.databaseBuilder(
                                context.applicationContext,
                                GameMetricsDatabase::class.java,
                                "gamemetrics-events",
                        ).build()
                }
        }
}
