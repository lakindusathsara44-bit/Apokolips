package xyz.apokolips.mobile

import android.animation.ValueAnimator
import android.app.Activity
import android.app.DownloadManager
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
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
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var subtitle: TextView
    private lateinit var tabs: LinearLayout
    private lateinit var appRoot: FrameLayout
    private var launchOverlay: View? = null
    private var splashAnimationFinished = false
    private var firstPageLoaded = false
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
            typeface = Typeface.DEFAULT_BOLD
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
                    firstPageLoaded = true
                    finishSplashWhenReady()
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
        val overlay = FrameLayout(this).apply { setBackgroundColor(BG) }
        overlay.addView(MechanicalSplashView(), FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))
        appRoot.addView(overlay, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))
        launchOverlay = overlay

        val animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 7000L
            interpolator = DecelerateInterpolator(1.25f)
            addUpdateListener { animation ->
                (overlay.getChildAt(0) as? MechanicalSplashView)?.progress = animation.animatedValue as Float
            }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: android.animation.Animator) {
                    splashAnimationFinished = true
                    finishSplashWhenReady()
                }
            })
        }
        animator.start()
    }

    private fun finishSplashWhenReady() {
        if (!splashAnimationFinished || !firstPageLoaded) return
        val overlay = launchOverlay ?: return
        launchOverlay = null
        overlay.animate().alpha(0f).setDuration(450L).withEndAction {
            appRoot.removeView(overlay)
        }.start()
    }

    private inner class MechanicalSplashView : View(this@MainActivity) {
        var progress: Float = 0f
            set(value) {
                field = value.coerceIn(0f, 1f)
                invalidate()
            }

        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val iconBitmap: Bitmap? = try {
            BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher)
        } catch (_: Exception) { null }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val w = width.toFloat()
            val h = height.toFloat()
            val cx = w / 2f
            val cy = h * .46f
            val unit = min(w, h)
            val core = unit * .105f
            val maxReach = unit * .43f
            val armLength = unit * .19f
            val p = progress

            canvas.drawColor(BG)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = dp(1).toFloat()
            paint.color = Color.argb(28, 55, 190, 255)
            canvas.drawCircle(cx, cy, core * 2.15f, paint)
            canvas.drawCircle(cx, cy, core * 2.55f, paint)

            // Four synchronized mechanical arms enter from the four edges.
            for (i in 0..3) {
                val angle = i * 90f
                val distance = maxReach * (1f - p) + core * .72f
                canvas.save()
                canvas.translate(cx, cy)
                canvas.rotate(angle)
                drawMechanicalArm(canvas, distance, armLength, core)
                canvas.restore()
            }

            // Rotating orbital rings and gear details assemble around the core.
            paint.color = Color.argb((55 + 150 * p).toInt(), 55, 190, 255)
            paint.strokeWidth = dp(2).toFloat()
            canvas.save()
            canvas.rotate(360f * p, cx, cy)
            canvas.drawOval(RectF(cx - core * 1.72f, cy - core * .92f, cx + core * 1.72f, cy + core * .92f), paint)
            canvas.restore()
            paint.color = Color.argb((45 + 125 * p).toInt(), 105, 160, 205)
            paint.strokeWidth = dp(1).toFloat()
            canvas.save()
            canvas.rotate(-270f * p, cx, cy)
            canvas.drawOval(RectF(cx - core * 1.95f, cy - core * 1.12f, cx + core * 1.95f, cy + core * 1.12f), paint)
            canvas.restore()

            // Four small rotating gears lock into the orbital assembly.
            for (i in 0..3) {
                val angle = Math.toRadians((i * 90f + 45f + 300f * p).toDouble())
                val gearX = cx + cos(angle).toFloat() * core * 1.55f
                val gearY = cy + sin(angle).toFloat() * core * 1.55f
                drawGear(canvas, gearX, gearY, core * .19f, -420f * p + i * 22f)
            }

            val glowAlpha = (45 + 150 * p).toInt().coerceIn(0, 195)
            paint.style = Paint.Style.FILL
            paint.color = Color.argb(glowAlpha, 20, 135, 230)
            canvas.drawCircle(cx, cy, core * (1.18f + .12f * sin(p * Math.PI).toFloat()), paint)
            paint.color = Color.rgb(8, 14, 24)
            canvas.drawCircle(cx, cy, core * .88f, paint)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = dp(2).toFloat()
            paint.color = Color.argb((100 + 155 * p).toInt().coerceAtMost(255), 55, 190, 255)
            canvas.drawCircle(cx, cy, core * .88f, paint)

            if (p > .32f) {
                val iconAlpha = (((p - .32f) / .68f) * 255).toInt().coerceIn(0, 255)
                val iconRadius = core * .68f
                if (iconBitmap != null) {
                    val save = canvas.save()
                    val path = Path().apply { addCircle(cx, cy, iconRadius, Path.Direction.CW) }
                    canvas.clipPath(path)
                    paint.alpha = iconAlpha
                    canvas.drawBitmap(iconBitmap, null, RectF(cx - iconRadius, cy - iconRadius, cx + iconRadius, cy + iconRadius), paint)
                    paint.alpha = 255
                    canvas.restoreToCount(save)
                } else {
                    paint.style = Paint.Style.FILL
                    paint.color = Color.argb(iconAlpha, 55, 190, 255)
                    paint.textAlign = Paint.Align.CENTER
                    paint.typeface = Typeface.DEFAULT_BOLD
                    paint.textSize = core * 1.05f
                    canvas.drawText("A", cx, cy + core * .36f, paint)
                }
            }

            paint.style = Paint.Style.FILL
            paint.textAlign = Paint.Align.CENTER
            paint.typeface = Typeface.DEFAULT_BOLD
            paint.textSize = dp(19).toFloat()
            paint.color = WHITE
            paint.alpha = (255 * (0.35f + .65f * p)).toInt()
            canvas.drawText("APOKOLIPS", cx, cy + core * 2.85f, paint)
            paint.textSize = dp(9).toFloat()
            paint.typeface = Typeface.DEFAULT
            paint.letterSpacingCompat()
            paint.color = MUTED
            paint.alpha = (220 * p).toInt()
            canvas.drawText("IDEAS BECOME SOMETHING REAL.", cx, cy + core * 3.55f, paint)
            paint.alpha = 255
        }

        private fun drawGear(canvas: Canvas, x: Float, y: Float, radius: Float, rotation: Float) {
            canvas.save()
            canvas.rotate(rotation, x, y)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = dp(2).toFloat()
            paint.color = Color.rgb(95, 125, 153)
            canvas.drawCircle(x, y, radius * .72f, paint)
            for (tooth in 0 until 8) {
                val angle = Math.toRadians(tooth * 45.0)
                val inner = radius * .72f
                val outer = radius
                canvas.drawLine(
                    x + cos(angle).toFloat() * inner,
                    y + sin(angle).toFloat() * inner,
                    x + cos(angle).toFloat() * outer,
                    y + sin(angle).toFloat() * outer,
                    paint
                )
            }
            paint.style = Paint.Style.FILL
            paint.color = Color.rgb(22, 36, 52)
            canvas.drawCircle(x, y, radius * .34f, paint)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = dp(1).toFloat()
            paint.color = CYAN
            canvas.drawCircle(x, y, radius * .34f, paint)
            canvas.restore()
        }

        private fun drawMechanicalArm(canvas: Canvas, start: Float, length: Float, core: Float) {
            val end = start + length
            val y = 0f
            paint.style = Paint.Style.STROKE
            paint.strokeCap = Paint.Cap.ROUND
            paint.strokeWidth = dp(11).toFloat()
            paint.color = Color.rgb(35, 48, 64)
            canvas.drawLine(start, y, end, y, paint)
            paint.strokeWidth = dp(5).toFloat()
            paint.color = Color.rgb(100, 125, 150)
            canvas.drawLine(start + dp(5), y, end - dp(8), y, paint)

            paint.style = Paint.Style.FILL
            paint.color = Color.rgb(23, 33, 47)
            canvas.drawRoundRect(RectF(start + length * .28f, -dp(12).toFloat(), start + length * .72f, dp(12).toFloat()), dp(5).toFloat(), dp(5).toFloat(), paint)
            paint.color = CYAN
            canvas.drawCircle(start + length * .5f, y, dp(3).toFloat(), paint)

            paint.color = Color.rgb(115, 137, 158)
            canvas.drawCircle(start, y, dp(9).toFloat(), paint)
            paint.color = Color.rgb(25, 39, 55)
            canvas.drawCircle(start, y, dp(5).toFloat(), paint)
            paint.color = CYAN
            canvas.drawCircle(start, y, dp(2).toFloat(), paint)

            // Two-pronged gripper facing the glowing centre.
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = dp(4).toFloat()
            paint.strokeCap = Paint.Cap.ROUND
            paint.color = Color.rgb(130, 153, 174)
            val claw = Path().apply {
                moveTo(start - dp(2), -dp(4).toFloat())
                lineTo(start - dp(13), -dp(12).toFloat())
                moveTo(start - dp(2), dp(4).toFloat())
                lineTo(start - dp(13), dp(12).toFloat())
            }
            canvas.drawPath(claw, paint)

            // Small piston and outer joint.
            paint.strokeWidth = dp(2).toFloat()
            paint.color = Color.rgb(55, 190, 255)
            canvas.drawLine(start + length * .22f, -dp(5).toFloat(), start + length * .72f, -dp(5).toFloat(), paint)
            paint.style = Paint.Style.FILL
            paint.color = Color.rgb(75, 95, 115)
            canvas.drawCircle(end, y, dp(7).toFloat(), paint)
            paint.color = Color.rgb(15, 23, 34)
            canvas.drawCircle(end, y, dp(3).toFloat(), paint)
        }

        private fun Paint.letterSpacingCompat() {
            // Canvas text has no letter-spacing property; the tagline remains clean and centred.
        }
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
