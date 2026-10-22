package com.wspolniak.app;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Czysta logika pobierania plików z WebView (#225): czy w ogóle pobierać i jak nazwać
 * plik. Decyzja o domenie delegowana do {@link LinkNavigationPolicy} — pobieramy tylko
 * z Wspólniaka, jednym źródłem prawdy z nawigacją. Klej z {@link android.app.DownloadManager}
 * siedzi w {@link MainActivity}; testy: {@code DownloadPolicyTest}.
 */
public enum DownloadPolicy {

    ;

    private static final String FALLBACK_FILENAME = "plik-z-wspolniaka";

    /** filename="x" albo filename=x (bez spacji w wersji bez cudzysłowu); filename* ignorowane. */
    private static final Pattern FILENAME_PARAM =
            Pattern.compile("filename\\s*=\\s*(\"([^\"]*)\"|([^;\\s]+))", Pattern.CASE_INSENSITIVE);

    private DownloadPolicy() {
    }

    /** Pobieramy wyłącznie z domeny Wspólniaka — jak nawigację (jedno źródło prawdy). */
    public static boolean shouldDownload(String url) {
        return LinkNavigationPolicy.decide(url)
                == LinkNavigationPolicy.Decision.LOAD_IN_WEBVIEW;
    }

    /**
     * Czy URL to nasza trasa attachment („…/download")? Przechwycenie jej w
     * shouldOverrideUrlLoading konsumuje pobranie PRZED nawigacją — inaczej WebView
     * przeładowuje dokument i lightbox znika, mimo że plik i tak leci do
     * DownloadManagera (#225, iteracja 3).
     */
    public static boolean isAttachmentDownload(String url) {
        if (!shouldDownload(url)) {
            return false;
        }
        try {
            String path = new URI(url).getPath();
            return path != null && path.endsWith("/download");
        } catch (URISyntaxException e) {
            return false;
        }
    }

    /**
     * Nazwa pliku: Content-Disposition → parametr „name" z query (nasza trasa
     * attachment) → basename z URL (bez query, zdekodowany) → stała. Separatory
     * ścieżek z disposition zamieniane na „_" (higiena przed DownloadManagerem).
     */
    public static String filename(String contentDisposition, String url) {
        if (contentDisposition != null) {
            Matcher matcher = FILENAME_PARAM.matcher(contentDisposition);
            if (matcher.find()) {
                String quoted = matcher.group(2);
                String raw = quoted != null ? quoted : matcher.group(3);
                if (raw != null && !raw.isEmpty()) {
                    return raw.replace('/', '_').replace('\\', '_');
                }
            }
        }
        String fromQuery = queryParamName(url);
        if (fromQuery != null) {
            return fromQuery;
        }
        String basename = urlBasename(url);
        return basename != null ? basename : FALLBACK_FILENAME;
    }

    private static String queryParamName(String url) {
        if (url == null) {
            return null;
        }
        try {
            String query = new URI(url).getQuery();
            if (query == null) {
                return null;
            }
            for (String pair : query.split("&")) {
                int eq = pair.indexOf('=');
                if (eq > 0 && "name".equals(pair.substring(0, eq))) {
                    String value = pair.substring(eq + 1);
                    return value.isEmpty() ? null
                            : URLDecoder.decode(value, StandardCharsets.UTF_8);
                }
            }
        } catch (URISyntaxException | IllegalArgumentException e) {
            // nietrawestowalny query — spada do basename / stałej
        }
        return null;
    }

    private static String urlBasename(String url) {
        if (url == null) {
            return null;
        }
        int query = url.indexOf('?');
        String path = query >= 0 ? url.substring(0, query) : url;
        int slash = path.lastIndexOf('/');
        String name = slash >= 0 ? path.substring(slash + 1) : path;
        if (name.isEmpty()) {
            return null;
        }
        try {
            return URLDecoder.decode(name, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            // niedokończone %xx itp. — zostaje surowa nazwa
            return name;
        }
    }
}
