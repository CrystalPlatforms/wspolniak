package com.wspolniak.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.function.Function;

import org.junit.Test;

/**
 * Założenia spisane PRZED testami (F3, #222) — parsowanie udostępnionych plików
 * z intentu ACTION_SEND / ACTION_SEND_MULTIPLE do czystej listy PendingFile:
 *
 * <ul>
 *   <li>Kolejność URI z nadawcy = kolejność plików (kolejność zaznaczenia w Galerii).</li>
 *   <li>Nie filtrujemy typów ani rozmiarów — o tym decyduje istniejący pipeline uploadu
 *       (założenie z issue: „no new size or type rules").</li>
 *   <li>MIME per plik: resolver URI → konkretny typ intentu → application/octet-stream.
 *       Wildcard („image/*") NIGDY nie jest konkretnym typem pliku.</li>
 *   <li>Text-only share = brak EXTRA_STREAM (pusta lista URI) → pusta lista plików.</li>
 *   <li>Null w środku listy URI (rada nadzorcza nad niechlujnymi nadawcami) → pomijany.</li>
 *   <li>Nie testujemy tu: wyciągania EXTRA_STREAM z Intentu (glue w MainActivity, HITL),
 *       mostku JS ani WebViewAssetLoader.</li>
 * </ul>
 */
public class ShareIntentPolicyTest {

    private static final Function<String, String> NO_PER_URI_MIME = uri -> null;

    @Test
    public void keepsSinglePhotoWithIntentMime() {
        List<ShareIntentPolicy.PendingFile> files = ShareIntentPolicy.parse(
                "image/jpeg", Collections.singletonList("content://media/1"), NO_PER_URI_MIME);
        assertEquals(1, files.size());
        assertEquals("content://media/1", files.get(0).uri);
        assertEquals("image/jpeg", files.get(0).mime);
    }

    @Test
    public void keepsMultipleFilesInGivenOrder() {
        List<ShareIntentPolicy.PendingFile> files = ShareIntentPolicy.parse(
                "image/*",
                Arrays.asList("content://media/1", "content://media/2", "content://media/3"),
                NO_PER_URI_MIME);
        assertEquals(3, files.size());
        assertEquals("content://media/1", files.get(0).uri);
        assertEquals("content://media/2", files.get(1).uri);
        assertEquals("content://media/3", files.get(2).uri);
    }

    @Test
    public void prefersPerUriMimeOverIntentType() {
        // mix foto+video: per-URI resolver rozstrzyga typ każdego pliku
        List<ShareIntentPolicy.PendingFile> files = ShareIntentPolicy.parse(
                "*/*",
                Arrays.asList("content://media/foto", "content://media/klip"),
                uri -> uri.endsWith("klip") ? "video/mp4" : "image/jpeg");
        assertEquals("image/jpeg", files.get(0).mime);
        assertEquals("video/mp4", files.get(1).mime);
    }

    @Test
    public void fallsBackToConcreteIntentTypeWhenPerUriMimeMissing() {
        List<ShareIntentPolicy.PendingFile> files = ShareIntentPolicy.parse(
                "video/mp4", Collections.singletonList("content://media/9"),
                NO_PER_URI_MIME);
        assertEquals("video/mp4", files.get(0).mime);
    }

    @Test
    public void neverUsesWildcardIntentTypeAsConcreteMime() {
        List<ShareIntentPolicy.PendingFile> files = ShareIntentPolicy.parse(
                "image/*", Collections.singletonList("content://media/7"), NO_PER_URI_MIME);
        assertEquals("application/octet-stream", files.get(0).mime);
    }

    @Test
    public void fallsBackToOctetStreamWhenNothingConcrete() {
        List<ShareIntentPolicy.PendingFile> files = ShareIntentPolicy.parse(
                null, Collections.singletonList("content://media/5"), NO_PER_URI_MIME);
        assertEquals("application/octet-stream", files.get(0).mime);
    }

    @Test
    public void ignoresTextOnlyShare() {
        // text/plain nie ma EXTRA_STREAM — pusta lista URI → nic nie trafia do mostka
        assertTrue(ShareIntentPolicy.parse("text/plain", Collections.emptyList(),
                NO_PER_URI_MIME).isEmpty());
    }

    @Test
    public void ignoresNullUriEntries() {
        List<ShareIntentPolicy.PendingFile> files = ShareIntentPolicy.parse(
                "image/jpeg",
                Arrays.asList("content://media/1", null, "content://media/2"),
                NO_PER_URI_MIME);
        assertEquals(2, files.size());
        assertEquals("content://media/1", files.get(0).uri);
        assertEquals("content://media/2", files.get(1).uri);
    }
}
