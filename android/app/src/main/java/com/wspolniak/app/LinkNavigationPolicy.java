package com.wspolniak.app;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/**
 * Decyduje, czy link zostaje w WebView aplikacji, czy leci do przeglądarki (issue #221).
 * Czysta logika bez typów Androida — testowalna na JVM przez {@code LinkNavigationPolicyTest}.
 * Okablowanie do {@link android.webkit.WebViewClient} siedzi w {@link MainActivity}.
 */
public enum LinkNavigationPolicy {

    ;

    /** Decyzja nawigacyjna dla pojedynczego URL-a. */
    public enum Decision {
        LOAD_IN_WEBVIEW,
        OPEN_IN_BROWSER
    }

    private static final String INTERNAL_DOMAIN = "wspolniak.com";

    /**
     * Stały host WebViewAssetLoader (#222) — serwuje bajty udostępnionych plików.
     * Infrastruktura aplikacji: dokładnie ten host, bez subdomen.
     */
    private static final String ASSET_LOADER_HOST = "appassets.androidplatform.net";

    private LinkNavigationPolicy() {
    }

    public static Decision decide(String url) {
        if (url == null) {
            return Decision.OPEN_IN_BROWSER;
        }
        URI uri;
        try {
            uri = new URI(url);
        } catch (URISyntaxException e) {
            // Założenie z testu: niestrawny URL = zostań w aplikacji, nie oddawaj do przeglądarki.
            return Decision.LOAD_IN_WEBVIEW;
        }
        String scheme = uri.getScheme();
        if (scheme == null
                || !"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
            return Decision.OPEN_IN_BROWSER;
        }
        String host = uri.getHost();
        if (host == null) {
            return Decision.OPEN_IN_BROWSER;
        }
        String normalized = host.toLowerCase(Locale.ROOT);
        if (normalized.equals(ASSET_LOADER_HOST)
                || normalized.equals(INTERNAL_DOMAIN)
                || normalized.endsWith("." + INTERNAL_DOMAIN)) {
            return Decision.LOAD_IN_WEBVIEW;
        }
        return Decision.OPEN_IN_BROWSER;
    }
}
