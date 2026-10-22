package com.wspolniak.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
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
    private final Context appContext;

    /** Snapshot, z którego getPendingFiles podała metadane — bajty idą z tego samego rzutu. */
    private volatile List<ShareIntentPolicy.PendingFile> serving = null;

    public WspolniakBridge(
            PendingShareStore store, ContentResolver resolver, Context appContext) {
        this.store = store;
        this.resolver = resolver;
        this.appContext = appContext;
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

    /**
     * Zapis bajtów (base64) do Pobranych — pobieranie zdjęć z lightboxa (#225, iteracja 4).
     * Web fetchuje plik i przekazuje przez mostek, więc dokument się NIE przeładowuje
     * (lightbox zostaje). API 29+: MediaStore Downloads (widoczne w Plikach/Galerii,
     * bez uprawnień); starsze: katalog aplikacji.
     *
     * @return true, gdy plik zapisany.
     */
    @android.webkit.JavascriptInterface
    public boolean saveFile(String name, String mime, String base64) {
        if (name == null || base64 == null) {
            return false;
        }
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE,
                        mime != null ? mime : "application/octet-stream");
                values.put(MediaStore.MediaColumns.RELATIVE_PATH,
                        Environment.DIRECTORY_DOWNLOADS);
                Uri target = resolver.insert(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (target == null) {
                    return false;
                }
                try (OutputStream out = resolver.openOutputStream(target)) {
                    if (out == null) {
                        return false;
                    }
                    out.write(bytes);
                }
                return true;
            }
            File dir = new File(
                    appContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                    "wspolniak");
            if (!dir.exists() && !dir.mkdirs()) {
                return false;
            }
            File target = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(target)) {
                out.write(bytes);
            }
            return true;
        } catch (Throwable t) {
            // mostek NIGDY nie może wywalić procesu apki — każda porażka = false
            return false;
        }
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
