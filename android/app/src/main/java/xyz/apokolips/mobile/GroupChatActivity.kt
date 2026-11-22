package xyz.apokolips.mobile

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.OpenableColumns
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import java.security.SecureRandom
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import org.json.JSONArray
import org.json.JSONObject

class GroupChatActivity : Activity() {
    companion object {
        private const val API_BASE = "https://br-damp-glitter-b3tcauq8-chatapi.compute.c-4.ap-southeast-1.aws.neon.tech/"
        private const val AUTH_BASE = "https://ep-solitary-firefly-b3eweomh.neonauth.c-4.ap-southeast-1.aws.neon.tech/apokolips_chat/auth"
        private const val DATA_API_BASE = "https://ep-solitary-firefly-b3eweomh.apirest.c-4.ap-southeast-1.aws.neon.tech/apokolips_chat/rest/v1/"
        private const val PICK_FILE = 5101
        private const val RECORD_AUDIO_REQUEST = 5102
        private const val KEY_ALIAS = "apokolips_group_chat_identity_v1"
        private const val PREFS = "apokolips_group_chat_identity"
        private val BG = Color.rgb(5, 6, 8)
        private val PANEL = Color.rgb(10, 13, 18)
        private val CYAN = Color.rgb(55, 190, 255)
        private val WHITE = Color.rgb(239, 244, 250)
        private val MUTED = Color.rgb(142, 154, 171)
    }

    private val worker = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val refreshing = AtomicBoolean(false)
    private lateinit var root: LinearLayout
    private lateinit var messagesColumn: LinearLayout
    private lateinit var messagesScroll: ScrollView
    private lateinit var composer: EditText
    private lateinit var statusText: TextView
    private lateinit var recordButton: Button
    private lateinit var identityStore: GuestIdentityStore

    private var guestToken: String? = null
    private var guestId: String? = null
    private var nickname: String = ""
    private var joined = false
    private var lastRenderSignature = ""
    private var profileAvatarImage: ImageView? = null
    private var profileAvatarFallback: TextView? = null
    private var recorder: MediaRecorder? = null
    private var recordingFile: File? = null
    private var recordingStartedAt = 0L
    private var mediaPlayer: MediaPlayer? = null
    private var playingButton: Button? = null
    private var pendingPickerPurpose = "media"

