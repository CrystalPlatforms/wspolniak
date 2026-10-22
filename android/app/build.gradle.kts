plugins {
    id("com.android.application")
}

android {
    namespace = "com.wspolniak.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.wspolniak.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 2
        versionName = "1.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.activity:activity:1.9.3")
    // WebViewAssetLoader — serwowanie bajtów content:// pod stałym https hostem (#222)
    implementation("androidx.webkit:webkit:1.12.1")
    testImplementation("junit:junit:4.13.2")

    // kotlin-stdlib ≥1.8 zawiera już klasy jdk7/jdk8 w środku; starsze artefakty androidx
    // ciągną warianty 1.6.21 → duplikaty klas na classpath. Wyrównanie do 1.8.22 zamienia
    // je w puste forwardery (oficjalna poprawka d.android.com/r/tools/classpath-sync-errors).
    constraints {
        implementation("org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.8.22")
        implementation("org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.8.22")
    }
}
