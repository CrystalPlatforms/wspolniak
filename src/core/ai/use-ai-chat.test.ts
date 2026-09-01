// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kodowane przez te testy (F3 #181):
// - toApiMessages buduje payload API wyłącznie z role+content — myślenie
//   (reasoning) nigdy nie wraca do serwera.
// - sanitizeStoredMessages broni localStorage: śmieci przepadają, zostaje
//   ostatnie 100 wiadomości, nie-tablica = pusta rozmowa.
// - fetch to granica przeglądarki — mockujemy globalny fetch (vi.stubGlobal),
//   strumień NDJSON budujemy z ReadableStream + TextEncoder (linia = token).
// - Serwer już rozdziela <think> od treści — klient przepuszcza linie bez
//   dodatkowego parsowania.
import { act, renderHook } from "@testing-library/react";
import {
	MAX_PERSISTED_MESSAGES,
	STORAGE_KEY,
	sanitizeStoredMessages,
	toApiMessages,
	type UiChatMessage,
	useAiChat,
} from "./use-ai-chat";

beforeEach(() => {
	window.localStorage.clear();
});

afterEach(() => {
	window.localStorage.clear();
	vi.unstubAllGlobals();
});

afterAll(() => {
	vi.unstubAllGlobals();
});

describe("toApiMessages", () => {
	it("zdejmuje reasoning — elementy payloadu mają wyłącznie role i content", () => {
		const history: UiChatMessage[] = [
			{ role: "user", content: "co słychać?" },
			{ role: "assistant", content: "wszystko gra", reasoning: "uprzejma odpowiedź" },
		];

		const payload = toApiMessages(history);

		expect(payload).toEqual([
			{ role: "user", content: "co słychać?" },
			{ role: "assistant", content: "wszystko gra" },
		]);
		for (const item of payload) {
			expect(Object.keys(item).sort()).toEqual(["content", "role"]);
		}
	});
});

describe("sanitizeStoredMessages", () => {
	it("filtruje śmieci z tablicy — zostają poprawne wiadomości", () => {
		const junk = [
			{ role: "user", content: "ok" },
			{ role: "system", content: "obca rola" },
			{ role: "assistant", content: "" },
			{ role: "assistant" },
			"nie wiadomo",
			null,
			42,
		];

		expect(sanitizeStoredMessages(junk)).toEqual([{ role: "user", content: "ok" }]);
	});

	it("obcina do 100 OSTATNICH wiadomości", () => {
		const stored: UiChatMessage[] = Array.from(
			{ length: MAX_PERSISTED_MESSAGES + 5 },
			(_, index) => ({
				role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
				content: `wiadomość ${index}`,
			}),
		);

		const sanitized = sanitizeStoredMessages(stored);

		expect(sanitized).toHaveLength(MAX_PERSISTED_MESSAGES);
		expect(sanitized[0]).toEqual({ role: "assistant", content: "wiadomość 5" });
		expect(sanitized.at(-1)).toEqual({
			role: "user",
			content: `wiadomość ${MAX_PERSISTED_MESSAGES + 4}`,
		});
	});

	it("nie-tablica to pusta rozmowa", () => {
		expect(sanitizeStoredMessages("śmieć")).toEqual([]);
		expect(sanitizeStoredMessages(null)).toEqual([]);
		expect(sanitizeStoredMessages({ role: "user", content: "x" })).toEqual([]);
	});
});

describe("useAiChat — trwałość rozmowy", () => {
	it("montuje się z rozmową zapisaną w localStorage", () => {
		const stored: UiChatMessage[] = [
			{ role: "user", content: "jak masz na imię?" },
			{ role: "assistant", content: "AL.", reasoning: "przedstawiam się" },
		];
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

		const { result } = renderHook(() => useAiChat());

		expect(result.current.messages).toEqual(stored);
	});

	it("clearConversation czyści stan i localStorage", () => {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify([{ role: "user", content: "hej" }]));
		const { result } = renderHook(() => useAiChat());
		expect(result.current.messages).toHaveLength(1);

		act(() => {
			result.current.clearConversation();
		});

		expect(result.current.messages).toEqual([]);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
	});
});

/** Response z ciałem NDJSON — jedna linia = jeden token (jak /api/ai/chat). */
function ndjsonResponse(lines: string[]): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`));
			controller.close();
		},
	});
	return new Response(stream, {
		status: 200,
		headers: { "content-type": "application/x-ndjson" },
	});
}

describe("useAiChat — streaming z /api/ai/chat", () => {
	it("skleja tokeny: treść → content, myślenie → reasoning, payload bez reasoning", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				ndjsonResponse([
					JSON.stringify({ k: "r", v: "czytam pytanie" }),
					JSON.stringify({ k: "t", v: "Cze" }),
					JSON.stringify({ k: "t", v: "ść!" }),
				]),
			);
		vi.stubGlobal("fetch", fetchMock);

		const { result } = renderHook(() => useAiChat());

		await act(async () => {
			await result.current.send("cześć");
		});

		expect(result.current.messages).toEqual([
			{ role: "user", content: "cześć" },
			{ role: "assistant", content: "Cześć!", reasoning: "czytam pytanie" },
		]);
		expect(result.current.isStreaming).toBe(false);

		const call = fetchMock.mock.calls.at(0);
		if (!call) throw new Error("fetch nie został wywołany");
		const [url, init] = call;
		expect(url).toBe("/api/ai/chat");
		if (!init) throw new Error("fetch bez init");
		expect(init.method).toBe("POST");
		if (typeof init.body !== "string") throw new Error("body nie jest stringiem");
		const body = JSON.parse(init.body) as { messages: Record<string, string>[] };
		expect(body).toEqual({ messages: [{ role: "user", content: "cześć" }] });
		for (const item of body.messages) {
			expect(Object.keys(item).sort()).toEqual(["content", "role"]);
		}
	});

	it("błąd API ląduje w bańce asystenta jako [Błąd: …]", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn<typeof fetch>()
				.mockResolvedValue(
					new Response(JSON.stringify({ error: "Brak klucza GROQ" }), { status: 500 }),
				),
		);

		const { result } = renderHook(() => useAiChat());

		await act(async () => {
			await result.current.send("hej");
		});

		expect(result.current.messages.at(-1)).toEqual({
			role: "assistant",
			content: "[Błąd: Brak klucza GROQ]",
		});
	});
});
