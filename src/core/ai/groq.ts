// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Groq chat completions — streaming (deep module, F4).
 * Jeden generator `streamChat` w środku chowa: endpoint, nagłówki autoryzacji,
 * parsowanie SSE (z buforowaniem linii ciętych między chunkami), pomijanie
 * komentarzy keep-alive, ignorowanie delt bez treści i mapowanie błędów API.
 * Klucz API przyjmuje parametrem — wołający (endpoint Hono) czyta go z env.
 * Tokeny rozróżniają treść (`delta.content`) od myślenia (`delta.reasoning`
 * modeli reasoningowych, np. Qwen 3.6) — patrz stream-protocol.
 */

import type { ChatToken } from "./stream-protocol";

export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

/** Błąd API Groq — status HTTP + komunikat z body ({error:{message}}). */
export class GroqError extends Error {
	constructor(
		message: string,
		public readonly status: number,
	) {
		super(message);
		this.name = "GroqError";
	}
}

interface StreamChatInput {
	apiKey: string;
	model: string;
	messages: ChatMessage[];
	/**
	 * Nakład myślenia (parametr reasoning_effort Groqa, modele gpt-oss).
	 * undefined = nie wysyłamy (Qwen myśli zawsze, nie przyjmuje parametru).
	 */
	reasoningEffort?: "low" | "medium" | "high";
}

export async function* streamChat({
	apiKey,
	model,
	messages,
	reasoningEffort,
}: StreamChatInput): AsyncGenerator<ChatToken> {
	const response = await fetch(GROQ_CHAT_URL, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model,
			messages,
			stream: true,
			...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
		}),
	});

	if (!response.ok) {
		throw new GroqError(await groqErrorMessage(response), response.status);
	}
	if (!response.body) {
		throw new GroqError("Groq zwróciło puste ciało odpowiedzi", 502);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? ""; // niedokończona linia czeka na kolejny chunk

		for (const line of lines) {
			const token = parseSseLine(line);
			if (token === DONE) return;
			if (token !== null) yield token;
		}
	}
}

const DONE = Symbol("sse-done");
type SseToken = ChatToken | null | typeof DONE;

/** Jedna linia SSE → token (treść/myślenie) | null (ignor) | DONE (koniec). */
function parseSseLine(line: string): SseToken {
	const trimmed = line.trim();
	if (!trimmed.startsWith("data:")) return null; // komentarze ": ping", puste linie, eventy innych typów

	const data = trimmed.slice("data:".length).trim();
	if (data === "[DONE]") return DONE;

	try {
		const json = JSON.parse(data) as {
			choices?: { delta?: { content?: unknown; reasoning?: unknown } }[];
		};
		const delta = json.choices?.[0]?.delta;
		if (!delta) return null;
		// Reasoning first — reasoning models send both, but content only after thinking.
		if (typeof delta.reasoning === "string" && delta.reasoning.length > 0) {
			return { kind: "reasoning", text: delta.reasoning };
		}
		if (typeof delta.content === "string" && delta.content.length > 0) {
			return { kind: "text", text: delta.content };
		}
		return null;
	} catch {
		return null; // uszkodzony/fragment JSON-a — pomijamy bez wybuchu całego czatu
	}
}

async function groqErrorMessage(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { error?: { message?: string } };
		return body.error?.message ?? `Groq API error (${response.status})`;
	} catch {
		return `Groq API error (${response.status})`;
	}
}
