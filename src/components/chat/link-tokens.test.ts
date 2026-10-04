// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu link-tokens (#214 — Chat F1, /link):
// - Token linku to zwykły tekst `[tytuł|tekst](url)` w treści wiadomości — bez
//   zmiany schematu (PRD #201). Builder ZAWSZE emituje oba sloty z separatorem
//   `|`; parser toleruje też formy bez `|` (`[](u)`, `[t](u)`).
// - Etykieta chipu (fallbacki z AC): tekst linku (anchor) → inaczej tytuł →
//   inaczej sam URL.
// - URL jest poprawny, gdy przechodzi przez `new URL()` i ma protokół http/https
//   (blokuje `javascript:`); pusty URL to osobny błąd z własnym komunikatem.
// - Tytuł/tekst nie mogą zawierać `[`, `]`, `|`; URL białych znaków ani `)` —
//   buildLinkToken je usuwa (sanityzacja przy budowaniu tokenu).
// - Wszystko poza tokenami zostaje zwykłym tekstem; tekst "przypominający"
//   token bez protokołu http(s) NIE jest linkiem (bezpieczny renderer).
import { buildLinkToken, linkUrlError, normalizeLinkUrl, parseLinkTokens } from "./link-tokens";

describe("parseLinkTokens", () => {
	it("splits text into a text segment and a link segment", () => {
		const segments = parseLinkTokens("Zobacz [Przepis|kliknij](https://example.com) i oceń");

		expect(segments).toEqual([
			{ kind: "text", text: "Zobacz " },
			{ kind: "link", label: "kliknij", url: "https://example.com" },
			{ kind: "text", text: " i oceń" },
		]);
	});

	it("falls back to the title when the anchor is empty", () => {
		const segments = parseLinkTokens("[Przepis|](https://example.com)");

		expect(segments).toEqual([{ kind: "link", label: "Przepis", url: "https://example.com" }]);
	});

	it("falls back to the anchor when the title is empty", () => {
		const segments = parseLinkTokens("[|Kliknij tu](https://example.com)");

		expect(segments).toEqual([{ kind: "link", label: "Kliknij tu", url: "https://example.com" }]);
	});

	it("falls back to the URL when both parts are empty", () => {
		const segments = parseLinkTokens("[|](https://example.com)");

		expect(segments).toEqual([
			{ kind: "link", label: "https://example.com", url: "https://example.com" },
		]);
	});

	it("returns a single text segment when there is no token", () => {
		const segments = parseLinkTokens("Zwykła wiadomość bez linku");

		expect(segments).toEqual([{ kind: "text", text: "Zwykła wiadomość bez linku" }]);
	});

	it("parses multiple tokens with text between them", () => {
		const segments = parseLinkTokens("[a|b](https://x.com) środek [|](https://y.pl) koniec");

		expect(segments).toEqual([
			{ kind: "link", label: "b", url: "https://x.com" },
			{ kind: "text", text: " środek " },
			{ kind: "link", label: "https://y.pl", url: "https://y.pl" },
			{ kind: "text", text: " koniec" },
		]);
	});

	it("keeps bracketed text without an http(s) URL as plain text", () => {
		const segments = parseLinkTokens("[foo](nie-jest-linkiem) i [bar](javascript:alert(1))");

		expect(segments).toEqual([
			{ kind: "text", text: "[foo](nie-jest-linkiem) i [bar](javascript:alert(1))" },
		]);
	});
});

describe("buildLinkToken", () => {
	it("builds the [title](url) token (formularz ma jedno pole tekstowe)", () => {
		const token = buildLinkToken({ title: "Przepis", url: "https://x.com" });

		expect(token).toBe("[Przepis](https://x.com)");
	});

	it("strips forbidden characters from title and URL", () => {
		// `]` w tytule zerwałby token, `)` w URL — zamknięcie.
		const token = buildLinkToken({ title: "Prze]p|is", url: "https://x.com/a)b c" });

		expect(token).toBe("[Przepis](https://x.com/abc)");
	});

	it("builds an empty-slot token when the title is blank", () => {
		expect(buildLinkToken({ title: "", url: "https://x.com" })).toBe("[](https://x.com)");
	});
});

describe("linkUrlError", () => {
	it("flags an empty URL with its own message", () => {
		expect(linkUrlError("")).toBe("Podaj adres URL");
		expect(linkUrlError("   ")).toBe("Podaj adres URL");
	});

	it("flags an unparseable URL", () => {
		expect(linkUrlError("zły adres ze spacją")).toBe("To nie jest poprawny adres URL");
	});

	it("flags non-http(s) protocols", () => {
		expect(linkUrlError("javascript:alert(1)")).toBe(
			"Link musi zaczynać się od http:// lub https://",
		);
	});

	it("accepts http(s) URLs", () => {
		expect(linkUrlError("https://wspolniak.com")).toBeNull();
		expect(linkUrlError("http://x.com/a?b=1#f")).toBeNull();
	});

	it("accepts bare domains without a protocol (apple.com)", () => {
		expect(linkUrlError("apple.com")).toBeNull();
		expect(linkUrlError("example.pl/sciezka?x=1")).toBeNull();
	});
});

describe("normalizeLinkUrl", () => {
	it("prepends https:// to bare domains", () => {
		expect(normalizeLinkUrl("apple.com")).toBe("https://apple.com");
	});

	it("keeps URLs that already carry a protocol", () => {
		expect(normalizeLinkUrl("https://x.com/a")).toBe("https://x.com/a");
		expect(normalizeLinkUrl("http://x.com")).toBe("http://x.com");
	});

	it("trims whitespace around the address", () => {
		expect(normalizeLinkUrl("  apple.com  ")).toBe("https://apple.com");
	});
});