    private val pollTask = object : Runnable {
        override fun run() {
            if (!joined || isFinishing) return
            loadMessages()
            mainHandler.postDelayed(this, 3000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = BG
        window.navigationBarColor = BG
        window.decorView.systemUiVisibility = 0
        identityStore = GuestIdentityStore(this)
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(BG)
            setPadding(dp(16), dp(12), dp(16), dp(12))
        }
        setContentView(root)
        restoreSession()
    }

    override fun onResume() {
        super.onResume()
        if (joined) startPolling()
    }

    override fun onPause() {
        mainHandler.removeCallbacks(pollTask)
        super.onPause()
    }

    private fun restoreSession() {
        val saved = identityStore.read()
        if (saved.isNullOrBlank()) {
            showJoinScreen()
            return
        }
        guestToken = saved
        worker.execute {
            try {
                val response = api("POST", "session", JSONObject().put("guestToken", saved), saved)
                val profile = JSONObject(response)
                runOnUiThread {
                    guestId = profile.optString("id")
                    nickname = profile.optString("nickname")
                    enterChat()
                }
            } catch (_: Exception) {
                identityStore.clear()
                guestToken = null
                runOnUiThread { showJoinScreen() }
            }
        }
    }

    private fun showJoinScreen() {
        joined = false
        mainHandler.removeCallbacks(pollTask)
        root.removeAllViews()
        addHeader("PUBLIC GROUP CHAT", "ONE ROOM  •  EVERYONE TOGETHER")
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(20), dp(26), dp(20), dp(24))
            background = rounded(PANEL, dp(22), Color.rgb(20, 38, 58))
        }
        panel.addView(TextView(this).apply {
            text = "◉"
            textSize = 38f
            gravity = Gravity.CENTER
            setTextColor(CYAN)
        }, matchWrap())
        panel.addView(TextView(this).apply {
            text = "Join the Apokolips community"
            textSize = 20f
            typeface = Typeface.create("sans-serif-semibold", Typeface.NORMAL)
            setTextColor(WHITE)
            gravity = Gravity.CENTER
            setPadding(0, dp(12), 0, dp(7))
        })
        panel.addView(TextView(this).apply {
            text = "Choose a unique nickname. No account, password or private chats."
            textSize = 13f
            setTextColor(MUTED)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(18))
        })
        val nicknameInput = EditText(this).apply {
            hint = "Your nickname (2–24 characters)"
            setSingleLine(true)
            textSize = 15f
            setTextColor(WHITE)
            setHintTextColor(MUTED)
            setPadding(dp(14), dp(13), dp(14), dp(13))
            background = rounded(Color.rgb(3, 5, 8), dp(13), Color.rgb(37, 62, 87))
        }
        panel.addView(nicknameInput, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dp(52)
        ))
        val join = actionButton("JOIN PUBLIC CHAT")
        join.setOnClickListener {
            val chosen = nicknameInput.text?.toString()?.trim().orEmpty()
            if (chosen.length !in 2..24) {
                toast("Nickname must be 2–24 characters.")
                return@setOnClickListener
            }
            join.isEnabled = false
            join.text = "CONNECTING…"
            worker.execute {
                val token = newGuestToken()
                try {
                    val response = api(
                        "POST", "register",
                        JSONObject().put("nickname", chosen).put("guestToken", token),
                        token
                    )
                    val profile = JSONObject(response)
                    identityStore.save(token)
                    runOnUiThread {
                        guestToken = token
                        guestId = profile.optString("id")
                        nickname = profile.optString("nickname")
                        enterChat()
                    }
                } catch (error: Exception) {
                    runOnUiThread {
                        join.isEnabled = true
                        join.text = "JOIN PUBLIC CHAT"
                        toast(
                            when {
                                error.message?.contains("nickname_taken") == true -> "That nickname is already taken."
                                error.message?.contains("invalid_nickname") == true -> "Use letters, numbers, spaces, . _ or -."
                                else -> "Could not join. Check your connection and try again."
                            }
                        )
                    }
                }
            }
        }
        panel.addView(join, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dp(50)
        ).apply { topMargin = dp(16) })
        root.addView(panel, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(30) })
        root.addView(TextView(this).apply {
            text = "Your nickname is reserved while this guest identity is kept on this device."
            textSize = 11f
            gravity = Gravity.CENTER
            setTextColor(MUTED)
            setPadding(dp(16), dp(16), dp(16), 0)
        })
    }

    private fun enterChat() {
        joined = true
        lastRenderSignature = ""
        root.removeAllViews()
        addHeader("PUBLIC GROUP CHAT", "ONE SHARED ROOM  •  NO PRIVATE MESSAGES")

        val profileRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(9), dp(12), dp(9))
            background = rounded(PANEL, dp(15), Color.rgb(17, 37, 57))
        }
        val avatarBox = FrameLayout(this)
        profileAvatarFallback = TextView(this).apply {
            text = nickname.take(1).uppercase()
            textSize = 17f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setTextColor(CYAN)
            background = rounded(Color.rgb(8, 30, 51), dp(24), Color.rgb(24, 85, 135))
        }
        avatarBox.addView(profileAvatarFallback, FrameLayout.LayoutParams(dp(38), dp(38)))
        profileAvatarImage = ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            background = rounded(Color.rgb(8, 30, 51), dp(24), Color.rgb(24, 85, 135))
            clipToOutline = true
            visibility = View.GONE
        }
        avatarBox.addView(profileAvatarImage, FrameLayout.LayoutParams(dp(38), dp(38)))
        profileRow.addView(avatarBox, LinearLayout.LayoutParams(dp(38), dp(38)))
        val profileInfo = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(10), 0, 0, 0)
        }
        profileInfo.addView(TextView(this).apply {
            text = nickname
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(WHITE)
        })
        profileInfo.addView(TextView(this).apply {
            text = "Guest profile"
            textSize = 11f
            setTextColor(MUTED)
        })
        profileRow.addView(profileInfo, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val avatarButton = smallButton("PHOTO")
        avatarButton.setOnClickListener { chooseFile("avatar") }
        profileRow.addView(avatarButton)
        root.addView(profileRow, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(10) })

        statusText = TextView(this).apply {
            text = "●  Connected to the public room"
            textSize = 11f
            setTextColor(Color.rgb(92, 190, 145))
            setPadding(dp(5), dp(9), 0, dp(5))
        }
        root.addView(statusText)

        messagesScroll = ScrollView(this).apply {
            isFillViewport = true
            clipToPadding = false
            setPadding(0, dp(4), 0, dp(8))
            overScrollMode = View.OVER_SCROLL_NEVER
        }
        messagesColumn = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        messagesScroll.addView(messagesColumn, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ))
        root.addView(messagesScroll, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f
        ).apply { topMargin = dp(4) })

        val composerPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(8), dp(8), dp(8), dp(8))
            background = rounded(PANEL, dp(18), Color.rgb(22, 43, 64))
        }
        val composerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        composer = EditText(this).apply {
            hint = "Write a message…"
            textSize = 14f
            minLines = 1
            maxLines = 4
            setTextColor(WHITE)
            setHintTextColor(MUTED)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            background = rounded(Color.rgb(3, 5, 8), dp(14), Color.rgb(25, 48, 70))
        }
        composerRow.addView(composer, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val send = smallButton("SEND")
        send.setOnClickListener { sendText() }
        composerRow.addView(send, LinearLayout.LayoutParams(dp(62), dp(44)).apply { leftMargin = dp(6) })
        composerPanel.addView(composerRow)
        val toolsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(2), dp(6), dp(2), 0)
        }
        val attach = smallButton("+  MEDIA")
        attach.setOnClickListener { chooseFile("media") }
        toolsRow.addView(attach, LinearLayout.LayoutParams(0, dp(38), 1f))
        recordButton = smallButton("●  VOICE")
        recordButton.setOnClickListener { toggleRecording() }
        toolsRow.addView(recordButton, LinearLayout.LayoutParams(0, dp(38), 1f).apply { leftMargin = dp(7) })
        composerPanel.addView(toolsRow)
        root.addView(composerPanel, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(7) })
        loadMessages()
        startPolling()
    }

    private fun addHeader(title: String, subtitle: String) {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(3), dp(2), dp(3), dp(10))
        }
        row.addView(TextView(this).apply {
            text = "APOKOLIPS"
            textSize = 20f
            letterSpacing = .2f
            typeface = Typeface.create("sans-serif-black", Typeface.NORMAL)
            setTextColor(CYAN)
        })
        row.addView(TextView(this).apply {
            text = title
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(WHITE)
            setPadding(0, dp(5), 0, dp(2))
        })
        row.addView(TextView(this).apply {
            text = subtitle
            textSize = 9f
            letterSpacing = .08f
            setTextColor(MUTED)
        })
        root.addView(row)
    }

    private fun sendText() {
        val text = composer.text?.toString()?.trim().orEmpty()
        if (text.isEmpty()) return
        composer.isEnabled = false
        worker.execute {
            try {
                api("POST", "messages", JSONObject().put("messageType", "text").put("body", text), guestToken)
                runOnUiThread {
                    composer.setText("")
                    composer.isEnabled = true
                    loadMessages()
                }
            } catch (_: Exception) {
                runOnUiThread {
                    composer.isEnabled = true
                    toast("Message could not be sent. Try again.")
                }
            }
        }
    }

    private fun startPolling() {
        mainHandler.removeCallbacks(pollTask)
        if (joined) mainHandler.postDelayed(pollTask, 1800L)
    }

    private fun loadMessages() {
        val token = guestToken ?: return
        if (!refreshing.compareAndSet(false, true)) return
        worker.execute {
            try {
                val response = api("GET", "messages?limit=40", null, token)
                val messages = JSONArray(response)
                runOnUiThread { renderMessages(messages) }
            } catch (_: Exception) {
                runOnUiThread {
                    if (::statusText.isInitialized) {
                        statusText.text = "●  Reconnecting…"
                        statusText.setTextColor(Color.rgb(220, 165, 80))
                    }
                }
            } finally {
                refreshing.set(false)
            }
        }
    }

    private fun renderMessages(messages: JSONArray) {
        if (!::messagesColumn.isInitialized) return
        val signature = if (messages.length() == 0) "empty" else {
            (0 until messages.length()).joinToString(":") { index ->
                messages.optJSONObject(index)?.optString("id").orEmpty()
            }
        }
        if (signature == lastRenderSignature) {
            statusText.text = "●  Connected to the public room"
            statusText.setTextColor(Color.rgb(92, 190, 145))
            return
        }
        lastRenderSignature = signature
        val wasNearBottom = messagesScroll.getChildAt(0)?.let {
            messagesScroll.scrollY + messagesScroll.height >= it.height - dp(120)
        } ?: true
        messagesColumn.removeAllViews()
        if (messages.length() == 0) {
            messagesColumn.addView(TextView(this).apply {
                text = "No messages yet. Say hello and start the conversation."
                textSize = 13f
                gravity = Gravity.CENTER
                setTextColor(MUTED)
                setPadding(dp(20), dp(45), dp(20), dp(45))
            })
        }
        for (i in 0 until messages.length()) {
            val message = messages.optJSONObject(i) ?: continue
            messagesColumn.addView(messageBubble(message), LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = dp(9) })
        }
        statusText.text = "●  Connected to the public room"
        statusText.setTextColor(Color.rgb(92, 190, 145))
        if (wasNearBottom) messagesScroll.post { messagesScroll.fullScroll(View.FOCUS_DOWN) }
    }

    private fun messageBubble(message: JSONObject): View {
        val mine = message.optString("guest_id") == guestId
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(10), dp(12), dp(10))
            background = rounded(
                if (mine) Color.rgb(7, 24, 40) else Color.rgb(10, 13, 18),
                dp(15),
                if (mine) Color.rgb(21, 78, 121) else Color.rgb(27, 38, 51)
            )
        }
        val authorRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val messageAvatarUrl = message.optString("avatarUrl")
        if (messageAvatarUrl.isNotBlank() && messageAvatarUrl != "null") {
            val avatar = ImageView(this).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                background = rounded(Color.rgb(8, 30, 51), dp(20), Color.rgb(24, 85, 135))
                clipToOutline = true
            }
            authorRow.addView(avatar, LinearLayout.LayoutParams(dp(28), dp(28)).apply { rightMargin = dp(8) })
            loadAvatar(messageAvatarUrl, avatar)
            if (mine) showProfileAvatar(messageAvatarUrl)
        }
        authorRow.addView(TextView(this).apply {
            text = message.optString("author_nickname", "Guest")
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(if (mine) CYAN else Color.rgb(155, 190, 220))
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        card.addView(authorRow)
        val body = message.optString("body")
        if (body.isNotBlank() && body != "null") {
            card.addView(TextView(this).apply {
                text = body
                textSize = 14f
                setTextColor(WHITE)
                setPadding(0, dp(5), 0, dp(3))
            })
        }
        val attachments = message.optJSONArray("attachments") ?: JSONArray()
        for (index in 0 until attachments.length()) {
            val item = attachments.optJSONObject(index) ?: continue
            val url = item.optString("url")
            val kind = item.optString("media_kind")
            val name = item.optString("original_filename", "Attachment")
            val fileButton = smallButton(
                when (kind) {
                    "voice" -> "▶  PLAY VOICE MESSAGE"
                    "image" -> "▧  OPEN IMAGE  •  $name"
                    "video" -> "▶  OPEN VIDEO  •  $name"
                    else -> "↗  OPEN FILE  •  $name"
                }
            )
            fileButton.setOnClickListener {
                if (kind == "voice") playVoice(url, fileButton)
                else openAttachment(url, item.optString("mime_type"))
            }
            card.addView(fileButton, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(42)
            ).apply { topMargin = dp(7) })
        }
        card.addView(TextView(this).apply {
            text = message.optString("created_at").take(16).replace("T", " ")
            textSize = 9f
            setTextColor(MUTED)
            gravity = Gravity.END
            setPadding(0, dp(5), 0, 0)
        })
        val messageId = message.optString("id")
        if (mine && messageId.isNotBlank() && canDeleteWithinHour(message.optString("created_at"))) {
            val deleteButton = smallButton("DELETE FOR EVERYONE")
            deleteButton.setTextColor(Color.rgb(255, 145, 145))
            deleteButton.setOnClickListener {
                AlertDialog.Builder(this)
                    .setTitle("Delete for everyone?")
                    .setMessage("This message or attachment will be removed for everyone in the public group. You can only do this within one hour of sending.")
                    .setNegativeButton("CANCEL", null)
                    .setPositiveButton("DELETE") { _, _ -> deleteMessageForEveryone(messageId) }
                    .show()
            }
            card.addView(deleteButton, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(38)
            ).apply { topMargin = dp(8) })
        }
        return card
    }

    private fun canDeleteWithinHour(createdAt: String): Boolean {
        return try {
            val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
                isLenient = false
            }
            val sentAt = formatter.parse(createdAt.take(19))?.time ?: return false
            val age = System.currentTimeMillis() - sentAt
            age in 0..3_600_000L
        } catch (_: Exception) {
            false
        }
    }

    private fun deleteMessageForEveryone(messageId: String) {
        val guest = guestToken ?: return
        toast("Deleting message…")
        worker.execute {
            try {
                val tokenConnection = (URL("$AUTH_BASE/token/anonymous").openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 15000
                    readTimeout = 20000
                    setRequestProperty("Accept", "application/json")
                }
                val jwtResponse = try {
                    val code = tokenConnection.responseCode
                    val stream = if (code in 200..299) tokenConnection.inputStream else tokenConnection.errorStream
                    val raw = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
                    if (code !in 200..299) throw IllegalStateException("Could not authorize deletion.")
                    val parsed = try { JSONObject(raw) } catch (_: Exception) { JSONObject() }
                    parsed.optString("token").ifBlank {
                        parsed.optString("accessToken").ifBlank {
                            parsed.optString("jwt").ifBlank { raw.trim().trim('"') }
                        }
                    }
                } finally {
                    tokenConnection.disconnect()
                }
                if (jwtResponse.isBlank()) throw IllegalStateException("Could not authorize deletion.")

                val connection = (URL(DATA_API_BASE + "rpc/chat_delete_message").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 15000
                    readTimeout = 25000
                    doOutput = true
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    setRequestProperty("Authorization", "Bearer $jwtResponse")
                }
                try {
                    connection.outputStream.use {
                        it.write(JSONObject()
                            .put("p_guest_token", guest)
                            .put("p_message_id", messageId)
                            .toString().toByteArray(Charsets.UTF_8))
                    }
                    val code = connection.responseCode
                    val stream = if (code in 200..299) connection.inputStream else connection.errorStream
                    val raw = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
                    if (code !in 200..299) {
                        val details = try {
                            val error = JSONObject(raw)
                            error.optString("message").ifBlank { error.optString("details") }
                        } catch (_: Exception) { raw }
                        throw IllegalStateException(details.ifBlank { "Delete failed." })
                    }
                } finally {
                    connection.disconnect()
                }
                runOnUiThread {
                    lastRenderSignature = ""
                    toast("Deleted for everyone.")
                    loadMessages()
                }
            } catch (error: Exception) {
                val reason = error.message.orEmpty()
                val message = when {
                    reason.contains("delete_window_expired") -> "The one-hour delete window has expired."
                    reason.contains("message_not_owned") -> "You can only delete your own messages."
                    reason.contains("message_not_found") -> "This message has already been deleted."
                    else -> "Could not delete this message. Try again."
                }
                runOnUiThread { toast(message) }
            }
        }
    }

    private fun showProfileAvatar(url: String) {
        val image = profileAvatarImage ?: return
        if (image.tag == url) return
        image.tag = url
        image.visibility = View.VISIBLE
        profileAvatarFallback?.visibility = View.GONE
        loadAvatar(url, image)
    }

    private fun loadAvatar(url: String, image: ImageView) {
        Thread {
            val bitmap = try {
                URL(url).openStream().use { BitmapFactory.decodeStream(it) }
            } catch (_: Exception) { null }
            if (bitmap != null) runOnUiThread {
                if (image.tag == null || image.tag == url) image.setImageBitmap(bitmap)
            }
        }.start()
    }

    private fun playVoice(url: String, button: Button) {
        if (url.isBlank()) return
        if (playingButton === button && mediaPlayer != null) {
            if (mediaPlayer?.isPlaying == true) {
                mediaPlayer?.pause()
                button.text = "▶  RESUME VOICE MESSAGE"
            } else {
                mediaPlayer?.start()
                button.text = "Ⅱ  PAUSE VOICE MESSAGE"
            }
            return
        }
        releasePlayer()
        button.text = "LOADING VOICE…"
        val player = MediaPlayer()
        mediaPlayer = player
        playingButton = button
        try {
            player.setDataSource(url)
            player.setOnPreparedListener {
                it.start()
                button.text = "Ⅱ  PAUSE VOICE MESSAGE"
            }
            player.setOnCompletionListener {
                button.text = "▶  PLAY VOICE MESSAGE"
                releasePlayer()
            }
            player.setOnErrorListener { _, _, _ ->
                button.text = "▶  PLAY VOICE MESSAGE"
                releasePlayer()
                toast("Voice message could not be played.")
                true
            }
            player.prepareAsync()
        } catch (_: Exception) {
            button.text = "▶  PLAY VOICE MESSAGE"
            releasePlayer()
        }
    }

    private fun releasePlayer() {
        try { mediaPlayer?.release() } catch (_: Exception) {}
        mediaPlayer = null
        playingButton = null
    }

    private fun openAttachment(url: String, mime: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(Uri.parse(url), mime.ifBlank { "*/*" })
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } catch (_: Exception) {
            toast("No app is available to open this file.")
        }
    }

    private fun chooseFile(purpose: String) {
        pendingPickerPurpose = purpose
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = if (purpose == "avatar") "image/*" else "*/*"
            if (purpose != "avatar") {
                putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(
                    "image/*", "video/*", "application/pdf", "text/plain",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    "audio/*"
                ))
            }
        }
        try { startActivityForResult(intent, PICK_FILE) }
        catch (_: Exception) { toast("Unable to open file picker.") }
    }

    @Deprecated("Android document picker result callback.")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != PICK_FILE || resultCode != Activity.RESULT_OK) return
        val uri = data?.data ?: return
        val mime = contentResolver.getType(uri) ?: "application/octet-stream"
        val kind = if (pendingPickerPurpose == "avatar") "avatar" else when {
            mime.startsWith("image/") -> "image"
            mime.startsWith("video/") -> "video"
            mime.startsWith("audio/") -> "voice"
            else -> "document"
        }
        uploadSelectedFile(uri, kind, mime)
    }

    private fun uploadSelectedFile(uri: Uri, kind: String, mime: String) {
        val size = queryFileSize(uri)
        if (size <= 0L) {
            toast("Could not read this file.")
            return
        }
        val max = when (kind) {
            "video" -> 50L * 1024 * 1024
            "document" -> 25L * 1024 * 1024
            "voice" -> 10L * 1024 * 1024
            else -> 12L * 1024 * 1024
        }
        if (size > max) {
            toast("This file is too large.")
            return
        }
        val filename = queryFileName(uri)
        toast("Uploading $filename…")
        worker.execute {
            try {
                val presign = JSONObject(api(
                    "POST", "media/presign",
                    JSONObject().put("kind", kind).put("contentType", mime).put("sizeBytes", size),
                    guestToken
                ))
                val objectKey = presign.getString("objectKey")
                putFile(presign.getString("uploadUrl"), uri, mime, size)
                if (kind == "avatar") {
                    api("POST", "profile/avatar", JSONObject().put("objectKey", objectKey), guestToken)
                    runOnUiThread {
                        lastRenderSignature = ""
                        toast("Profile picture updated.")
                        loadMessages()
                    }
                } else {
                    val messageType = if (kind == "voice") "voice" else "media"
                    val message = JSONObject(api(
                        "POST", "messages",
                        JSONObject().put("messageType", messageType),
                        guestToken
                    ))
                    val duration: Any = if (kind == "voice") 1 else JSONObject.NULL
                    api("POST", "attachments", JSONObject()
                        .put("messageId", message.getString("id"))
                        .put("objectKey", objectKey)
                        .put("mediaKind", kind)
                        .put("mimeType", mime)
                        .put("originalFilename", filename)
                        .put("sizeBytes", size)
                        .put("durationMs", duration), guestToken)
                    runOnUiThread {
                        toast("Sent.")
                        loadMessages()
                    }
                }
            } catch (error: Exception) {
                runOnUiThread { toast(error.message ?: "Upload failed.") }
            }
        }
    }

    private fun toggleRecording() {
        if (recorder != null) {
            stopRecordingAndSend()
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), RECORD_AUDIO_REQUEST)
            return
        }
        startRecording()
    }

    private fun startRecording() {
        try {
            val file = File(cacheDir, "apo-voice-" + System.currentTimeMillis() + ".m4a")
            val mediaRecorder = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(this) else MediaRecorder()
            mediaRecorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            mediaRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            mediaRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            mediaRecorder.setAudioEncodingBitRate(96000)
            mediaRecorder.setAudioSamplingRate(44100)
            mediaRecorder.setOutputFile(file.absolutePath)
            mediaRecorder.prepare()
            mediaRecorder.start()
            recorder = mediaRecorder
            recordingFile = file
            recordingStartedAt = SystemClock.elapsedRealtime()
            recordButton.text = "■  STOP & SEND"
            recordButton.setTextColor(Color.rgb(255, 125, 125))
            toast("Recording… tap STOP & SEND when finished.")
        } catch (_: Exception) {
            recorder = null
            toast("Microphone could not start.")
        }
    }

    private fun stopRecordingAndSend() {
        val active = recorder ?: return
        val file = recordingFile
        val duration = (SystemClock.elapsedRealtime() - recordingStartedAt).toInt()
        try {
            active.stop()
            active.release()
        } catch (_: Exception) {
            try { active.reset(); active.release() } catch (_: Exception) {}
        }
        recorder = null
        recordingFile = null
        recordButton.text = "●  VOICE"
        recordButton.setTextColor(WHITE)
        if (file == null || duration < 1000 || !file.exists() || file.length() == 0L) {
            file?.delete()
            toast("Record at least one second of audio.")
            return
        }
        uploadLocalVoice(file, duration)
    }

    private fun uploadLocalVoice(file: File, durationMs: Int) {
        toast("Sending voice message…")
        worker.execute {
            try {
                val mime = "audio/mp4"
                val size = file.length()
                val presign = JSONObject(api(
                    "POST", "media/presign",
                    JSONObject().put("kind", "voice").put("contentType", mime).put("sizeBytes", size),
                    guestToken
                ))
                val objectKey = presign.getString("objectKey")
                putLocalFile(presign.getString("uploadUrl"), file, mime, size)
                val message = JSONObject(api(
                    "POST", "messages",
                    JSONObject().put("messageType", "voice"),
                    guestToken
                ))
                api("POST", "attachments", JSONObject()
                    .put("messageId", message.getString("id"))
                    .put("objectKey", objectKey)
                    .put("mediaKind", "voice")
                    .put("mimeType", mime)
                    .put("originalFilename", "Voice message.m4a")
                    .put("sizeBytes", size)
                    .put("durationMs", durationMs.coerceIn(1, 600000)), guestToken)
                file.delete()
                runOnUiThread {
                    toast("Voice message sent.")
                    loadMessages()
                }
            } catch (_: Exception) {
                runOnUiThread { toast("Voice message could not be sent.") }
            }
        }
    }

    private fun putFile(uploadUrl: String, uri: Uri, mime: String, size: Long) {
        val connection = (URL(uploadUrl).openConnection() as HttpURLConnection).apply {
            requestMethod = "PUT"
            doOutput = true
            connectTimeout = 20000
            readTimeout = 120000
            setRequestProperty("Content-Type", mime)
            setFixedLengthStreamingMode(size)
        }
        try {
            val input = contentResolver.openInputStream(uri) ?: throw IllegalStateException("file_unavailable")
            input.use { source ->
                connection.outputStream.use { output -> source.copyTo(output, 16 * 1024) }
            }
            if (connection.responseCode !in 200..299) throw IllegalStateException("upload_failed")
        } finally {
            connection.disconnect()
        }
    }

    private fun putLocalFile(uploadUrl: String, file: File, mime: String, size: Long) {
        val connection = (URL(uploadUrl).openConnection() as HttpURLConnection).apply {
            requestMethod = "PUT"
            doOutput = true
            connectTimeout = 20000
            readTimeout = 120000
            setRequestProperty("Content-Type", mime)
            setFixedLengthStreamingMode(size)
        }
        try {
            file.inputStream().use { input ->
                connection.outputStream.use { output -> input.copyTo(output, 16 * 1024) }
            }
            if (connection.responseCode !in 200..299) throw IllegalStateException("upload_failed")
        } finally {
            connection.disconnect()
        }
    }

    private fun queryFileSize(uri: Uri): Long {
        return try {
            contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getLong(0) else -1L
            } ?: -1L
        } catch (_: Exception) { -1L }
    }

    private fun queryFileName(uri: Uri): String {
        return try {
            contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else "file"
            } ?: "file"
        } catch (_: Exception) { "file" }
    }

    private fun api(method: String, path: String, body: JSONObject?, token: String?): String {
        val connection = (URL(API_BASE + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15000
            readTimeout = 25000
            setRequestProperty("Accept", "application/json")
            token?.let { setRequestProperty("X-Guest-Token", it) }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        try {
            if (body != null) {
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val response = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            if (code !in 200..299) {
                val message = try { JSONObject(response).optString("error", "request_failed") } catch (_: Exception) { "request_failed" }
                throw IllegalStateException(message)
            }
            return response
        } finally {
            connection.disconnect()
        }
    }

    private fun newGuestToken(): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }

    private inner class GuestIdentityStore(context: Context) {
        private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        private fun key(): SecretKey {
            val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
            val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            generator.init(KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build())
            return generator.generateKey()
        }

        fun save(value: String) {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key())
            val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
            prefs.edit()
                .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
                .putString("token", Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .apply()
        }

        fun read(): String? {
            return try {
                val iv = Base64.decode(prefs.getString("iv", null), Base64.NO_WRAP)
                val encrypted = Base64.decode(prefs.getString("token", null), Base64.NO_WRAP)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.DECRYPT_MODE, key(), javax.crypto.spec.GCMParameterSpec(128, iv))
                String(cipher.doFinal(encrypted), Charsets.UTF_8)
            } catch (_: Exception) {
                clear()
                null
            }
        }

        fun clear() {
            prefs.edit().clear().apply()
        }
    }

    private fun actionButton(label: String) = Button(this).apply {
        text = label
        textSize = 12f
        letterSpacing = .06f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(WHITE)
        isAllCaps = false
        background = rounded(Color.rgb(7, 55, 96), dp(14), Color.rgb(35, 119, 181))
    }

    private fun smallButton(label: String) = Button(this).apply {
        text = label
        textSize = 10f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(WHITE)
        isAllCaps = false
        minHeight = 0
        minimumHeight = 0
        setPadding(dp(7), 0, dp(7), 0)
        background = rounded(Color.rgb(5, 28, 48), dp(12), Color.rgb(24, 76, 117))
    }

    private fun rounded(color: Int, radius: Int, stroke: Int) = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = radius.toFloat()
        setColor(color)
        setStroke(dp(1), stroke)
    }

    private fun matchWrap() = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
    )

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == RECORD_AUDIO_REQUEST) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) startRecording()
            else toast("Microphone permission is needed for voice messages.")
        }
    }

    override fun onDestroy() {
        joined = false
        mainHandler.removeCallbacksAndMessages(null)
        try {
            recorder?.stop()
            recorder?.release()
        } catch (_: Exception) {}
        recorder = null
        releasePlayer()
        worker.shutdownNow()
        super.onDestroy()
    }
}
