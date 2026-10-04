// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Token linku w treści wiadomości czatu (#214 — Chat F1): `[tytuł|tekst](url)`.
 * Zwykły tekst — bez zmiany schematu; bubble renderer parsuje tokeny na chipy.
 */

export type LinkSegment =
	| { kind: "text"; text: string }
	| { kind: "link"; label: string; url: string };

const LINK_TOKEN_RE = /\[([^[\]|]*)(?:\|([^[\]|]*))?\]\((https?:\/\/[^\s)]+)\)/gu;

/** Etykieta chipu: tekst linku → tytuł → URL (fallbacki z AC #214). */
function segmentLabel(title: string, anchor: string, url: string): string {
	return anchor || title || url;
}

/** Tytuł/tekst nie mogą łamać gramatyki tokenu; URL — białych znaków ani `)`. */
function sanitizeTokenPart(value: string): string {
	return value.replace(/[[\]|]/g, "").trim();
}

function sanitizeTokenUrl(value: string): string {
	return value.replace(/[\s)]/g, "");
}

/** Składa token `[tytuł](url)` z sanityzowanych części (formularz ma jedno pole tekstowe). */
export function buildLinkToken(input: { title: string; url: string }): string {
	const title = sanitizeTokenPart(input.title);
	const url = sanitizeTokenUrl(input.url);
	return `[${title}](${url})`;
}

/** Zapis z protokołem (np. `https:`, `http:`, ale też `javascript:`) — dwukropek po schemacie. */
const PROTOCOL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * URL do zapisania w tokenie: bez protokołu dopina `https://` (wpisane
 * `apple.com` → `https://apple.com`), z protokołem zostawia jak jest.
 * Chip `<a href>` potrzebuje pełnego adresu — goły domain byłby linkiem
 * względnym.
 */
export function normalizeLinkUrl(url: string): string {
	const trimmed = url.trim();
	return PROTOCOL_RE.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Komunikat błędu walidacji URL-a formularza /link albo `null`, gdy URL jest
 * dobry. Pusty URL ma osobny komunikat; domena bez protokołu jest dobra
 * (normalizacja dopina https), ale protokół jawny ograniczony do http/https
 * (blokuje `javascript:` i inne schematy).
 */
export function linkUrlError(url: string): string | null {
	const trimmed = url.trim();
	if (!trimmed) return "Podaj adres URL";
	let parsed: URL;
	try {
		parsed = new URL(normalizeLinkUrl(trimmed));
	} catch {
		return "To nie jest poprawny adres URL";
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return "Link musi zaczynać się od http:// lub https://";
	}
	return null;
}

/** Dzieli treść wiadomości na segmenty tekstu i tokenów linku. */
export function parseLinkTokens(text: string): LinkSegment[] {
	const segments: LinkSegment[] = [];
	let lastIndex = 0;
	for (const match of text.matchAll(LINK_TOKEN_RE)) {
		const index = match.index ?? 0;
		if (index > lastIndex) {
			segments.push({ kind: "text", text: text.slice(lastIndex, index) });
		}
		const title = (match[1] ?? "").trim();
		const anchor = (match[2] ?? "").trim();
		const url = match[3] ?? "";
		segments.push({ kind: "link", label: segmentLabel(title, anchor, url), url });
		lastIndex = index + match[0].length;
	}
	if (lastIndex < text.length) {
		segments.push({ kind: "text", text: text.slice(lastIndex) });
	}
	return segments;
}
