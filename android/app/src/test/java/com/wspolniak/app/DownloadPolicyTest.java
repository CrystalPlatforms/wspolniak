package com.wspolniak.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Założenia spisane PRZED testami (#225 — DownloadListener):
 *
 * <ul>
 *   <li>Pobieramy WYŁĄCZNIE z domeny Wspólniaka (apex + subdomeny, http/https) — decyzja
 *       delegowana do {@link LinkNavigationPolicy#decide} (jedno źródło prawdy). Cudze
 *       pobierania ignorujemy po cichu.</li>
 *   <li>Nazwa pliku: Content-Disposition (cudzysłów lub bez) → basename z URL
 *       (strip query, dekodowanie %xx) → stała „plik-z-wspolniaka".
 *       Rozszerzony parametr filename* (RFC 5987) celowo ignorujemy — spada do URL.</li>
 *   <li>Separatory ścieżek w nazwie z disposition zamieniamy na „_" (higiena).</li>
 *   <li>Nie testujemy tu: kleju z DownloadManager (framework), cookie/User-Agent
 *       passthrough, miejsca docelowego — to build + HITL na telefonie.</li>
 * </ul>
 */
public class DownloadPolicyTest {

    @Test
    public void acceptsDownloadFromApexDomain() {
        assertTrue(DownloadPolicy.shouldDownload("https://wspolniak.com/images/7?variant=full"));
    }

    @Test
    public void acceptsDownloadFromWwwSubdomain() {
        assertTrue(DownloadPolicy.shouldDownload("https://www.wspolniak.com/images/7"));
    }

    @Test
    public void rejectsDownloadFromForeignHost() {
        assertFalse(DownloadPolicy.shouldDownload("https://youtube.com/watch?v=x"));
    }

    @Test
    public void rejectsDownloadFromLookalikeDomain() {
        assertFalse(DownloadPolicy.shouldDownload("https://wspolniak.com.evil.pl/fota.jpg"));
    }

    @Test
    public void rejectsDownloadWithoutHttpScheme() {
        assertFalse(DownloadPolicy.shouldDownload("tel:+48123456789"));
    }

    @Test
    public void rejectsNullUrl() {
        assertFalse(DownloadPolicy.shouldDownload(null));
    }

    @Test
    public void takesFilenameFromQuotedDisposition() {
        assertEquals("wakacje.jpg", DownloadPolicy.filename(
                "attachment; filename=\"wakacje.jpg\"", "https://wspolniak.com/images/7"));
    }

    @Test
    public void takesFilenameFromUnquotedDisposition() {
        assertEquals("obrazek.png", DownloadPolicy.filename(
                "attachment; filename=obrazek.png", "https://wspolniak.com/images/7"));
    }

    @Test
    public void sanitizesPathSeparatorsInDispositionFilename() {
        assertEquals(".._.._evil.jpg", DownloadPolicy.filename(
                "attachment; filename=\"../../evil.jpg\"", "https://wspolniak.com/images/7"));
    }

    @Test
    public void fallsBackToUrlBasenameWithoutDisposition() {
        assertEquals("123", DownloadPolicy.filename(
                null, "https://wspolniak.com/images/123?variant=full"));
    }

    @Test
    public void decodesUrlEncodedBasename() {
        assertEquals("wakacje nad morzem.jpg", DownloadPolicy.filename(
                null, "https://wspolniak.com/img/wakacje%20nad%20morzem.jpg"));
    }

    @Test
    public void extendedDispositionParamFallsBackToUrlBasename() {
        assertEquals("123", DownloadPolicy.filename(
                "attachment; filename*=UTF-8''%C5%9Bwi%C4%99te.jpg",
                "https://wspolniak.com/images/123"));
    }

    @Test
    public void fallsBackToConstantWhenNothingUsable() {
        assertEquals("plik-z-wspolniaka", DownloadPolicy.filename(null, null));
    }

    @Test
    public void trailingSlashUrlFallsBackToConstant() {
        assertEquals("plik-z-wspolniaka", DownloadPolicy.filename(
                null, "https://wspolniak.com/images/"));
    }

    //_iteracja 3 (#225): przechwycenie nawigacji na trasę attachment w shouldOverrideUrlLoading

    @Test
    public void treatsInternalDownloadPathAsAttachment() {
        assertTrue(DownloadPolicy.isAttachmentDownload(
                "https://wspolniak.com/api/app/images/cf-1/download?name=x.jpg"));
    }

    @Test
    public void treatsWwwDownloadPathAsAttachment() {
        assertTrue(DownloadPolicy.isAttachmentDownload(
                "https://www.wspolniak.com/api/app/images/cf-1/download"));
    }

    @Test
    public void ignoresForeignDownloadPath() {
        assertFalse(DownloadPolicy.isAttachmentDownload(
                "https://youtube.com/api/app/images/cf-1/download"));
    }

    @Test
    public void ignoresInternalPagesWithoutDownloadPath() {
        assertFalse(DownloadPolicy.isAttachmentDownload("https://wspolniak.com/app/new"));
    }

    @Test
    public void rejectsNullUrlAsAttachment() {
        assertFalse(DownloadPolicy.isAttachmentDownload(null));
    }

    @Test
    public void filenamePrefersQueryNameOverUrlBasename() {
        assertEquals("wakacje.jpg", DownloadPolicy.filename(null,
                "https://wspolniak.com/api/app/images/cf-1/download?name=wakacje.jpg"));
    }

    @Test
    public void dispositionStillWinsOverQueryName() {
        assertEquals("z-disposition.jpg", DownloadPolicy.filename(
                "attachment; filename=\"z-disposition.jpg\"",
                "https://wspolniak.com/api/app/images/cf-1/download?name=z-query.jpg"));
    }

    //_iteracja 5 (#225): natywne „przytrzymaj zdjęcie" — id z delivery URL-a Cloudflare

    @Test
    public void extractsCfImageIdFromDeliveryUrl() {
        assertEquals("abc-123-uuid", DownloadPolicy.cfImageIdFromDeliveryUrl(
                "https://imagedelivery.net/HASH123/abc-123-uuid/public"));
    }

    @Test
    public void extractsCfImageIdFromDeliveryUrlOtherVariant() {
        assertEquals("xyz", DownloadPolicy.cfImageIdFromDeliveryUrl(
                "https://imagedelivery.net/HASH123/xyz/thumbnail"));
    }

    @Test
    public void nonDeliveryUrlHasNoCfImageId() {
        assertEquals(null, DownloadPolicy.cfImageIdFromDeliveryUrl(
                "https://wspolniak.com/images/abc"));
    }

    @Test
    public void malformedDeliveryUrlHasNoCfImageId() {
        assertEquals(null, DownloadPolicy.cfImageIdFromDeliveryUrl(
                "https://imagedelivery.net/HASH123"));
    }

    //_schematy nie-nawigacyjne: konsumowane po cichu (nigdy do przeglądarki)

    @Test
    public void consumesBlobSchemeSilently() {
        assertTrue(DownloadPolicy.shouldConsumeSilently(
                "blob:https://wspolniak.com/9c1a4f2e-83c1-4d10"));
    }

    @Test
    public void consumesDataSchemeSilently() {
        assertTrue(DownloadPolicy.shouldConsumeSilently(
                "data:image/png;base64,iVBOR"));
    }

    @Test
    public void consumesJavascriptSchemeSilently() {
        assertTrue(DownloadPolicy.shouldConsumeSilently("javascript:void(0)"));
    }

    @Test
    public void doesNotConsumeRegularHttps() {
        assertFalse(DownloadPolicy.shouldConsumeSilently("https://wspolniak.com/app"));
    }

    @Test
    public void doesNotConsumeNull() {
        assertFalse(DownloadPolicy.shouldConsumeSilently(null));
    }
}
