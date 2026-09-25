plugins {
    id("com.android.application")
}

android {
    namespace = "cz.dobrodruzi.vexlcalc"
    compileSdk = 36

    defaultConfig {
        applicationId = "cz.dobrodruzi.vexlcalc"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.17.1")
}
