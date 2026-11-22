package xyz.apokolips.mobile

import android.app.Activity
import android.app.DownloadManager
import android.content.Intent
import android.graphics.Color
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
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var subtitle: TextView
    private lateinit var tabs: LinearLayout
    private lateinit var appRoot: FrameLayout
    private var launchOverlay: View? = null
    private var currentTab = 0
    private var chooser: ValueCallback<Array<Uri>>? = null

    private val urls = listOf(
        "https://www.apokolips.xyz/blog.html",
        "https://www.apokolips.xyz/network-folder.html",
        "https://www.apokolips.xyz/admin/blog-uploader/index.html"
    )
    private val labels = listOf("Blog", "Network Folder", "Uploader")
    private val icons = listOf("▤", "▣", "↑")

    companion object {
        private const val PICK_FILE = 4107
        private val BG = Color.rgb(5, 6, 9)
        private val PANEL = Color.rgb(12, 17, 27)
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
        openTab(state?.getInt("tab") ?: 0)
    }

    private fun createUi() {
        appRoot = FrameLayout(this).apply { setBackgroundColor(BG) }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(BG)
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(14), dp(20), dp(12))
            setBackgroundColor(BG)
        }
        header.addView(TextView(this).apply {
            text = "APOKOLIPS"
            textSize = 18f
            letterSpacing = .18f
            setTextColor(WHITE)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        })
        subtitle = TextView(this).apply {
            text = "IDEAS BECOME SOMETHING REAL."
            textSize = 9f
            letterSpacing = .13f
            setTextColor(MUTED)
            setPadding(0, dp(4), 0, 0)
        }
        header.addView(subtitle)
        content.addView(header)

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

                override fun onPageFinished(view: WebView, url: String) {
                    super.onPageFinished(view, url)
                    // The splash is a native Android view; website files are never modified.
                    dismissLaunchAnimation()
                }
            }
            webChromeClient = object : WebChromeClient() {
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
            val button = Button(this).apply {
                text = "${icons[index]}  ${labels[index]}"
                textSize = 10f
                isAllCaps = false
                minHeight = dp(48)
                setPadding(dp(3), 0, dp(3), 0)
                setOnClickListener { openTab(index) }
            }
            tabs.addView(button, LinearLayout.LayoutParams(0, dp(52), 1f).apply {
                setMargins(dp(3), 0, dp(3), 0)
            })
        }
        content.addView(tabs)
        appRoot.addView(content, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))
        setContentView(appRoot)
        styleTabs()
        showLaunchAnimation()
    }

    private fun showLaunchAnimation() {
        val overlay = FrameLayout(this).apply {
            setBackgroundColor(BG)
            alpha = 1f
        }
        val center = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        val logo = TextView(this).apply {
            text = "APOKOLIPS"
            textSize = 30f
            letterSpacing = .22f
            setTextColor(WHITE)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            alpha = 0f
            scaleX = .88f
            scaleY = .88f
        }
        val tagline = TextView(this).apply {
            text = "IDEAS BECOME SOMETHING REAL."
            textSize = 10f
            letterSpacing = .18f
            setTextColor(MUTED)
            gravity = Gravity.CENTER
            setPadding(0, dp(10), 0, 0)
            alpha = 0f
            translationY = dp(8).toFloat()
        }
        val track = View(this).apply {
            setBackgroundColor(PANEL)
        }
        val progress = View(this).apply {
            setBackgroundColor(CYAN)
            scaleX = 0f
            pivotX = 0f
        }
        val progressFrame = FrameLayout(this).apply {
            addView(track, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(2)))
            addView(progress, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(2)))
        }
        center.addView(logo)
        center.addView(tagline)
        center.addView(progressFrame, LinearLayout.LayoutParams(dp(156), dp(2)).apply {
            topMargin = dp(28)
        })
        overlay.addView(center, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        ))
        appRoot.addView(overlay, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))
        launchOverlay = overlay

        logo.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(650L).start()
        tagline.animate().alpha(1f).translationY(0f).setStartDelay(220L).setDuration(550L).start()
        progress.animate().scaleX(1f).setStartDelay(300L).setDuration(1100L).start()
    }

    private fun dismissLaunchAnimation() {
        val overlay = launchOverlay ?: return
        launchOverlay = null
        overlay.animate().alpha(0f).setDuration(420L).withEndAction {
            appRoot.removeView(overlay)
        }.start()
    }

    private fun openTab(index: Int) {
        if (index !in urls.indices) return
        currentTab = index
        subtitle.text = "APOKOLIPS / ${labels[index].uppercase()}"
        styleTabs()
        if (web.url != urls[index]) web.loadUrl(urls[index])
    }

    private fun styleTabs() {
        if (!::tabs.isInitialized) return
        for (i in 0 until tabs.childCount) {
            val button = tabs.getChildAt(i) as? Button ?: continue
            val active = i == currentTab
            button.setTextColor(if (active) WHITE else MUTED)
            button.backgroundTintList = android.content.res.ColorStateList.valueOf(if (active) BLUE else PANEL)
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
        else if (currentTab != 0) openTab(0)
        else super.onBackPressed()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putInt("tab", currentTab)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
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
