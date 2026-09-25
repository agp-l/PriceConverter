# VexlCalc for Android

Android project in Kotlin with the **entire current PWA bundled in the APK**. The UI, calculations, 13 languages, local preferences and offline cached rates use the same source files as the website. The Kotlin activity provides the app window, secure local asset loading, Android share sheet, external links and Back behavior. This is a hybrid Android app; the calculators still run in JavaScript. It requires an Android WebView implementation (normally preinstalled).

The web UI opens from `https://appassets.androidplatform.net/assets/www/index.html` via AndroidX `WebViewAssetLoader`. It never navigates to the hosted website. Files under `app/src/main/assets/www/` are a snapshot of the root PWA; the only external data requests are the existing CoinGecko, BitPay and Blockchain.info rate APIs and TradingView charts. No extra data provider or application server is introduced. A missing connection leaves the app shell available; as on the website, rates require a previously saved cache and charts need internet.

## Build and install

1. Open the `android/` directory as a project in Android Studio with JDK 17 and Android SDK 36. Sync Gradle (version 9.4.1 or newer) and run `:app:assembleDebug`.
2. Alternatively, download the `VexlCalc-debug-apk` artifact from the latest successful **Android APK** GitHub Actions run on `main`. Unzip it to get `app-debug.apk`.
3. Install the APK on Android 8.0 or newer. With ADB: `adb install -r app-debug.apk`.

The CI artifact is a **debug signed** APK for testing. For distribution, create and securely store your own release signing key; the repository does not contain one.

## Keep the two copies synchronized

After editing the root web app, run `python3 android/sync-web.py`. The CI workflow runs `python3 android/sync-web.py --check` and fails when the snapshots differ. The APK code stays within `android/`; the web version continues to run at the repository root.

Android uses the system WebView for rendering. Its Web Share button opens the native Android chooser, and external BTC/Lightning links open a compatible installed wallet. The PWA installation prompt is hidden because the APK is already installed. The PWA service worker is skipped inside the APK because the bundled assets are already available offline.
