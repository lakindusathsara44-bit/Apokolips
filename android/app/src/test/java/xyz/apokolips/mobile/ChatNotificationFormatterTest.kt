package xyz.apokolips.mobile

import org.junit.Assert.assertEquals
import org.junit.Test

class ChatNotificationFormatterTest {
    @Test
    fun textPreviewIsWhitespaceNormalizedAndLengthLimited() {
        val content = ChatNotificationFormatter.format(
            sender = "  Mano  ",
            body = "Hello\nthere\tfrom the group",
            messageType = "text"
        )

        assertEquals("Mano", content.title)
        assertEquals("Hello there from the group", content.body)
    }

    @Test
    fun voiceNotificationNeverExposesAnAttachmentFilename() {
        val content = ChatNotificationFormatter.format(
            sender = "Nimal",
            body = "private-recording.m4a",
            messageType = "voice"
        )

        assertEquals("Voice message", content.body)
    }

    @Test
    fun mediaNotificationUsesOnlySafeGenericLabels() {
        assertEquals(
            "Photo",
            ChatNotificationFormatter.format("Alice", "Photo", "media").body
        )
        assertEquals(
            "Attachment",
            ChatNotificationFormatter.format("Alice", "secret-file.pdf", "media").body
        )
    }

    @Test
    fun emptySenderAndBodyUseSafeFallbacks() {
        val content = ChatNotificationFormatter.format(" ", " ", "text")

        assertEquals("Apokolips member", content.title)
        assertEquals("New message", content.body)
    }

    @Test
    fun textPreviewIsLimitedToOneHundredSixtyCharacters() {
        val content = ChatNotificationFormatter.format(
            "Alice",
            "x".repeat(300),
            "text"
        )

        assertEquals(160, content.body.length)
    }
}
