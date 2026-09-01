// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";
import { type ChatMessage, streamChat } from "@/core/ai/groq";
import { DEFAULT_MODEL_ID } from "@/core/ai/models";
import { AL_SYSTEM_PROMPT } from "@/core/ai/persona";
import { type ChatToken, encodeToken } from "@/core/ai/stream-protocol";
import { ThinkParser } from "@/core/ai/think-parser";
import { getAiAccessState, setUserAiOptIn } from "@/db/identity/queries";
import { getFeatureFlags } from "@/db/instance/queries";
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";
import { hasEffectiveAiAccess } from "@/lib/ai-access";

/**
 * AI endpoint (AL, PRD #178) — jedyne miejsce, gdzie świeci prawdziwe AI.
 * F1 (#179): pełny łańcuch gatingowania przed strumieniem — sesja (middleware)
 * → master flag admina → blokada admina per user → opt-in usera. F2 (#180):
 * po przejściu wszystkich bramek leci realny strumień Groq (NDJSON, jeden
 * model domyślny). Dodatkowo /access + /opt-in dla przełącznika w Ustawieniach.
 */
const chatRequestSchema = z.object({
	messages: z
		.array(
			z.object({
				role: z.enum(["user", "assistant"]),
				content: z.string().min(1).max(8000),
			}),
		)
		.min(1)
		.max(50),
});

const optInSchema = z.object({ optIn: z.boolean() });

const aiEndpoint = createHono();

aiEndpoint.use("*", authMiddleware());

// GET /access — stan AL dla zalogowanego usera (przełącznik w Ustawieniach,
// później widoczność wejść do czatu). effective = master ∧ ¬blocked ∧ opt-in.
aiEndpoint.get("/access", async (c) => {
	const user = c.get("user");
	const [flags, aiState] = await Promise.all([getFeatureFlags(), getAiAccessState(user.userId)]);
	return c.json({
		data: {
			master: flags.ai,
			...aiState,
			effective: hasEffectiveAiAccess({ master: flags.ai, ...aiState }),
		},
	});
});

// PUT /opt-in — user włącza/wyłącza AL w Ustawieniach. Zablokowanemu adminem
// odmawiamy (403) — UI renderuje wtedy przełącznik jako nieaktywny.
aiEndpoint.put("/opt-in", async (c) => {
	const parsed = optInSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return c.json({ error: "Nieprawidłowe zapytanie" }, 400);
	}

	const user = c.get("user");
	const aiState = await getAiAccessState(user.userId);
	if (aiState.aiBlocked) {
		return c.json({ error: "AL został dla Ciebie wyłączony przez administratora." }, 403);
	}

	await setUserAiOptIn(user.userId, parsed.data.optIn);
	return c.json({ data: { aiOptIn: parsed.data.optIn } });
});

// POST /chat — bramki w kolejności z issue #179; każda zwraca 403 z polskim
// komunikatem (trafia potem inline do bąbelka czatu). 401 anonimowi daje
// authMiddleware.
aiEndpoint.post("/chat", async (c) => {
	const parsed = chatRequestSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return c.json({ error: "Nieprawidłowe zapytanie" }, 400);
	}

	const user = c.get("user");
	const [flags, aiState] = await Promise.all([getFeatureFlags(), getAiAccessState(user.userId)]);

	if (!flags.ai) {
		return c.json({ error: "AL jest obecnie wyłączony." }, 403);
	}
	if (aiState.aiBlocked) {
		return c.json({ error: "AL został dla Ciebie wyłączony przez administratora." }, 403);
	}
	if (!aiState.aiOptIn) {
		return c.json({ error: "Włącz AL w Ustawieniach, aby korzystać z czatu." }, 403);
	}

	// Bramki przeszły — realny strumień Groq (F2 #180). Klucz czytamy z env,
	// żeby missing-secret dał czytelny komunikat zamiast 500 z Groqa.
	const apiKey = c.env.GROQ_API_KEY;
	if (!apiKey) {
		return c.json({ error: "Brak klucza GROQ_API_KEY — skonfiguruj sekret na Cloudflare." }, 500);
	}

	// Persona doklejana SERWEROWO — klient nie może nadpisać system promptu.
	// Jeden model na sztywno; picker modeli dochodzi dopiero w F4.
	const messages: ChatMessage[] = [
		{ role: "system", content: AL_SYSTEM_PROMPT },
		...parsed.data.messages,
	];

	const tokens = streamChat({ apiKey, model: DEFAULT_MODEL_ID, messages });
	return ndjsonResponse(tokens);
});

/**
 * Tokeny z Groqa → odpowiedź NDJSON (linia = token). Myślenie z osobnego pola
 * delty przelata bez zmian; zwykłą treść przepuszczamy przez ThinkParser,
 * bo modele reasoningowe potrafią myśleć tagami <think>…</think> w treści.
 * Błąd w trakcie generowania trafia do strumienia jako token tekstowy —
 * klient pokaże go inline w bąbelku, zamiast oberwać zerwanym requestem.
 */
function ndjsonResponse(tokens: AsyncGenerator<ChatToken>): Response {
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();
			const thinkParser = new ThinkParser();
			const push = (token: ChatToken) => controller.enqueue(encoder.encode(encodeToken(token)));
			try {
				for await (const token of tokens) {
					if (token.kind === "reasoning") {
						push(token);
						continue;
					}
					thinkParser.push(token.text).forEach(push);
				}
				thinkParser.flush().forEach(push);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Nieznany błąd podczas generowania";
				push({ kind: "text", text: `[Błąd AL: ${message}]` });
			} finally {
				controller.close();
			}
		},
	});
	return new Response(stream, {
		headers: {
			"content-type": "application/x-ndjson; charset=utf-8",
			"cache-control": "no-store",
		},
	});
}

export default aiEndpoint;
