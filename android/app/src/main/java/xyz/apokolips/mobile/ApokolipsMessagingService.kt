package xyz.apokolips.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.graphics.Color
import android.os.Build
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class ApokolipsMessagingService : FirebaseMessagingService() {
    companion object {
        const val CHANNEL_ID = "apokolips_group_chat"
        private const val CHANNEL_NAME = "Group Chat"
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        if (GroupChatActivity.isVisible) return

        val data = message.data
        val messageId = data["message_id"].orEmpty()
        val content = ChatNotificationFormatter.format(
            sender = data["title"],
            body = data["body"],
            messageType = data["message_type"]
        )
        showNotification(content, messageId)
    }

    private fun showNotification(content: ChatNotificationContent, messageId: String) {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        ensureChannel(manager)

        val openChat = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("open_group_chat", true)
            putExtra("notification_message_id", messageId)
        }
        val requestCode = messageId.hashCode()
        val pendingIntent = PendingIntent.getActivity(
            this,
            requestCode,
            openChat,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            Notification.Builder(this)
                .setPriority(Notification.PRIORITY_HIGH)
        }

        val notification = builder
            .setSmallIcon(R.drawable.ic_stat_chat)
            .setColor(Color.rgb(55, 190, 255))
            .setContentTitle(content.title)
            .setContentText(content.body)
            .setStyle(Notification.BigTextStyle().bigText(content.body))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .build()

        val stableId = if (messageId.isBlank()) System.currentTimeMillis().toInt() else messageId.hashCode()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            manager.notify("apokolips-chat-" + messageId, stableId, notification)
        } else {
            manager.notify(stableId, notification)
        }
    }

    private fun ensureChannel(manager: NotificationManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "New messages in the Apokolips public Group Chat"
                enableVibration(true)
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            }
            manager.createNotificationChannel(channel)
        }
    }
}
