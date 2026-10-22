package com.wspolniak.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/**
 * Założenia spisane PRZED testami (issue #221) — cała polityka nawigacji linków:
 *
 * <ul>
 *   <li>„wspolniak.com" = apex + dowolna subdomena (www, cdn, …) — traktujemy jako wewnętrzną;
 *       http i https równorzędne (intent filter łapie oba scheme'y).</li>
 *   <li>Inne domeny (YouTube itp.) → OPEN_IN_BROWSER. Domeny-łapki (notwspolniak.com,
 *       wspolniak.com.evil.pl) NIE są wewnętrzne.</li>
 *   <li>Inne scheme'y (mailto:, tel:, about:) → OPEN_IN_BROWSER (delegujemy na zewnątrz).</li>
 *   <li>Null i URL bez scheme → OPEN_IN_BROWSER; URL niestrawny dla parsera → LOAD_IN_WEBVIEW
 *       (zostań w aplikacji zamiast martwego handoffu do przeglądarki).</li>
 *   <li>Nie testujemy tu: okablowania WebView, manifestu/intent-filter, cookies/sesji —
 *       to weryfikuje build APK + HITL na telefonie.</li>
 * </ul>
 */
public class LinkNavigationPolicyTest {

    private static final LinkNavigationPolicy.Decision WEBVIEW =
            LinkNavigationPolicy.Decision.LOAD_IN_WEBVIEW;
    private static final LinkNavigationPolicy.Decision BROWSER =
            LinkNavigationPolicy.Decision.OPEN_IN_BROWSER;

    @Test
    public void keepsHttpsApexDomainInWebView() {
        assertEquals(WEBVIEW, LinkNavigationPolicy.decide("https://wspolniak.com/app"));
    }

    @Test
    public void keepsHttpApexDomainInWebView() {
        assertEquals(WEBVIEW, LinkNavigationPolicy.decide("http://wspolniak.com/app"));
    }

    @Test
    public void keepsWwwSubdomainInWebView() {
        assertEquals(WEBVIEW, LinkNavigationPolicy.decide("https://www.wspolniak.com/app/posts/1"));
    }

    @Test
    public void keepsAnySubdomainInWebView() {
        assertEquals(WEBVIEW, LinkNavigationPolicy.decide("https://cdn.wspolniak.com/img/7"));
    }

    @Test
    public void keepsDomainCaseInsensitivelyInWebView() {
        assertEquals(WEBVIEW, LinkNavigationPolicy.decide("https://WSPOLNIAK.COM/app"));
    }

    @Test
    public void sendsForeignDomainToBrowser() {
        assertEquals(BROWSER, LinkNavigationPolicy.decide("https://youtube.com/watch?v=abc"));
    }

    @Test
    public void doesNotTrustLookalikeSuffixDomain() {
        // domena zaczynająca się od „wspolniak.com" bez granicy kropki to obca domena
        assertEquals(BROWSER, LinkNavigationPolicy.decide("https://notwspolniak.com/app"));
    }

    @Test
    public void doesNotTrustLookalikePrefixDomain() {
        //„wspolniak.com" jako subdomena cudzej domeny to obca domena
        assertEquals(BROWSER, LinkNavigationPolicy.decide("https://wspolniak.com.evil.pl/phish"));
    }

    @Test
    public void sendsMailtoToBrowser() {
        assertEquals(BROWSER, LinkNavigationPolicy.decide("mailto:admin@wspolniak.com"));
    }

    @Test
    public void sendsTelToBrowser() {
        assertEquals(BROWSER, LinkNavigationPolicy.decide("tel:+48123456789"));
    }

    @Test
    public void sendsNullToBrowser() {
        assertEquals(BROWSER, LinkNavigationPolicy.decide(null));
    }

    @Test
    public void sendsSchemelessUrlToBrowser() {
        assertEquals(BROWSER, LinkNavigationPolicy.decide("wspolniak.com/app"));
    }

    @Test
    public void keepsUnparseableUrlInWebView() {
        //założenie: błąd parsowania = zostań w aplikacji (WebView zniesie więcej niż handoff)
        assertEquals(WEBVIEW, LinkNavigationPolicy.decide("https://wspolniak.com/app/{niepoprawne znaki}"));
    }

    @Test
    public void keepsAssetLoaderUrlInWebView() {
        //F3 (#222): WebViewAssetLoader serwuje bajty udostępnionych plików spod tej domeny —
        //to infrastruktura aplikacji, nie obca strona
        assertEquals(WEBVIEW,
                LinkNavigationPolicy.decide("https://appassets.androidplatform.net/pending/0"));
    }

    @Test
    public void doesNotTrustAssetLoaderLookalikeDomain() {
        assertEquals(BROWSER,
                LinkNavigationPolicy.decide("https://appassets.androidplatform.net.evil.pl/0"));
    }
}
