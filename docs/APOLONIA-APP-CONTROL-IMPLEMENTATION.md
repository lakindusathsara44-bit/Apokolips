# APOLONIA App Control — website-only implementation

## Product scope
- Platform: Apokolips website / PWA only.
- Interfaces: APOLONIA Text and APOLONIA Voice share one browser-side command and action module.
- Messaging channels: SMS, WhatsApp, Telegram and Gmail composer handoff.
- Trust model: contacts are explicitly saved in this browser on this device, with separate authorization for each channel.
- No Android companion application or native Android bridge is included in this scope.

## Browser module
`/apolonia/app-control/app-control.js` exposes `window.ApoloniaAppControl`:
- `saveTrustedContact({name, sms, whatsapp, telegram, gmail})`
- `listTrustedContacts()`
- `removeTrustedContact(id)`
- `findTrustedContact(name, app)`
- `parseCommand(text)`
- `openComposer({app, contactName, message, subject})`
- `manageTrustedContacts()`

The trusted-contact registry is stored in this browser's localStorage. It is not uploaded to the APOLONIA AI backend. Browser storage is local to the browser profile/device; it does not automatically synchronize between devices or browsers.

## Composer handoff
- SMS uses an `sms:` URI.
- WhatsApp uses a `https://wa.me/` link with prefilled text.
- Telegram uses a Telegram deep link; support and prefilled-text behavior vary by Telegram client and version.
- Gmail uses a `mailto:` link to open the user's configured mail application. This is not direct Gmail API sending.

The browser opens the appropriate composer for a previously authorized contact. The user must review the recipient and content and press Send in the destination app. This website does not silently send messages.

## Command formats
Text and Voice use the same parser. Supported examples:
- `send WhatsApp to Mano: I'll be 10 minutes late`
- `WhatsApp එකෙන් Manoට මම විනාඩි 10කින් එනවා කියලා පණිවිඩයක් යවන්න`

Voice recognition quality depends on the browser's speech-recognition service and selected recognition language. A spoken command may need to be phrased clearly or entered in Text mode.

## Security rules
- Trust is per contact and per channel (SMS, WhatsApp, Telegram, Gmail).
- Only the exact authorized contact/channel pair can open a composer.
- Contact details are not sent to the AI backend.
- Provide revoke/remove controls.
- Never treat trust as permission to message a different recipient.
- Show the selected recipient and message before the final send action.
- Do not auto-send OTPs, passwords, payment instructions or sensitive personal data.

## Web platform limitations
- A browser cannot reliably confirm that the target app is installed.
- Deep links may open a web fallback or fail depending on browser/device/app configuration.
- Popup restrictions may affect composer opening; direct user interaction is preferred.
- WhatsApp personal accounts do not provide a general browser API for silent sending.
- Telegram deep-link capabilities vary.
- `mailto:` opens a configured mail handler; it does not provide Gmail OAuth or guarantee that Gmail is selected.
- SMS handoff opens the device's SMS handler; browser code cannot send SMS silently.

## Verification checklist
1. Add a test contact with a country-code phone number and a Gmail address.
2. Authorize only the intended channels for that contact.
3. Try each supported command from APOLONIA Text.
4. Repeat from APOLONIA Voice where browser speech recognition supports the language.
5. Confirm the recipient and prefilled body in the target composer.
6. Confirm that no message is sent until the user taps Send.
7. Remove the trusted contact and confirm subsequent commands are rejected.
