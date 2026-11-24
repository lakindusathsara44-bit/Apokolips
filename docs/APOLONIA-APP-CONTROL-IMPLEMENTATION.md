# APOLONIA App Control — implementation foundation

## Selected product decisions
- Targets: Apokolips website and a future Android companion application.
- Input surfaces: APOLONIA Text and APOLONIA Voice share one command/action contract.
- Trust model: contacts are explicitly saved on-device; authorization is channel-specific.
- Data minimization: the browser contact registry stays in localStorage and is not sent to the AI API.
- Safety: opening a composer is allowed for an authorized contact, but the user must complete the final Send action in the target app. No hidden/background sending.

## Current web foundation
`app-control.js` exposes `window.ApoloniaAppControl`:
- `saveTrustedContact({name, phone, email, sms, whatsapp, telegram, gmail})`
- `listTrustedContacts()`
- `removeTrustedContact(id)`
- `findTrustedContact(name, app)`
- `openComposer({app, contactName, message, subject})`
- `manageTrustedContacts()`

Supported composer routes:
- SMS: `sms:` URI
- WhatsApp: `https://wa.me/` with prefilled text
- Telegram: `tg://resolve` phone deep link
- Gmail: `mailto:` composer

The exact target app must be installed/configured for its deep link to work. Browser popup restrictions may require a direct user gesture. Telegram deep-link behavior varies by client and may fall back to a browser.

## Native Android milestone
The current repository is a web/PWA project; no Android application module or AndroidManifest was found in the inspected paths. A native Android companion is therefore a separate deliverable, not something this browser script can impersonate.

Recommended implementation:
1. Kotlin + AndroidX Activity (or a Capacitor shell after selecting the packaging approach).
2. A narrow JavaScript bridge exposing only `openComposer`, contact authorization and app availability.
3. SMS composer via `Intent.ACTION_SENDTO` + `smsto:`; do not request `SEND_SMS` for the first release.
4. WhatsApp via its supported share/deep-link routes; personal WhatsApp does not offer unrestricted silent sending.
5. Telegram via supported share/deep-link routes; confirm compatibility against installed Telegram version.
6. Gmail: OAuth 2.0 with least-privilege Gmail send scope, secure token storage, explicit account selection and revocation. `mailto:` is the first web fallback.
7. Store trusted contacts in Android Keystore-protected app storage or encrypted local database; never expose the full address book to the model.

## Permission and confirmation rules
- Trust is per contact AND per channel (SMS, WhatsApp, Telegram, Gmail).
- A trusted contact is not blanket consent to message anyone else or to send arbitrary content.
- The assistant must show the exact recipient and message before invoking the composer.
- The external app owns the final send step unless an official API and separately granted permission explicitly support sending.
- Never auto-send OTPs, passwords, financial instructions, or sensitive personal data.
- Provide revoke/remove controls and an audit trail of initiated actions.

## Known limitations
- Web browsers cannot reliably determine whether a target app is installed.
- Browser deep links cannot guarantee that WhatsApp/Telegram messages are sent.
- Gmail direct API sending requires OAuth consent and backend token handling; it is not enabled by this foundation.
- SMS direct sending is restricted on Android and is intentionally not enabled in this phase.
