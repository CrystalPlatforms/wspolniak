// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu draftu URL (F5 #218, F6 #219):
// - Jeden parametr `draft` w URL czatu: `post:<id>` (udostępnienie posta) albo
//   `text:<encodeURIComponent(tekst)>` (gotowy tekst do pola — szablon daty).
// - Niepoprawny/obcy format → null (trasa ignoruje draft, czat działa normalnie).
// - Tekstowy draft obcina się do limitu wiadomości (200 znaków); post-id
//   akceptuje tylko znaki alfanumeryczne/`-`/`_` (odcina śmieci z URL).
import { encodeChatDraft, parseChatDraft } from "./chat-draft";

describe("encodeChatDraft / parseChatDraft", () => {
	it("roundtrips a post draft", () => {
		const raw = encodeChatDraft({ type: "post", postId: "abc-123" });
		expect(raw).toBe("post:abc-123");
		expect(parseChatDraft(raw)).toEqual({ type: "post", postId: "abc-123" });
	});

	it("roundtrips a text draft with Polish characters and newlines", () => {
		const template = "Witam, tu Tomek\n<data> - To <opis>";
		const raw = encodeChatDraft({ type: "text", text: template });
		expect(raw.startsWith("text:")).toBe(true);
		expect(parseChatDraft(raw)).toEqual({ type: "text", text: template });
	});
});

describe("parseChatDraft — odrzucenia", () => {
	it("returns null for missing/empty param", () => {
		expect(parseChatDraft(undefined)).toBeNull();
		expect(parseChatDraft("")).toBeNull();
	});

	it("returns null for unknown prefixes", () => {
		expect(parseChatDraft("link:123")).toBeNull();
		expect(parseChatDraft("abc")).toBeNull();
	});

	it("returns null for post draft with garbage id (spacje, znaki specjalne, za długi)", () => {
		expect(parseChatDraft("post:")).toBeNull();
		expect(parseChatDraft("post:abc def!")).toBeNull();
		expect(parseChatDraft(`post:${"x".repeat(65)}`)).toBeNull();
	});

	it("returns null for empty text draft", () => {
		expect(parseChatDraft(`text:${encodeURIComponent("   ")}`)).toBeNull();
	});

	it("returns null for malformed encoding", () => {
		expect(parseChatDraft("text:%ZZ")).toBeNull();
	});

	it("returns null for param beyond the length cap", () => {
		expect(parseChatDraft(`text:${"a".repeat(3000)}`)).toBeNull();
	});
});

describe("parseChatDraft — limity", () => {
	it("trims a long text draft to the 200-character message limit", () => {
		const long = "x".repeat(500);
		const parsed = parseChatDraft(encodeChatDraft({ type: "text", text: long }));
		expect(parsed).toEqual({ type: "text", text: "x".repeat(200) });
	});

	it("accepts post ids with dash and underscore (uuid-ish)", () => {
		expect(parseChatDraft("post:9f8c_2b1a-AB12")).toEqual({
			type: "post",
			postId: "9f8c_2b1a-AB12",
		});
	});
});
