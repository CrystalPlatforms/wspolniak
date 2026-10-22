package com.wspolniak.app;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Mostek JS strony z powłoką (F3, #222), wystawiony jako {@code window.WspolniakBridge}.
 * Kontrakt: {@link #getPendingFiles()} zwraca JSON z metadanymi (url, name, size, mime),
 * gdzie url wskazuje na {@code https://appassets.androidplatform.net/pending/N} — bajty
 * serwuje {@link #servePending(String)} z rurki {@code WebViewAssetLoader}, więc duże
 * wideo nigdy nie przechodzi przez mostek jako base64. Strona konsumuje i woła
 * {@link #clearPendingFiles()}. Uwaga: metody @JavascriptInterface woła wątek WebView.
 */
public class WspolniakBridge {

    /** Publiczna w kontrakcie domena asset-loadera (zgodna z LinkNavigationPolicy). */
    public static final String ASSET_LOADER_HOST = "appassets.androidplatform.net";

    private static final String PENDING_PATH = "/pending/";

    private final PendingShareStore store;
    private final ContentResolver resolver;

    /** Snapshot, z którego getPendingFiles podała metadane — bajty idą z tego samego rzutu. */
    private volatile List<ShareIntentPolicy.PendingFile> serving = null;

    public WspolniakBridge(PendingShareStore store, ContentResolver resolver) {
        this.store = store;
        this.resolver = resolver;
    }

    @android.webkit.JavascriptInterface
    public String getPendingFiles() {
        List<ShareIntentPolicy.PendingFile> snap = store.snapshot();
        serving = snap;
        JSONArray arr = new JSONArray();
        for (int i = 0; i < snap.size(); i++) {
            ShareIntentPolicy.PendingFile file = snap.get(i);
            JSONObject json = new JSONObject();
            try {
                json.put("url", "https://" + ASSET_LOADER_HOST + PENDING_PATH + i);
                json.put("name", displayName(file.uri, i));
                json.put("size", sizeOf(file.uri));
                json.put("mime", file.mime);
            } catch (org.json.JSONException e) {
                // niemożliwe dla par String/long, ale mostek nie może rzucić w stronę JS
                return "[]";
            }
            arr.put(json);
        }
        return arr.toString();
    }

    @android.webkit.JavascriptInterface
    public void clearPendingFiles() {
        store.clear();
        serving = null;
    }

    /** Obsługa {@code /pending/N} dla WebViewAssetLoader; 404 poza zakresem / przy błędzie. */
    public WebResourceResponse servePending(String path) {
        List<ShareIntentPolicy.PendingFile> snap = serving != null ? serving : store.snapshot();
        int index;
        try {
            index = Integer.parseInt(path);
        } catch (NumberFormatException e) {
            return notFound();
        }
        if (index < 0 || index >= snap.size()) {
            return notFound();
        }
        ShareIntentPolicy.PendingFile file = snap.get(index);
        try {
            InputStream in = resolver.openInputStream(Uri.parse(file.uri));
            if (in == null) {
                return notFound();
            }
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "https://wspolniak.com");
            return new WebResourceResponse(file.mime, null, 200, "OK", headers, in);
        } catch (IOException | SecurityException e) {
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                Collections.emptyMap(), new java.io.ByteArrayInputStream(new byte[0]));
    }

    private String displayName(String uri, int index) {
        Cursor cursor = resolver.query(Uri.parse(uri),
                new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
        if (cursor != null) {
            try {
                if (cursor.moveToFirst()) {
                    String name = cursor.getString(0);
                    if (name != null && !name.isEmpty()) {
                        return name;
                    }
                }
            } finally {
                cursor.close();
            }
        }
        String segment = Uri.parse(uri).getLastPathSegment();
        if (segment != null && !segment.isEmpty()) {
            return segment;
        }
        return "plik-" + (index + 1);
    }

    private long sizeOf(String uri) {
        Cursor cursor = resolver.query(Uri.parse(uri),
                new String[]{OpenableColumns.SIZE}, null, null, null);
        if (cursor != null) {
            try {
                if (cursor.moveToFirst() && !cursor.isNull(0)) {
                    return cursor.getLong(0);
                }
            } finally {
                cursor.close();
            }
        }
        return -1;
    }
}
