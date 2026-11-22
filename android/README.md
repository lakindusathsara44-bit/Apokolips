# Apokolips Android

Android companion app for:
- Blog: https://www.apokolips.xyz/blog.html
- Network Folder: https://www.apokolips.xyz/network-folder.html
- Uploader: https://www.apokolips.xyz/admin/blog-uploader/index.html

## Architecture
A Kotlin Android shell with WebView reuses the existing Apokolips pages and server-side services. It adds native three-tab navigation, Android file selection for upload forms, Download Manager support, and external-link handling. No website pages or backend services are copied or changed.

## Build
Requires JDK 17, Android SDK 35, and Gradle 8.9+.
Run from this directory: `gradle --no-daemon :app:assembleDebug`
APK: `app/build/outputs/apk/debug/app-debug.apk`

GitHub Actions builds the debug APK and stores it as a workflow artifact.

## Security
No passwords or API secrets are stored here. Network Folder authentication remains with the existing service. HTTPS only; cleartext traffic is disabled.
