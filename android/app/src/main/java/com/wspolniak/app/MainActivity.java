package com.wspolniak.app;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.webkit.WebViewAssetLoader;

import java.util.ArrayList;
import java.util.List;

/**
 * Jedyna aktywność wrappera: pełnoekranowy WebView z Wspólniakiem (issue #221, F3 #222).
 * Linki wewnętrzne (wspolniak.com) ładują się w aplikacji, zewnętrzne deleguje
 * do przeglądarki ({@link LinkNavigationPolicy}). Cookies/domStorage przeżywają
 * restart procesu, back wraca w historii WebView. Udostępnienie zdjęć/wideo
 * (ACTION_SEND / ACTION_SEND_MULTIPLE) ląduje w {@link PendingShareStore}, a strona
 * odbiera je przez {@link WspolniakBridge} na formie nowego posta.
 */
public class MainActivity extends ComponentActivity {

    private static final String START_URL = "https://wspolniak.com/app";
    private static final String NEW_POST_URL = "https://wspolniak.com/app/new";

    private WebView webView;
    private WebViewAssetLoader assetLoader;

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

        Intent intent = getIntent();
        boolean shared = handleShareIntent(intent);
        Uri link = intent.getData();
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else if (shared) {
            // Zimny start z udostępnienia — od razu forma nowego posta z plikami w poczekalni.
            webView.loadUrl(NEW_POST_URL);
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
        if (handleShareIntent(intent)) {
            webView.loadUrl(NEW_POST_URL);
            return;
        }
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

    /**
     * Wyciąga udostępnione pliki do poczekalni. @return true, gdy intent przyniósł media
     * i należy otworzyć formę nowego posta; text-only / cudze akcje → false.
     */
    private boolean handleShareIntent(Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action)
                && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return false;
        }
        List<Uri> uris = extractStreamUris(intent);
        List<String> uriStrings = new ArrayList<>();
        for (Uri uri : uris) {
            uriStrings.add(uri != null ? uri.toString() : null);
        }
        List<ShareIntentPolicy.PendingFile> files = ShareIntentPolicy.parse(
                intent.getType(),
                uriStrings,
                uri -> {
                    try {
                        return getContentResolver().getType(Uri.parse(uri));
                    } catch (Exception e) {
                        // provider może odmówić metadanych — zostaje typ intentu / octet-stream
                        return null;
                    }
                });
        if (files.isEmpty()) {
            return false;
        }
        PendingShareStore.getInstance().set(files);
        persistUriPermissions(intent, uris);
        return true;
    }

    @SuppressWarnings("deprecation")
    private List<Uri> extractStreamUris(Intent intent) {
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> stream = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (stream != null) {
                uris.addAll(stream);
            }
        } else {
            Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream != null) {
                uris.add(stream);
            }
        }
        return uris;
    }

    /** Best effort: gdy nadawca dał flagę persistable, URI przeżyje śmierć procesu. */
    private void persistUriPermissions(Intent intent, List<Uri> uris) {
        if ((intent.getFlags() & Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) == 0) {
            return;
        }
        for (Uri uri : uris) {
            if (uri == null) {
                continue;
            }
            try {
                getContentResolver().takePersistableUriPermission(
                        uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (SecurityException e) {
                // nadawca nie dał naprawdę persistable — pliki żyją tylko w tym procesie
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);

        WspolniakBridge bridge =
                new WspolniakBridge(PendingShareStore.getInstance(), getContentResolver());
        webView.addJavascriptInterface(bridge, "WspolniakBridge");

        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(WspolniakBridge.ASSET_LOADER_HOST)
                .addPathHandler("/pending/",
                        path -> bridge.servePending(path))
                .build();

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

            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
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
