package cz.dobrodruzi.vexlcalc

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader

/** The web app is packaged in the APK; only exchange rates and charts use the network. */
class MainActivity : Activity() {
    private lateinit var webView: WebView
    private val appOrigin = "https://appassets.androidplatform.net"
    private val startUrl = "$appOrigin/assets/www/index.html"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(57, 32, 101)
        window.navigationBarColor = Color.rgb(250, 248, 255)
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.safeBrowsingEnabled = true
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest
                ): Boolean {
                    if (!request.isForMainFrame) return false
                    val uri = request.url
                    if (uri.scheme == "vexlcalc-share" && uri.host == "share") {
                        val text = uri.getQueryParameter("text") ?: return true
                        if (text.length <= 10000) shareText(text)
                        return true
                    }
                    if (uri.scheme == "https" && uri.host == "appassets.androidplatform.net" &&
                        uri.path?.startsWith("/assets/www/") == true) return false
                    if (uri.scheme in listOf("https", "bitcoin", "lightning")) {
                        openExternal(uri)
                    }
                    return true
                }
            }
        }
        setContentView(webView)
        if (savedInstanceState == null) webView.loadUrl(startUrl)
        else if (webView.restoreState(savedInstanceState) == null) webView.loadUrl(startUrl)
    }

    private fun shareText(text: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }
        startActivity(Intent.createChooser(intent, getString(R.string.share_title)))
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Deprecated("Android's Back button closes the current dialog/screen before the activity")
    override fun onBackPressed() {
        webView.evaluateJavascript(
            """(() => { const d = [...document.querySelectorAll('dialog[open]')].pop();
              if (d) { d.close(); return true; }
              const app = document.getElementById('app');
              if (app && document.getElementById('convert-pane')?.hidden) {
                document.getElementById('tab-convert')?.click(); return true;
              }
              return false; })()"""
        ) { result ->
            if (result != "true") finish()
        }
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
