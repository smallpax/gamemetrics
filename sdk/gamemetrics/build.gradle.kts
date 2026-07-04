plugins {
        alias(libs.plugins.android.library)
        alias(libs.plugins.ksp)
}

android {
        namespace = "com.gamemetrics"
        compileSdk {
                version = release(36) {
                        minorApiLevel = 1
                }
        }

        defaultConfig {
                minSdk = 24
                consumerProguardFiles("consumer-rules.pro")
        }

        compileOptions {
                sourceCompatibility = JavaVersion.VERSION_11
                targetCompatibility = JavaVersion.VERSION_11
        }
}

dependencies {
        implementation(libs.androidx.core.ktx)
        implementation(libs.room.runtime)
        implementation(libs.room.ktx)
        ksp(libs.room.compiler)
        implementation(libs.work.runtime.ktx)
        implementation(libs.kotlinx.coroutines.android)
        implementation(libs.lifecycle.process)
        implementation(libs.lifecycle.common)
}
