# Apokolips Android

Android companion app for:
- Blog: https://www.apokolips.xyz/blog.html
- Network Folder: https://www.apokolips.xyz/network-folder.html
- Uploader: https://www.apokolips.xyz/admin/blog-uploader/index.html
- Group Chat: native Android screen backed by the dedicated Apokolips Neon project (one public room; no private chats or sign-in)

## Architecture
A Kotlin Android shell with WebView reuses the existing Apokolips pages and server-side services. It adds native four-item navigation, Android file selection for upload forms, Download Manager support, external-link handling, and a native single-room public Group Chat. No website pages or backend services are copied or changed.

## Build
Requires JDK 17, Android SDK 35, and Gradle 8.9+.
Run from this directory: `gradle --no-daemon :app:assembleDebug`
APK: `app/build/outputs/apk/debug/app-debug.apk`

GitHub Actions builds the debug APK and stores it as a workflow artifact.

## Security
No database credentials or storage secrets are stored in the APK. Guest identity tokens are encrypted with an Android Keystore AES-GCM key. The chat backend uses Neon Auth anonymous JWTs only for API transport (email/password sign-in is disabled); the app still has no login or sign-up UI. The app's separate guest identity is stored encrypted locally, while PostgreSQL stores only its SHA-256 token hash, enforces unique nicknames, and uses short-lived presigned URLs for private media. Guest identity is device-local, not a cross-device account. Network Folder authentication remains with the existing service. HTTPS only; cleartext traffic is disabled.

## Group Chat

- One shared public room only; no private messages or additional rooms.
- Guest nickname registration with a database-enforced, case-normalized unique constraint.
- A random guest token is encrypted locally with Android Keystore and never stored in plaintext in the database.
- Text messages, profile photos, images, videos, documents, and recorded voice messages.
- Media storage uses a private Neon Object Storage bucket and short-lived presigned upload/download URLs.
- Voice recording uses the microphone only after the user grants Android runtime permission.
- The app refreshes the public message feed every three seconds; this is near-real-time polling rather than a persistent WebSocket subscription.
- Senders can delete their own text, media, and voice messages for everyone within one hour; PostgreSQL validates ownership and the deadline using server time, and attachment metadata is removed with the message.
- Upload limits: images/avatars 12 MB, videos 50 MB, documents 25 MB, voice 10 MB and up to 10 minutes.
