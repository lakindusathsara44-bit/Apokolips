plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Firebase config is supplied by the project owner; CI remains buildable before it is added.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

}
android {
    namespace = "xyz.apokolips.mobile"
    compileSdk = 35
    defaultConfig {
        applicationId = "xyz.apokolips.mobile"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:35.2.0"))
    implementation("com.google.firebase:firebase-messaging")
    testImplementation("junit:junit:4.13.2")
}
}
