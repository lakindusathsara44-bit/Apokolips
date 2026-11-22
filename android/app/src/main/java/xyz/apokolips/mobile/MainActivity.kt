package xyz.apokolips.mobile

import android.app.Activity
import android.app.DownloadManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.graphics.drawable.GradientDrawable
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var subtitle: TextView
    private lateinit var tabs: LinearLayout
    private lateinit var pageProgress: ProgressBar
    private lateinit var appRoot: FrameLayout
    private var currentTab = 0
    private var lastWebTab = 1
    private var chatLaunchPending = false
    private var chooser: ValueCallback<Array<Uri>>? = null
    private val uiUpdateHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private val uiUpdateExecutor = Executors.newSingleThreadExecutor()
    @Volatile private var remoteUiVersion = "1"
    @Volatile private var remoteUiStylesheet = "https://www.apokolips.xyz/app-ui.css?v=1"

    private val uiUpdatePoll = object : Runnable {
        override fun run() {
            checkRemoteUiManifest(reloadWhenChanged = true)
            uiUpdateHandler.postDelayed(this, 5 * 60 * 1000L)
        }
    }

    private val urls = listOf(
        "https://www.apokolips.xyz/blog.html",
        "https://www.apokolips.xyz/network-folder.html",
        "https://www.apokolips.xyz/admin/blog-uploader/index.html"
    )
    private val labels = listOf("Group Chat", "Blog", "Uploader", "Network Folder")
    private val icons = listOf("◉", "▤", "↑", "▣")

    companion object {
        private const val PICK_FILE = 4107
        private val BG = Color.rgb(5, 6, 9)
        private val PANEL = Color.rgb(2, 3, 5)
        private val BLUE = Color.rgb(24, 45, 73)
        private val CYAN = Color.rgb(55, 190, 255)
        private val WHITE = Color.rgb(242, 245, 250)
        private val MUTED = Color.rgb(143, 153, 170)
    }

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        window.statusBarColor = BG
        window.navigationBarColor = BG
        createUi()
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        val launchTab = if (intent.getBooleanExtra("open_group_chat", false)) 0 else (state?.getInt("tab") ?: 0)
        openTab(launchTab)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getBooleanExtra("open_group_chat", false)) {
            openTab(0)
            intent.removeExtra("open_group_chat")
        }
    }

    override fun onResume() {
        super.onResume()
        checkRemoteUiManifest(reloadWhenChanged = true)
        uiUpdateHandler.removeCallbacks(uiUpdatePoll)
        uiUpdateHandler.postDelayed(uiUpdatePoll, 5 * 60 * 1000L)
        if (chatLaunchPending) {
            chatLaunchPending = false
            currentTab = 0
            subtitle.text = "IDEAS BECOME SOMETHING REAL.  /  GROUP CHAT"
            styleTabs()
        }
    }

    override fun onPause() {
        uiUpdateHandler.removeCallbacks(uiUpdatePoll)
        super.onPause()
    }

    private fun createUi() {
        appRoot = FrameLayout(this).apply { setBackgroundColor(BG) }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(BG)
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(16), dp(20), dp(10))
            setBackgroundColor(BG)
        }
        val brandRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val brandStack = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        brandStack.addView(TextView(this).apply {
            text = "APOKOLIPS"
            textSize = 22f
            letterSpacing = .22f
            setTextColor(CYAN)
            typeface = Typeface.create("sans-serif-black", Typeface.NORMAL)
            setShadowLayer(dp(12).toFloat(), 0f, 0f, Color.argb(85, 55, 190, 255))
        })
        subtitle = TextView(this).apply {
            text = "IDEAS BECOME SOMETHING REAL."
            textSize = 9f
            letterSpacing = .18f
            setTextColor(MUTED)
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            setPadding(0, dp(4), 0, 0)
        }
        brandStack.addView(subtitle)
        brandRow.addView(brandStack)
        val refresh = TextView(this).apply {
            text = "↻"
            textSize = 24f
            gravity = Gravity.CENTER
            setTextColor(CYAN)
            contentDescription = "Refresh current page"
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(14).toFloat()
                setColor(Color.rgb(4, 6, 10))
                setStroke(dp(1), Color.rgb(13, 42, 72))
            }
            setOnClickListener {
                if (::web.isInitialized) {
                    pageProgress.visibility = View.VISIBLE
                    web.reload()
                }
            }
        }
        brandRow.addView(refresh, LinearLayout.LayoutParams(dp(46), dp(46)))
        header.addView(brandRow)
        content.addView(header)

        pageProgress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
            isIndeterminate = false
            progressTintList = android.content.res.ColorStateList.valueOf(CYAN)
            progressBackgroundTintList = android.content.res.ColorStateList.valueOf(Color.rgb(3, 4, 6))
            visibility = View.VISIBLE
        }
        content.addView(pageProgress, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dp(2)
        ))

        web = WebView(this).apply {
            setBackgroundColor(BG)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.loadsImagesAutomatically = true
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.allowFileAccess = false
            settings.allowContentAccess = true
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            settings.textZoom = 100
            isVerticalScrollBarEnabled = false
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val uri = request.url
                    val allowed = urls.any { allowedUrl ->
                        val page = Uri.parse(allowedUrl)
                        uri.scheme.equals("https", ignoreCase = true) &&
                            uri.host.equals(page.host, ignoreCase = true) &&
                            uri.port == page.port &&
                            uri.path == page.path
                    }
                    if (allowed) return false

                    Toast.makeText(
                        this@MainActivity,
                        "Only Blog, Network Folder, and Uploader pages are available in this app.",
                        Toast.LENGTH_SHORT
                    ).show()
                    return true
                }

                override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                    super.onPageStarted(view, url, favicon)
                    pageProgress.progress = 4
                    pageProgress.visibility = View.VISIBLE
                }

                override fun onPageFinished(view: WebView, url: String) {
                    super.onPageFinished(view, url)
                    applyNativePageTheme(view)
                    view.animate().alpha(1f).setDuration(180L).start()
                    pageProgress.progress = 100
                    pageProgress.animate().alpha(0f).setDuration(220L).withEndAction {
                        pageProgress.visibility = View.GONE
                        pageProgress.alpha = 1f
                    }.start()
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                    super.onProgressChanged(view, newProgress)
                    pageProgress.progress = newProgress
                    if (newProgress < 100) pageProgress.visibility = View.VISIBLE
                }
                override fun onShowFileChooser(
                    view: WebView?,
                    callback: ValueCallback<Array<Uri>>?,
                    params: FileChooserParams?
                ): Boolean {
                    chooser?.onReceiveValue(null)
                    chooser = callback
                    val intent = params?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                    }
                    return try {
                        startActivityForResult(intent, PICK_FILE)
                        true
                    } catch (_: Exception) {
                        chooser = null
                        callback?.onReceiveValue(null)
                        Toast.makeText(this@MainActivity, "Unable to open file picker.", Toast.LENGTH_SHORT).show()
                        false
                    }
                }
            }
            setDownloadListener(DownloadListener { url, agent, disposition, mime, _ ->
                try {
                    val filename = URLUtil.guessFileName(url, disposition, mime)
                    val request = DownloadManager.Request(Uri.parse(url)).apply {
                        setMimeType(mime)
                        addRequestHeader("User-Agent", agent)
                        CookieManager.getInstance().getCookie(url)?.let { addRequestHeader("Cookie", it) }
                        setTitle(filename)
                        setDescription("Downloading from Apokolips")
                        setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                        setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
                        setAllowedOverMetered(true)
                        setAllowedOverRoaming(false)
                    }
                    (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
                    Toast.makeText(this@MainActivity, "Download started.", Toast.LENGTH_SHORT).show()
                } catch (_: Exception) {
                    Toast.makeText(this@MainActivity, "Download could not be started.", Toast.LENGTH_LONG).show()
                }
            })
        }
        content.addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        tabs = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setBackgroundColor(PANEL)
            setPadding(dp(8), dp(7), dp(8), dp(7))
        }
        labels.indices.forEach { index ->
            val item = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                isClickable = true
                isFocusable = true
                contentDescription = labels[index]
                setPadding(dp(4), dp(5), dp(4), dp(5))
                setOnClickListener { openTab(index) }
                addView(TextView(this@MainActivity).apply {
                    text = icons[index]
                    textSize = 19f
                    gravity = Gravity.CENTER
                    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
                })
                addView(TextView(this@MainActivity).apply {
                    text = labels[index]
                    textSize = 9.5f
                    gravity = Gravity.CENTER
                    maxLines = 1
                    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
                    setPadding(0, dp(2), 0, 0)
                })
            }
            tabs.addView(item, LinearLayout.LayoutParams(0, dp(58), 1f).apply {
                setMargins(dp(4), 0, dp(4), 0)
            })
        }
        content.addView(tabs)
        appRoot.addView(content, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))
        setContentView(appRoot)
        styleTabs()
    }

    /**
     * Downloads a small, versioned manifest on resume and every five minutes while
     * the app is active. Only the same-origin stylesheet is remotely replaceable;
     * native Android code and arbitrary remote JavaScript are never executed.
     */
    private fun checkRemoteUiManifest(reloadWhenChanged: Boolean) {
        try {
            uiUpdateExecutor.execute {
                var nextVersion: String? = null
                var nextStylesheet: String? = null
                var connection: HttpURLConnection? = null
                try {
                    connection = (URL("https://www.apokolips.xyz/app-ui.json?ts=" +
                        System.currentTimeMillis()).openConnection() as HttpURLConnection).apply {
                        requestMethod = "GET"
                        connectTimeout = 7000
                        readTimeout = 7000
                        useCaches = false
                        setRequestProperty("Accept", "application/json")
                        setRequestProperty("Cache-Control", "no-cache, no-store")
                    }
                    if (connection.responseCode in 200..299) {
                        val body = connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                        val manifest = JSONObject(body)
                        val schema = manifest.optInt("schemaVersion", 0)
                        val version = manifest.optString("version", "")
                        val stylesheet = manifest.optString("stylesheet", "")
                        if (schema == 1 &&
                            version.matches(Regex("[A-Za-z0-9._-]{1,64}")) &&
                            stylesheet == "/app-ui.css"
                        ) {
                            nextVersion = version
                            nextStylesheet = "https://www.apokolips.xyz/app-ui.css?v=$version"
                        }
                    }
                } catch (_: Exception) {
                    // Keep the last-known-good stylesheet when offline or the manifest is unavailable.
                } finally {
                    connection?.disconnect()
                }

                val version = nextVersion ?: return@execute
                val stylesheet = nextStylesheet ?: return@execute
                if (version == remoteUiVersion) return@execute

                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    remoteUiVersion = version
                    remoteUiStylesheet = stylesheet
                    getSharedPreferences("apokolips_remote_ui", MODE_PRIVATE)
                        .edit().putString("version", version).apply()
                    if (reloadWhenChanged && currentTab != 0 && ::web.isInitialized &&
                        !web.url.isNullOrBlank()
                    ) {
                        web.reload()
                    } else if (::web.isInitialized && !web.url.isNullOrBlank()) {
                        applyNativePageTheme(web)
                    }
                }
            }
        } catch (_: Exception) {
            // A closing Activity must not crash because its updater executor has stopped.
        }
    }

    /**
     * Applies the Apokolips app visual language to approved website screens.
     * Presentation-only: no website source files or page data are modified.
     */
    private fun applyNativePageTheme(view: WebView) {
        val css = """
            :root {
              color-scheme: dark !important;
              --apo-line: rgba(76, 157, 235, .22);
            }
            html, body {
              background: #020304 !important;
              color: #e8edf5 !important;
              color-scheme: dark !important;
              font-family: Inter, "Segoe UI", Roboto, Arial, sans-serif !important;
              -webkit-font-smoothing: antialiased !important;
            }
            body {
              min-height: 100vh !important;
              background-image: radial-gradient(ellipse at 50% -22%, rgba(12,72,130,.075), transparent 48%), linear-gradient(180deg, #030405 0%, #020304 62%, #010203 100%) !important;
            }
            h1, h2, h3, h4, strong, b { color: #f4f8ff !important; }
            p, li, label, small { color: #aeb8c7; }
            a { color: #55baff !important; text-decoration-color: rgba(85,186,255,.45) !important; }
            a:hover { color: #9bdcff !important; }
            header, nav, footer, aside, .card, .post, .blog-post, .folder, .file-card, .upload-card, article, section, main, .container, .content, .panel, .box, form, fieldset, table, pre, blockquote {
              border-color: var(--apo-line) !important;
            }
            .card, .post, .blog-post, .folder, .file-card, .upload-card, article, section, .panel, .box, fieldset, form {
              background-color: rgba(5,7,10,.97) !important;
              border-radius: 16px !important;
              box-shadow: 0 12px 34px rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.012) !important;
            }
            button, input[type=button], input[type=submit], .btn, [role=button] {
              background: linear-gradient(135deg, #07539a, #03264b) !important;
              color: #fff !important;
              border: 1px solid rgba(91,180,255,.42) !important;
              border-radius: 12px !important;
              box-shadow: 0 4px 14px rgba(0,55,110,.13) !important;
              transition: transform .18s ease, filter .18s ease, box-shadow .18s ease !important;
            }
            button:active, input[type=button]:active, input[type=submit]:active, .btn:active { transform: scale(.975) !important; filter: brightness(1.12) !important; }
            input, textarea, select {
              background: #030507 !important;
              color: #e8edf5 !important;
              border: 1px solid rgba(58,91,128,.25) !important;
              border-radius: 11px !important;
              outline: none !important;
            }
            input:focus, textarea:focus, select:focus { border-color: #168bff !important; box-shadow: 0 0 0 3px rgba(22,139,255,.13) !important; }
            table { background: #05070a !important; color: #dce5f0 !important; }
            th { background: #080e16 !important; color: #f2f6fb !important; }
            td, th { border-color: rgba(76,157,235,.18) !important; }
            img, video, iframe { max-width: 100% !important; }
            ::selection { background: rgba(22,139,255,.35) !important; color: #fff !important; }
            ::-webkit-scrollbar { width: 6px; height: 6px; }
            ::-webkit-scrollbar-thumb { background: #1b5b91; border-radius: 20px; }
            ::-webkit-scrollbar-track { background: #020304; }
        """.trimIndent()
        val script = "(function(){var id='apokolips-native-skin';var s=document.getElementById(id);if(!s){s=document.createElement('style');s.id=id;document.head.appendChild(s);}s.textContent=" + JSONObject.quote(css) + ";var l=document.getElementById('apo-remote-ui');if(!l){l=document.createElement('link');l.id='apo-remote-ui';l.rel='stylesheet';document.head.appendChild(l);}l.href=" + JSONObject.quote(remoteUiStylesheet) + ";})();"
        view.evaluateJavascript(script, null)
    }

    private fun openTab(index: Int) {
        if (index == 0) {
            currentTab = 0
            subtitle.text = "IDEAS BECOME SOMETHING REAL.  /  GROUP CHAT"
            styleTabs()
            // Keep Blog ready underneath the native chat screen for a clean return.
            if (web.url.isNullOrBlank()) {
                pageProgress.alpha = 1f
                pageProgress.progress = 0
                pageProgress.visibility = View.VISIBLE
                web.loadUrl(urls[0])
            }
            chatLaunchPending = true
            try {
                val chatIntent = Intent(this, GroupChatActivity::class.java)
                intent.getStringExtra("notification_message_id")?.let { messageId ->
                    chatIntent.putExtra("notification_message_id", messageId)
                    intent.removeExtra("notification_message_id")
                }
                startActivity(chatIntent)
            } catch (_: Exception) {
                chatLaunchPending = false
                currentTab = lastWebTab
                subtitle.text = "IDEAS BECOME SOMETHING REAL.  /  ${labels[lastWebTab].uppercase()}"
                styleTabs()
                Toast.makeText(this, "Group Chat could not be opened.", Toast.LENGTH_SHORT).show()
            }
            return
        }

        if (index !in 1..3) return
        lastWebTab = index
        currentTab = index
        subtitle.text = "IDEAS BECOME SOMETHING REAL.  /  ${labels[index].uppercase()}"
        styleTabs()

        val urlIndex = when (index) {
            1 -> 0 // Blog
            2 -> 2 // Uploader
            3 -> 1 // Network Folder
            else -> return
        }
        if (web.url != urls[urlIndex]) {
            pageProgress.alpha = 1f
            pageProgress.progress = 0
            pageProgress.visibility = View.VISIBLE
            web.alpha = 0.96f
            web.loadUrl(urls[urlIndex])
        } else {
            web.animate().alpha(1f).setDuration(160L).start()
        }
    }

    private fun styleTabs() {
        if (!::tabs.isInitialized) return
        for (i in 0 until tabs.childCount) {
            val item = tabs.getChildAt(i) as? LinearLayout ?: continue
            val active = i == currentTab
            item.background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(15).toFloat()
                setColor(if (active) Color.rgb(5, 15, 27) else Color.TRANSPARENT)
                if (active) setStroke(dp(1), Color.rgb(15, 65, 112))
            }
            val icon = item.getChildAt(0) as? TextView
            val label = item.getChildAt(1) as? TextView
            icon?.setTextColor(if (active) CYAN else MUTED)
            label?.setTextColor(if (active) WHITE else MUTED)
            item.alpha = if (active) 1f else .78f
        }
    }

    @Deprecated("Used for compatibility with the WebView file chooser callback.")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != PICK_FILE) return
        val callback = chooser ?: return
        callback.onReceiveValue(
            if (resultCode == RESULT_OK) WebChromeClient.FileChooserParams.parseResult(resultCode, data) else null
        )
        chooser = null
    }

    @Deprecated("Back navigation is handled here for compatibility.")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack()
        else if (currentTab != 1) openTab(1)
        else super.onBackPressed()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putInt("tab", currentTab)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        uiUpdateHandler.removeCallbacksAndMessages(null)
        uiUpdateExecutor.shutdownNow()
        chooser?.onReceiveValue(null)
        chooser = null
        if (::web.isInitialized) {
            web.stopLoading()
            web.destroy()
        }
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
