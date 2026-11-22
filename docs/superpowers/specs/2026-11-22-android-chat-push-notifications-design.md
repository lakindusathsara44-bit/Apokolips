# Android Group Chat Push Notifications — Design

## Intent
Deliver WhatsApp-style notifications for the one public Apokolips Android Group Chat when the app is backgrounded or closed, without adding accounts, private chats, or changing existing message/media storage.

## Goals
- Register each app installation's FCM token against its existing guest identity.
- Notify other registered installations after a text message or attachment is successfully created.
- Show sender nickname and a safe message preview; tapping opens the native Group Chat.
- Respect Android 13+ notification permission and notification-channel rules.
- Keep existing chat API behavior by placing a narrow proxy in front of the existing chatapi Function.
- Remove invalid FCM tokens and prevent duplicate notifications for one message.

## Non-goals
- No Firebase Authentication, user accounts, private chats, or new chat rooms.
- No changes to Blog, Uploader, Network Folder, or other Neon projects.
- No replacement of the existing chatapi Function source (it is not stored in this repository).
- No claim that Android can always deliver notifications after a user force-stops the app or disables notifications.

## Current architecture
- Native Kotlin GroupChatActivity calls the dedicated Neon chatapi Function.
- Messages are polled every three seconds while the chat screen is active.
- Neon Realtime is already enabled on the dedicated chat project, but the native app does not currently subscribe to it.
- The Android module has no Firebase configuration or FCM service yet.
- The repository's existing Blog push flow is Web Push/VAPID in a separate Supabase Edge Function; it is not Android FCM.

## Approach
1. Add Firebase Cloud Messaging to the Android client. Keep Firebase config optional for CI until the owner supplies the Firebase project's google-services.json; the app remains usable without it.
2. Add a separate Neon chatpush Function that allowlists and transparently proxies the existing chatapi routes, registers/unregisters FCM device tokens, and sends FCM v1 notifications after successful text-message or attachment writes.
3. Add additive SQL objects only in the dedicated apokolips-group-chat project. Store device tokens in a private table, validate guest tokens server-side, protect notification dispatch with a server-only secret, and deduplicate by message ID.
4. Keep the current three-second polling as a safe foreground fallback. Push notifications are for background/closed-app delivery; this change does not claim native foreground sync is already Neon Realtime.

## Security and privacy
- Never ship a Firebase service-account key or dispatch secret in the APK or Git repository.
- Do not expose device tokens or dispatch targets through public Data API reads.
- Use the existing guest token only for ownership validation; continue storing its SHA-256 hash in the database.
- Only the new proxy may access FCM credentials. The existing chatapi Function remains unchanged.
- Notifications omit message content for media except a generic type label; text previews are length-limited.

## External setup required
- Register Android package IDs `xyz.apokolips.mobile` and `xyz.apokolips.mobile.debug` in one Firebase project and add its `google-services.json` to `android/app/`.
- Configure a Firebase service-account JSON and the dispatch secret as private Neon Function environment variables. Neither belongs in source control.
- Verify delivery on a real Android device with Google Play services and notification permission granted.

## Acceptance criteria
- Existing join, profile, text, media, voice, delete, and download flows continue through the proxy.
- A successful text message produces at most one notification per other registered installation.
- A successful media/voice attachment produces one generic attachment notification.
- The sender's own devices are excluded.
- Android 13+ permission denial does not crash or block chat.
- Tapping a notification opens the native Group Chat.
- Invalid FCM tokens are removed; missing Firebase credentials disable push sending without breaking chat API calls.
