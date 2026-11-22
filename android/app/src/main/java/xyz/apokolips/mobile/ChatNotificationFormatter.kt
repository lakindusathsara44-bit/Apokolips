package xyz.apokolips.mobile

internal data class ChatNotificationContent(
    val title: String,
    val body: String
)

internal object ChatNotificationFormatter {
    private const val MAX_TITLE_LENGTH = 64
    private const val MAX_BODY_LENGTH = 160

    fun format(sender: String?, body: String?, messageType: String?): ChatNotificationContent {
        val safeTitle = normalize(sender)
            .take(MAX_TITLE_LENGTH)
            .ifBlank { "Apokolips member" }

        val normalizedBody = normalize(body)
        val safeBody = when (messageType?.lowercase()) {
            "voice" -> "Voice message"
            "media" -> when (normalizedBody.lowercase()) {
                "photo" -> "Photo"
                "video" -> "Video"
                "attachment" -> "Attachment"
                "voice message" -> "Voice message"
                else -> "Attachment"
            }
            else -> normalizedBody
                .take(MAX_BODY_LENGTH)
                .ifBlank { "New message" }
        }

        return ChatNotificationContent(safeTitle, safeBody)
    }

    private fun normalize(value: String?): String =
        value.orEmpty().replace(Regex("[\\r\\n\\t]+"), " ").trim()
}
