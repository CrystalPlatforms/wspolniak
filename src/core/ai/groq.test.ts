// SPDX-License-Identifier: AGPL-3.0-or-later
import { GROQ_CHAT_URL, streamChat } from "./groq";
import type { ChatToken } from "./stream-protocol";

/**
 * Założenia kodowane przez te testy (stan przed RED):
 * - Wejście: { apiKey, model, messages: {role, content}[] } — role: system|user|assistant.
 * - Wyjście: AsyncGenerator<ChatToken> — kolejne delty: treść (delta.content)
 *   albo myślenie (delta.reasoning, modele reasoningowe typu Qwen).
 * - fetch to granica systemu — mockujemy globalny fetch (vi.stubGlobal).
 * - Parsowanie SSE: linie „data: {...}"; „data: [DONE]" kończy strumień;
 *   komentarze „: ..." ignorowane; chunki sieciowe mogą rozcinać linie w połowie
 *   (parser musi buforować do napotkania "\n").
 * - Błąd: odpowiedź !ok → GroqError(message z body.error.message, status).
 * - Świadomie NIE testowane: prawdziwa sieć, retry, tool-calls, usage.
 */

/** Response z ciałem złożonym z surowych chunków bajtowych (jak sieć). */
function sseResponse(rawChunks: string[], status = 200): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of rawChunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		},
	});
	return new Response(stream, { status, headers: { "content-type": "text/event-stream" } });
}

async function collect(gen: AsyncGenerator<ChatToken>): Promise<string> {
	let out = "";
	for await (const token of gen) out += "text" in token ? token.text : "";
	return out;
}

describe("streamChat", () => {
	it("składa tokeny z chunków SSE, także rociętych w połowie linii", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					sseResponse([
						": keep-alive\n\n",
						'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
						'data: {"choices":[{"delta":{"content":"Cze"}}]}\n\ndata: {"choices":[{"delta":{"content":"ść"}}]}\n\n',
						'data: {"choices":[{"delta":{"content":"!"}}]}\n',
						"\ndata: [DONE]\n\n",
					]),
				),
		);

		const tokens = streamChat({
			apiKey: "test-key",
			model: "openai/gpt-oss-120b",
			messages: [{ role: "user", content: "hej" }],
		});

		expect(await collect(tokens)).toBe("Cześć!");
	});

	it("kończy się na [DONE] nawet jeśli strumień ma jeszcze bajty", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					sseResponse([
						'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
						"data: [DONE]\n\n",
						'data: {"choices":[{"delta":{"content":"po done — ignorowane"}}]}\n\n',
					]),
				),
		);

		const tokens = streamChat({
			apiKey: "test-key",
			model: "m",
			messages: [{ role: "user", content: "x" }],
		});
		expect(await collect(tokens)).toBe("ok");
	});

	it("wysyła POST z Bearer, modelem, wiadomościami i stream:true", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				sseResponse(['data: {"choices":[{"delta":{"content":"."}}]}\n\n', "data: [DONE]\n\n"]),
			);
		vi.stubGlobal("fetch", fetchMock);

		await collect(
			streamChat({
				apiKey: "klucz",
				model: "openai/gpt-oss-20b",
				messages: [
					{ role: "system", content: "persona" },
					{ role: "user", content: "pytanie" },
				],
			}),
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(GROQ_CHAT_URL);
		expect(init.method).toBe("POST");
		const headers = init.headers as Record<string, string>;
		expect(headers.authorization).toBe("Bearer klucz");
		expect(JSON.parse(init.body as string)).toEqual({
			model: "openai/gpt-oss-20b",
			messages: [
				{ role: "system", content: "persona" },
				{ role: "user", content: "pytanie" },
			],
			stream: true,
		});
	});

	it("mapuje błąd API na GroqError ze statusem i komunikatem", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), {
					status: 401,
					headers: { "content-type": "application/json" },
				}),
			),
		);

		const tokens = streamChat({
			apiKey: "zly",
			model: "m",
			messages: [{ role: "user", content: "x" }],
		});

		await expect(collect(tokens)).rejects.toMatchObject({
			name: "GroqError",
			status: 401,
			message: "Invalid API Key",
		});
	});

	it("oddziela myślenie (delta.reasoning) od treści (delta.content)", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					sseResponse([
						'data: {"choices":[{"delta":{"reasoning":"analizuję"}}]}\n\n',
						'data: {"choices":[{"delta":{"reasoning":" pytanie"}}]}\n\n',
						'data: {"choices":[{"delta":{"content":"Odpowiedź"}}]}\n\n',
						"data: [DONE]\n\n",
					]),
				),
		);

		const tokens = streamChat({
			apiKey: "test-key",
			model: "qwen/qwen3.6-27b",
			messages: [{ role: "user", content: "x" }],
		});

		const seen: ChatToken[] = [];
		for await (const token of tokens) seen.push(token);
		expect(seen).toEqual([
			{ kind: "reasoning", text: "analizuję" },
			{ kind: "reasoning", text: " pytanie" },
			{ kind: "text", text: "Odpowiedź" },
		]);
	});
});
