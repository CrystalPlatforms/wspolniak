package com.wspolniak.app;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

/**
 * Parsuje udostępnione pliki (ACTION_SEND / ACTION_SEND_MULTIPLE) do czystej listy
 * {@link PendingFile} (F3, #222). Czysta logika bez typów Androida — testowalna na JVM
 * przez {@code ShareIntentPolicyTest}. Wyciąganie EXTRA_STREAM z Intentu to glue
 * w {@link MainActivity}; serwowanie bajtów robi {@link WspolniakBridge}.
 */
public enum ShareIntentPolicy {

    ;

    /** Jeden udostępniony plik: nieprzezroczysty URI (dla asset-loadera) + MIME. */
    public static final class PendingFile {

        public final String uri;
        public final String mime;

        public PendingFile(String uri, String mime) {
            this.uri = uri;
            this.mime = mime;
        }
    }

    private static final String FALLBACK_MIME = "application/octet-stream";

    private ShareIntentPolicy() {
    }

    /**
     * @param intentType typ z intentu (może być null lub wildcard „image/*")
     * @param uris       EXTRA_STREAM w kolejności od nadawcy; null/empty = text-only share
     * @param perUriMime resolver typu dla pojedynczego URI (ContentResolver::getType)
     */
    public static List<PendingFile> parse(
            String intentType, List<String> uris, Function<String, String> perUriMime) {
        List<PendingFile> files = new ArrayList<>();
        if (uris == null) {
            return files;
        }
        for (String uri : uris) {
            if (uri == null) {
                continue;
            }
            String mime = perUriMime != null ? perUriMime.apply(uri) : null;
            if (mime == null || mime.isEmpty()) {
                mime = intentType;
            }
            if (mime == null || mime.isEmpty() || mime.endsWith("/*")) {
                // wildcard nigdy nie jest konkretnym typem pliku
                mime = FALLBACK_MIME;
            }
            files.add(new PendingFile(uri, mime));
        }
        return files;
    }
}
