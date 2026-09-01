// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";
import { type ChatMessage, GroqError, streamChat } from "@/core/ai/groq";
import { buildSystemPrompt } from "@/core/ai/knowledge";
import { type AiModel, DEFAULT_MODEL_ID, getModelById } from "@/core/ai/models";
import { aiRateLimitMessage, consumeAiPostSearch, consumeAiRateLimit } from "@/core/ai/rate-limit";
import { type ChatToken, encodeToken, type PostPreview } from "@/core/ai/stream-protocol";
import { ThinkParser } from "@/core/ai/think-parser";
import { getAiAccessState, setUserAiOptIn } from "@/db/identity/queries";
import { getFeatureFlags } from "@/db/instance/queries";
import { type AiPostMatch, searchPostsForAi } from "@/db/posts";
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";
import { getImageUrl } from "@/images/client";
import { hasEffectiveAiAccess } from "@/lib/ai-access";

/** Tytuł karty i wpisu w promptcie: pierwsza linia opisu, przycięta do 60 znaków. */
function previewTitle(description: string): string {
	const firstLine = description.split("\n")[0] ?? "";
	const plain = firstLine.replace(/[#*_~`>[\]]/g, "").trim();
	return plain.length > 60 ? `${plain.slice(0, 57)}…` : plain;
}

/**
 * AI endpoint (AL, PRD #178) — jedyne miejsce, gdzie świeci prawdziwe AI.
 * F1 (#179): pełny łańcuch gatingowania przed strumieniem — sesja (middleware)
 * → master flag admina → blokada admina per user → opt-in usera. F2 (#180):
 * po przejściu wszystkich bramek leci realny strumień Groq (NDJSON). F4 (#182):
 * klient może wybrać model z AI_MODELS (serwer i tak waliduje id), limity
 * per user+model dają 429 z polskim komunikatem i czasem resetu, a AL Lite
 * dostaje reasoning_effort=low i reasoning nigdy nie opuszcza serwera.
 * Dodatkowo /access + /opt-in dla przełącznika w Ustawieniach.
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
	model: z.string().optional(),
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

	// F4 #182: model wybiera klient, ale id waliduje serwer — obcy id to 400,
	// brak modelu = domyślny AL Lite. Limit per user+model (progi z AI_MODELS,
	// dobrane pod limity TPM Groqa); 429 niesie polski komunikat + resetAt,
	// klient renderuje go inline.
	const model = parsed.data.model
		? getModelById(parsed.data.model)
		: getModelById(DEFAULT_MODEL_ID);
	if (!model) {
		return c.json({ error: "Nieznany model." }, 400);
	}
	const limit = consumeAiRateLimit(user.userId, model.id);
	if (!limit.allowed) {
		const resetAt = limit.resetAt as string;
		return c.json({ error: aiRateLimitMessage(model.uiName, resetAt), resetAt }, 429);
	}

	// F5 #183 (iteracja: fazy) — AL najpierw MYŚLI na żywo (i sam kończy
	// decyzją SZUKAJ/BEZPOSTÓW), potem SZUKA (budżet 1/min per user), na końcu
	// ODPOWIADA z wiedzą o postach. Kolejność faz widoczna u klienta.
	const lastUserMessage = [...parsed.data.messages].reverse().find((m) => m.role === "user");
	const tokens = alConversation({
		apiKey,
		model,
		userId: user.userId,
		accountHash: c.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH,
		conversation: parsed.data.messages,
		lastUserMessage: lastUserMessage?.content ?? "",
	});
	return ndjsonResponse(tokens);
});

/**
 * Tokeny z Groqa → odpowiedź NDJSON (linia = token). Myślenie z osobnego pola
 * delty przelata bez zmian; zwykłą treść przepuszczamy przez ThinkParser,
 * bo modele reasoningowe potrafią myśleć tagami <think>…</think> w treści.
 * hideReasoning (AL Lite) wycina tokeny myślenia — preview nigdy nie opuszcza
 * serwera. Błąd w trakcie generowania trafia do strumienia jako token tekstowy —
 * klient pokaże go inline w bąbelku, zamiast oberwać zerwanym requestem.
 */
/** Marker decyzji w fazie myślenia — testy rozpoznają po niej fazę myślenia. */
export const THINK_DECISION_INSTRUCTION = "SZUKAJ albo BEZPOSTÓW";

/** Profil reasoningu → parametr Groq: high pełne myślenie, trimmed zredukowane, Qwen bez parametru. */
function reasoningEffortFor(model: AiModel): "high" | "low" | undefined {
	return model.reasoning === "high" ? "high" : model.reasoning === "trimmed" ? "low" : undefined;
}

/** Karta podglądu posta — miniatura z CF Images, tytuł z pierwszej linii opisu. */
function toPreviewCard(match: AiPostMatch, accountHash: string): PostPreview {
	return {
		id: match.id,
		title: previewTitle(match.description),
		author: match.authorName,
		date: match.createdAt.toISOString().slice(0, 10),
		thumbnail: match.cfImageId
			? getImageUrl({ accountHash, cfImageId: match.cfImageId, variant: "thumbnail" })
			: null,
	};
}

/** Prompt fazy myślenia: krótkie rozważenie rozmowy + decyzja o postach. */
function thinkMessages(conversation: ChatMessage[]): ChatMessage[] {
	const recent = conversation.slice(-4).map((message) => ({
		role: message.role,
		content: message.content.slice(0, 1000),
	}));
	return [
		{
			role: "system",
			content:
				"Jesteś AL, asystentem w rodzinnej aplikacji Wspólniak. Pomyśl krótko o rozmowie i zdecyduj, czy do dobrej odpowiedzi potrzebujesz treści postów ze zdjęciami z feedu (co jest na zdjęciach, wydarzenia, osoby, miejsca, daty, wspomnienia). Zakończ wypowiedź dokładnie jednym słowem: SZUKAJ — gdy posty mogą być przydatne (w razie wątpliwości wybierz SZUKAJ), albo BEZPOSTÓW — wyłącznie przy pytaniach o aplikację, pogaduchach i powitaniach.",
		},
		...recent,
	];
}

/**
 * Pełna rozmowa z AL jako generator tokenów, w trzech fazach widocznych u
 * klienta: (1) MYŚLENIE — reasoning przelata na żywo (poza AL Lite, u którego
 * nigdy nie wychodzi z serwera), a tekst decyzji (SZUKAJ/BEZPOSTÓW) zbiera
 * się po cichu; (2) SZUKANIE — token "searching", keyword search z budżetem
 * 1/min per user, karty postów; (3) ODPOWIEDŹ — system prompt powiązany z tym,
 * co AL dostał; myślenie tej fazy zostaje na serwerze (AL już myślał na głos).
 * Awaria myślenia = fail-open bez postów; błąd odpowiedzi = polski komunikat
 * w bąbelku (zob. aiFailureMessage).
 */
/**
 * Faza 1 — MYŚLENIE: reasoning przelata na żywo (poza AL Lite, u którego
 * nigdy nie wychodzi z serwera), a tekst decyzji (SZUKAJ/BEZPOSTÓW) zbiera
 * się po cichu. Awaria = pusta decyzja (fail-open: odpowiedź bez postów).
 */
async function* thinkPhase(input: {
	apiKey: string;
	model: AiModel;
	conversation: ChatMessage[];
}): AsyncGenerator<ChatToken, string> {
	let decision = "";
	try {
		for await (const token of streamChat({
			apiKey: input.apiKey,
			model: input.model.id,
			messages: thinkMessages(input.conversation),
			reasoningEffort: input.model.reasoning === "on" ? undefined : "low",
		})) {
			if (token.kind === "reasoning") {
				if (input.model.reasoning !== "trimmed") yield token;
				continue;
			}
			if (token.kind !== "text") continue;
			decision += token.text;
			if (/SZUKAJ|BEZPOSTÓW/.test(decision)) break;
		}
	} catch {
		decision = "";
	}
	return decision;
}

/**
 * Faza 2 — SZUKANIE: znacznik fazy, keyword search z budżetem 1/min per user
 * i karty postów. Bez decyzji SZUKAJ albo po wyczerpaniu budżetu zwraca []
 * (odpowiedź bez postów; prompt każe wtedy mówić wprost o braku wglądu).
 */
async function* searchPhase(input: {
	model: AiModel;
	userId: string;
	accountHash: string;
	lastUserMessage: string;
	decision: string;
}): AsyncGenerator<ChatToken, AiPostMatch[]> {
	if (!input.lastUserMessage || !/\bSZUKAJ\b/i.test(input.decision)) return [];
	if (!consumeAiPostSearch(input.userId)) return [];
	yield { kind: "searching" };
	const matches = await searchPostsForAi(input.lastUserMessage, input.model.injectedPostCount);
	if (matches.length > 0) {
		yield {
			kind: "posts",
			posts: matches.map((match) => toPreviewCard(match, input.accountHash)),
		};
	}
	return matches;
}

/** Faza 3 — ODPOWIEDŹ: strumień treści; myślenie tej fazy zostaje na serwerze. */
async function* answerPhase(input: {
	apiKey: string;
	model: AiModel;
	conversation: ChatMessage[];
	systemPrompt: string;
}): AsyncGenerator<ChatToken> {
	const thinkParser = new ThinkParser();
	try {
		for await (const token of streamChat({
			apiKey: input.apiKey,
			model: input.model.id,
			messages: [{ role: "system", content: input.systemPrompt }, ...input.conversation],
			reasoningEffort: reasoningEffortFor(input.model),
		})) {
			if (token.kind !== "text") continue;
			for (const parsed of thinkParser.push(token.text)) {
				if (parsed.kind === "text") yield parsed;
			}
		}
		for (const parsed of thinkParser.flush()) {
			if (parsed.kind === "text") yield parsed;
		}
	} catch (error) {
		yield { kind: "text", text: aiFailureMessage(error) };
	}
}

async function* alConversation(input: {
	apiKey: string;
	model: AiModel;
	userId: string;
	accountHash: string;
	conversation: ChatMessage[];
	lastUserMessage: string;
}): AsyncGenerator<ChatToken> {
	const decision = yield* thinkPhase(input);
	const matches = yield* searchPhase({ ...input, decision });

	// System prompt doklejany SERWEROWO — klient nie może go nadpisać.
	const systemPrompt = buildSystemPrompt(
		matches.map((match) => ({
			title: previewTitle(match.description),
			description: match.description,
			author: match.authorName,
			date: match.createdAt.toISOString().slice(0, 10),
		})),
	);
	yield* answerPhase({
		apiKey: input.apiKey,
		model: input.model,
		conversation: input.conversation,
		systemPrompt,
	});
}

/**
 * Polski komunikat błędu do bąbelka. Błędy Groqa (w tym 429 TPM) niosą id
 * organizacji i anglojęzyczny żargon — nigdy nie przepuszczamy ich raw.
 */
function aiFailureMessage(error: unknown): string {
	if (error instanceof GroqError) {
		return error.status === 429
			? "Osiągnąłeś limit korzystania. Spróbuj ponownie za minutę."
			: "AL ma teraz problemy techniczne. Spróbuj ponownie za chwilę.";
	}
	const message = error instanceof Error ? error.message : "Nieznany błąd podczas generowania";
	return `[Błąd AL: ${message}]`;
}

/** Tokeny rozmowy AL → odpowiedź NDJSON (linia = token). Zobacz alConversation. */
function ndjsonResponse(tokens: AsyncGenerator<ChatToken>): Response {
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();
			try {
				for await (const token of tokens) {
					controller.enqueue(encoder.encode(encodeToken(token)));
				}
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
