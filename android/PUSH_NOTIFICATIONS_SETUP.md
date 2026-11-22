# Apokolips Android Group Chat Push Notifications

## Firebase Android app setup

The Android client uses Firebase Cloud Messaging (FCM). The Firebase configuration file is intentionally not committed by this change.

1. Open the Firebase Console and create or select the Firebase project used only for Apokolips Android push notifications.
2. Register **both** Android package IDs:
   - Release: `xyz.apokolips.mobile`
   - Debug APK: `xyz.apokolips.mobile.debug`
3. Download the combined `google-services.json` after both Android apps are registered.
4. Place the file at `android/app/google-services.json`. It contains public app identifiers, not a service-account private key.
5. Build and install the debug APK. The first time the guest joins Group Chat, Android 13+ asks for notification permission. Chat remains usable if permission is denied.

The Gradle Google Services plugin is applied only when this file exists, so repository CI can still build before Firebase is configured.

## Configure server-side FCM credentials

Never put a Firebase service-account JSON file, private key, FCM token, or dispatch secret in the APK or Git repository.

1. In the Google Cloud project linked to Firebase, enable the Firebase Cloud Messaging API.
2. Create a service account with the **Firebase Cloud Messaging API Admin** role and generate a JSON key.
3. In Neon Console, open the dedicated `apokolips-group-chat` project, default branch, Functions, then `chatpush`.
4. Add the environment variable `FCM_SERVICE_ACCOUNT_JSON` with the complete service-account JSON content.
5. Keep the existing `CHAT_PUSH_DISPATCH_SECRET` environment variable unchanged. It is generated and matched to a hash in the private database settings table; never share it.
6. Redeploy the `chatpush` Function after saving the environment.

The function also requires these branch-scoped values:
- `UPSTREAM_CHAT_API_URL`: existing `chatapi` Function URL
- `DATA_API_URL`: dedicated chat database Data API URL
- `NEON_AUTH_BASE_URL`: dedicated chat database Neon Auth URL
- `CHAT_PUSH_DISPATCH_SECRET`: server-only dispatch secret

## Delivery behavior

- The native app registers one FCM token per installation against the existing guest identity.
- Text messages and completed media/voice attachments sent through the updated APK notify other registered installations, never the sender's own installation.
- Everyone who sends messages should update to the new APK. Older APKs still calling the original `chatapi` endpoint do not pass through the push dispatcher.
- Text previews are limited to 160 characters. Media/voice notifications use generic labels; filenames are not exposed.
- Tapping a notification opens the native Group Chat.
- The app suppresses push banners while the Group Chat itself is visible; its existing foreground message refresh remains active.
- Invalid FCM tokens are removed from the private device table.
- If Firebase credentials are not configured, chat API requests still work, but push delivery remains disabled.

## Android delivery limitations

Push notifications require Google Play services and Android notification permission. Android battery restrictions, network availability, user-disabled notifications, and a force-stop from system settings can delay or prevent delivery until the app is opened again. This is an operating-system limitation, not a chat-data failure.

## Verification checklist

- Install the debug APK on a physical Android device with Google Play services.
- Join Group Chat and allow notifications.
- Install the same build on a second device using a different guest identity.
- Send text, image, video, document, and voice messages from the other device.
- Confirm the sender receives no notification on their own device.
- Background the receiving app, tap a notification, and confirm it opens Group Chat.
- Deny notification permission on a test device and confirm chat still works.
