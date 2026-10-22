package com.wspolniak.app;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;

/**
 * Jedyna aktywność wrappera: pełnoekranowy WebView z Wspólniakiem (issue #221).
 * Linki wewnętrzne (wspolniak.com) ładują się w aplikacji, zewnętrzne deleguje
 * do przeglądarki ({@link LinkNavigationPolicy}). Cookies/domStorage przeżywają
 * restart procesu, back wraca w historii WebView.
 */
public class MainActivity extends ComponentActivity {

    private static final String START_URL = "https://wspolniak.com/app";

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setLayoutParams(
                new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(webView);

        configureWebView();
        configureBackNavigation();

        Uri link = getIntent().getData();
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else if (link != null && LinkNavigationPolicy.decide(link.toString())
                == LinkNavigationPolicy.Decision.LOAD_IN_WEBVIEW) {
            // Zimny start z magic linka (mail/SMS) — lądujemy od razu na linku.
            webView.loadUrl(link.toString());
        } else {
            if (link != null) {
                openExternally(link);
            }
            webView.loadUrl(START_URL);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri data = intent.getData();
        if (data == null) {
            return;
        }
        if (LinkNavigationPolicy.decide(data.toString())
                == LinkNavigationPolicy.Decision.LOAD_IN_WEBVIEW) {
            webView.loadUrl(data.toString());
        } else {
            openExternally(data);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Wymuś zapis cookies na dysk, żeby sesja przeżyła śmierć procesu.
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (LinkNavigationPolicy.decide(url.toString())
                        == LinkNavigationPolicy.Decision.OPEN_IN_BROWSER) {
                    return openExternally(url);
                }
                return false;
            }
        });
        webView.setWebChromeClient(new WebChromeClient());
    }

    private void configureBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView view = webView;
                if (view != null && view.canGoBack()) {
                    view.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            }
        });
    }

    /** @return true, gdy URL jest skonsumowany (WebView nie ma go już ładować). */
    private boolean openExternally(Uri url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_browser_found, Toast.LENGTH_SHORT).show();
        }
        return true;
    }
}
