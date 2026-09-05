// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Założenia kodowane przez te testy (stan przed RED):
 * - Endpoint: POST /api/ai/chat { messages: [{role: user|assistant, content}],
 *   model?: string } — max 50 wiadomości, content max 8000. Model wybiera
 *   KLIENT, serwer waliduje id przeciw AI_MODELS (F4); brak modelu = AL Max,
 *   obcy id → 400. Rate limit per user+model (3/4/7 na minutę) → 429 z polskim
 *   komunikatem i resetAt; wiedza o postach wg F5 w system prompcie.
 * - Gating (kolejność z issue #179): brak/nieprawidłowa sesja → 401
 *   (authMiddleware); master flag wyłączony → 403; aiBlocked → 403; brak
 *   opt-in → 403; wszystko OK → strumień NDJSON (200).
 * - Brak klucza GROQ_API_KEY w env → 500 z polskim komunikatem.
 * - Błąd Groqa po otwarciu strumienia → strumień zamyka się tokenem tekstowym
 *   [Błąd AL: …] (klient pokaże go inline), HTTP pozostaje 200.
 * - GET /access zwraca {master, aiOptIn, aiBlocked, effective} — effective
 *   liczone przez hasEffectiveAiAccess (master ∧ ¬blocked ∧ opt-in).
 * - PUT /opt-in: zablokowanemu 403; poprawny boolean zapisuje i zwraca stan.
 * - Mockujemy wyłącznie granice systemu: moduły DB (identity/instance), sesję
 *   JWT i klienta Groq (fetch). Parse NDJSON testujemy realnie.
 * - Świadomie NIE testowane: UI (picker, animacja, karty — HITL), timing
 *   wygasania okna limitu w realnym czasie.
 */

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
	getAiAccessState: vi.fn(),
	setUserAiOptIn: vi.fn(),
}));

vi.mock("@/db/instance/queries", () => ({
	getFeatureFlags: vi.fn(),
}));

vi.mock("@/core/ai/groq", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/core/ai/groq")>();
	return { ...actual, streamChat: vi.fn() };
});

vi.mock("@/db/posts", () => ({
	searchPostsForAi: vi.fn(),
}));

import { Hono } from "hono";
import { GroqError, streamChat } from "@/core/ai/groq";
import { buildSystemPrompt } from "@/core/ai/knowledge";
import { DEFAULT_MODEL_ID } from "@/core/ai/models";
import { resetAiRateLimitsForTests } from "@/core/ai/rate-limit";
import { findActiveUserById, getAiAccessState, setUserAiOptIn } from "@/db/identity/queries";
import { SESSION_COOKIE_NAME, verifySessionCookie } from "@/db/identity/session";
import { getFeatureFlags } from "@/db/instance/queries";
import { searchPostsForAi } from "@/db/posts";
import aiEndpoint from "./ai";

const mockVerifySessionCookie = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockGetAiAccessState = vi.mocked(getAiAccessState);
const mockSetUserAiOptIn = vi.mocked(setUserAiOptIn);
const mockGetFeatureFlags = vi.mocked(getFeatureFlags);
const mockStreamChat = vi.mocked(streamChat);
const mockSearchPosts = vi.mocked(searchPostsForAi);

const FLAGS_AI_OFF = {
	video: true,
	markdown: true,
	library: true,
	chat: true,
	albums: true,
	ai: false,
};

const FLAGS_AI_ON = { ...FLAGS_AI_OFF, ai: true };

const ENV = {
	SESSION_SECRET: "secret",
	GROQ_API_KEY: "gsk_test",
	CLOUDFLARE_IMAGES_ACCOUNT_HASH: "imghash",
};

function createApi() {
	const api = new Hono<{
		Bindings: {
			SESSION_SECRET: string;
			GROQ_API_KEY?: string;
			CLOUDFLARE_IMAGES_ACCOUNT_HASH: string;
		};
	}>().basePath("/api");
	api.route("/ai", aiEndpoint);
	return api;
}

function memberHeaders() {
	return { Cookie: `${SESSION_COOKIE_NAME}=valid-jwt` };
}

/** Odblokowuje bramki F1: master ON + user opt-in, nieblokowany. */
function allowAi() {
	mockGetFeatureFlags.mockResolvedValue(FLAGS_AI_ON);
	mockGetAiAccessState.mockResolvedValue({ aiOptIn: true, aiBlocked: false });
}

/**
 * Zamienia mock streamChat w generator zwracający zadane tokeny. Router
 * szukania (mikro-decyzja przed odpowiedzią) rozpoznajemy po markerze
 * w system prompcie — dostaje `routerResponse` (domyślnie NIE = bez postów).
 */
function mockGroqTokens(
	tokens: Array<{ kind: "text" | "reasoning"; text: string }>,
	routerResponse = "NIE",
): void {
	mockStreamChat.mockImplementation(async function* (input?: {
		messages?: { content?: string }[];
	}) {
		const first = input?.messages?.[0]?.content ?? "";
		if (first.includes("jednym słowem")) {
			yield { kind: "text", text: routerResponse };
			return;
		}
		for (const token of tokens) {
			yield token;
		}
	});
}

/** Parsuje body odpowiedzi NDJSON → lista tokenów {k, v}. */
function parseNdjson(body: string): Array<{ k: string; v: string }> {
	return body
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as { k: string; v: string });
}

function requestChat(api: ReturnType<typeof createApi>, env: Record<string, string>) {
	return api.request(
		"/api/ai/chat",
		{
			method: "POST",
			headers: { ...memberHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({
				messages: [{ role: "user", content: "Cześć, co to Wspólniak?" }],
			}),
		},
		env,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	mockVerifySessionCookie.mockResolvedValue({ userId: "u2", name: "Kasia", role: "member" });
	mockFindUser.mockResolvedValue({
		id: "u2",
		name: "Kasia",
		role: "member",
		tokenHash: "hash",
		deletedAt: new Date(),
		createdAt: new Date(),
		aiOptIn: false,
		aiBlocked: false,
	});
	mockGetAiAccessState.mockResolvedValue({ aiOptIn: false, aiBlocked: false });
	mockGetFeatureFlags.mockResolvedValue(FLAGS_AI_OFF);
	mockSearchPosts.mockResolvedValue([]);
});

describe("POST /api/ai/chat — matryca gatingu (#179)", () => {
	it("401 dla anonima (brak cookie sesyjnego)", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/ai/chat",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					messages: [{ role: "user", content: "hej" }],
				}),
			},
			ENV,
		);
		expect(res.status).toBe(401);
		expect(mockStreamChat).not.toHaveBeenCalled();
	});

	it("403 gdy master flag wyłączony (nawet dla opt-in usera)", async () => {
		mockGetAiAccessState.mockResolvedValue({ aiOptIn: true, aiBlocked: false });
		const api = createApi();
		const res = await requestChat(api, ENV);
		expect(res.status).toBe(403);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("AL jest obecnie wyłączony");
		expect(mockStreamChat).not.toHaveBeenCalled();
	});

	it("403 gdy user zablokowany przez admina (mimo mastera ON i opt-in)", async () => {
		mockGetFeatureFlags.mockResolvedValue(FLAGS_AI_ON);
		mockGetAiAccessState.mockResolvedValue({ aiOptIn: true, aiBlocked: true });
		const api = createApi();
		const res = await requestChat(api, ENV);
		expect(res.status).toBe(403);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("wyłączony przez administratora");
		expect(mockStreamChat).not.toHaveBeenCalled();
	});

	it("403 gdy user bez opt-in (mimo mastera ON)", async () => {
		mockGetFeatureFlags.mockResolvedValue(FLAGS_AI_ON);
		// domyślne mockGetAiAccessState: {aiOptIn:false, aiBlocked:false}
		const api = createApi();
		const res = await requestChat(api, ENV);
		expect(res.status).toBe(403);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("Włącz AL w Ustawieniach");
		// guard: stream nie wystartował
		expect(mockStreamChat).not.toHaveBeenCalled();
	});

	it("200 + strumień NDJSON dla w pełni dopuszczonego usera", async () => {
		mockGetFeatureFlags.mockResolvedValue(FLAGS_AI_ON);
		mockGetAiAccessState.mockResolvedValue({ aiOptIn: true, aiBlocked: false });
		mockGroqTokens([
			{ kind: "reasoning", text: "myślę nad odpowiedzią" },
			{ kind: "text", text: "Wspólniak to " },
			{ kind: "text", text: "rodzinny serwis." },
		]);
		const api = createApi();
		// jawny AL Max — domyślny (Lite) maskuje reasoning, więc passthrough
		// myślenia testujemy na modelu „high"
		const res = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("application/x-ndjson");
		const tokens = parseNdjson(await res.text());
		// myślenie odpowiedzi zostaje na serwerze (AL myślał na głos w fazie 1)
		expect(tokens).toEqual([
			{ k: "t", v: "Wspólniak to " },
			{ k: "t", v: "rodzinny serwis." },
		]);
		expect(mockStreamChat).toHaveBeenCalledTimes(2); // router + odpowiedź
		const answerCall = mockStreamChat.mock.calls.at(-1);
		if (!answerCall) throw new Error("streamChat nie został wywołany");
		expect(answerCall[0]).toEqual({
			apiKey: "gsk_test",
			model: "openai/gpt-oss-120b",
			messages: [
				{ role: "system", content: buildSystemPrompt([]) },
				{ role: "user", content: "Cześć, co to Wspólniak?" },
			],
			reasoningEffort: "high",
		});
	});

	it("400 przy nieprawidłowym body", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/ai/chat",
			{
				method: "POST",
				headers: { ...memberHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ messages: [] }),
			},
			ENV,
		);
		expect(res.status).toBe(400);
		expect(mockStreamChat).not.toHaveBeenCalled();
	});

	it("błąd Groqa trafia do strumienia jako token tekstowy", async () => {
		mockGetFeatureFlags.mockResolvedValue(FLAGS_AI_ON);
		mockGetAiAccessState.mockResolvedValue({ aiOptIn: true, aiBlocked: false });
		mockStreamChat.mockImplementation(async function* () {
			yield { kind: "text", text: "początek" };
			throw new Error("boom");
		});
		const api = createApi();
		const res = await requestChat(api, ENV);
		expect(res.status).toBe(200);
		const tokens = parseNdjson(await res.text());
		expect(tokens).toEqual([
			{ k: "t", v: "początek" },
			{ k: "t", v: "[Błąd AL: boom]" },
		]);
	});
});

describe("POST /api/ai/chat — klucz i model (F2)", () => {
	it("500 przy braku GROQ_API_KEY", async () => {
		mockGetFeatureFlags.mockResolvedValue(FLAGS_AI_ON);
		mockGetAiAccessState.mockResolvedValue({ aiOptIn: true, aiBlocked: false });
		const api = createApi();
		const res = await requestChat(api, { SESSION_SECRET: "secret" });
		expect(res.status).toBe(500);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("GROQ_API_KEY");
		expect(mockStreamChat).not.toHaveBeenCalled();
	});

	it("przekazuje model domyślny AL Lite (bez modelu w żądaniu)", async () => {
		mockGetFeatureFlags.mockResolvedValue(FLAGS_AI_ON);
		mockGetAiAccessState.mockResolvedValue({ aiOptIn: true, aiBlocked: false });
		mockGroqTokens([{ kind: "text", text: "ok" }]);
		const api = createApi();
		const res = await requestChat(api, ENV);
		expect(res.status).toBe(200);
		const call = mockStreamChat.mock.calls.at(-1);
		if (!call) throw new Error("streamChat nie został wywołany");
		expect(call[0].model).toBe(DEFAULT_MODEL_ID);
		expect(DEFAULT_MODEL_ID).toBe("openai/gpt-oss-20b");
	});
});

describe("GET /api/ai/access — stan AL dla usera (#179)", () => {
	it("zwraca pełny stan i effective=true dla dopuszczonego", async () => {
		mockGetFeatureFlags.mockResolvedValue(FLAGS_AI_ON);
		mockGetAiAccessState.mockResolvedValue({ aiOptIn: true, aiBlocked: false });
		const api = createApi();
		const res = await api.request("/api/ai/access", { headers: memberHeaders() }, ENV);
		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: Record<string, unknown> };
		expect(json.data).toEqual({
			master: true,
			aiOptIn: true,
			aiBlocked: false,
			effective: true,
		});
	});

	it("effective=false gdy master wyłączony", async () => {
		mockGetAiAccessState.mockResolvedValue({ aiOptIn: true, aiBlocked: false });
		const api = createApi();
		const res = await api.request("/api/ai/access", { headers: memberHeaders() }, ENV);
		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: Record<string, unknown> };
		expect(json.data).toEqual({
			master: false,
			aiOptIn: true,
			aiBlocked: false,
			effective: false,
		});
	});
});

describe("PUT /api/ai/opt-in — przełącznik w Ustawieniach (#179)", () => {
	it("403 gdy user zablokowany", async () => {
		mockGetAiAccessState.mockResolvedValue({ aiOptIn: false, aiBlocked: true });
		const api = createApi();
		const res = await api.request(
			"/api/ai/opt-in",
			{
				method: "PUT",
				headers: { ...memberHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ optIn: true }),
			},
			ENV,
		);
		expect(res.status).toBe(403);
		expect(mockSetUserAiOptIn).not.toHaveBeenCalled();
	});

	it("zapisuje opt-in i zwraca stan", async () => {
		mockGetAiAccessState.mockResolvedValue({ aiOptIn: false, aiBlocked: false });
		const api = createApi();
		const res = await api.request(
			"/api/ai/opt-in",
			{
				method: "PUT",
				headers: { ...memberHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ optIn: true }),
			},
			ENV,
		);
		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { aiOptIn: boolean } };
		expect(json.data).toEqual({ aiOptIn: true });
		expect(mockSetUserAiOptIn).toHaveBeenCalledWith("u2", true);
	});

	it("400 przy nieprawidłowym body", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/ai/opt-in",
			{
				method: "PUT",
				headers: { ...memberHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ optIn: "yes" }),
			},
			ENV,
		);
		expect(res.status).toBe(400);
		expect(mockSetUserAiOptIn).not.toHaveBeenCalled();
	});
});

describe("POST /api/ai/chat — model i limity (F4 #182)", () => {
	beforeEach(() => {
		allowAi();
		resetAiRateLimitsForTests();
	});

	it("400 dla obcego id modelu", async () => {
		mockGroqTokens([{ kind: "text", text: "ok" }]);
		const api = createApi();
		const res = await postChat(api, ENV, { model: "obcy/model-id" });
		expect(res.status).toBe(400);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("Nieznany model");
		expect(mockStreamChat).not.toHaveBeenCalled();
	});

	it("429 dla AL Max po 1 żądaniu (limit 1/min), z polskim komunikatem i resetAt", async () => {
		mockGroqTokens([{ kind: "text", text: "ok" }]);
		const api = createApi();
		for (let i = 0; i < 1; i++) {
			const ok = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
			expect(ok.status).toBe(200);
			await ok.text();
		}
		const callsBefore = mockStreamChat.mock.calls.length;
		const blocked = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
		expect(blocked.status).toBe(429);
		const json = (await blocked.json()) as { error: string; resetAt: string };
		expect(json.error).toContain("Limit odpowiedzi");
		expect(json.error).toContain("AL Max");
		expect(json.error).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
		const hhmm = new Date(json.resetAt).toLocaleTimeString("pl-PL", {
			timeZone: "Europe/Warsaw",
			hour: "2-digit",
			minute: "2-digit",
		});
		expect(json.resetAt).toBeTruthy();
		expect(json.error).toContain(hhmm);
		expect(mockStreamChat.mock.calls.length).toBe(callsBefore);
	});

	it("429 dla AL Pro po 2 żądaniach (limit 2/min)", async () => {
		mockGroqTokens([{ kind: "text", text: "ok" }]);
		const api = createApi();
		for (let i = 0; i < 2; i++) {
			const ok = await postChat(api, ENV, { model: "qwen/qwen3.8-27b" });
			expect(ok.status).toBe(200);
		}
		const blocked = await postChat(api, ENV, { model: "qwen/qwen3.8-27b" });
		expect(blocked.status).toBe(429);
	});

	it("429 dla AL Lite po 5 żądaniach (limit 5/min)", async () => {
		mockGroqTokens([{ kind: "text", text: "ok" }]);
		const api = createApi();
		for (let i = 0; i < 5; i++) {
			const ok = await postChat(api, ENV, { model: "openai/gpt-oss-20b" });
			expect(ok.status).toBe(200);
		}
		const blocked = await postChat(api, ENV, { model: "openai/gpt-oss-20b" });
		expect(blocked.status).toBe(429);
	});

	it("limity niezależne per model — wyczerpany AL Max nie blokuje AL Lite", async () => {
		mockGroqTokens([{ kind: "text", text: "ok" }]);
		const api = createApi();
		for (let i = 0; i < 1; i++) {
			const ok = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
			expect(ok.status).toBe(200);
			await ok.text();
		}
		const lite = await postChat(api, ENV, { model: "openai/gpt-oss-20b" });
		expect(lite.status).toBe(200);
		await lite.text();
		expect(mockStreamChat.mock.calls).toHaveLength(4); // 2 żądania × (myślenie + odpowiedź)
	});

	it("limity niezależne per user — drugi user startuje z pustym oknem", async () => {
		mockGroqTokens([{ kind: "text", text: "ok" }]);
		const api = createApi();
		for (let i = 0; i < 1; i++) {
			const ok = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
			expect(ok.status).toBe(200);
			await ok.text();
		}
		mockVerifySessionCookie.mockResolvedValue({ userId: "u3", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u3",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: new Date(),
			createdAt: new Date(),
			aiOptIn: true,
			aiBlocked: false,
		});
		const other = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
		expect(other.status).toBe(200);
	});

	it("po wygaśnięciu okna (60 s) limit wraca", async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
			mockGroqTokens([{ kind: "text", text: "ok" }]);
			const api = createApi();
			for (let i = 0; i < 1; i++) {
				const ok = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
				expect(ok.status).toBe(200);
				await ok.text();
			}
			vi.advanceTimersByTime(61_000);
			const again = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
			expect(again.status).toBe(200);
		} finally {
			vi.useRealTimers();
		}
	});
});

function postChat(
	api: ReturnType<typeof createApi>,
	env: Record<string, string>,
	extra: { model?: string; message?: string },
) {
	return api.request(
		"/api/ai/chat",
		{
			method: "POST",
			headers: { ...memberHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({
				messages: [{ role: "user", content: extra.message ?? "Cześć, co to Wspólniak?" }],
				...extra,
			}),
		},
		env,
	);
}

describe("POST /api/ai/chat — wiedza o postach (F5 #183)", () => {
	const POST_A = {
		id: "p1",
		description: "Wakacje nad Bałtykiem\nDalsze linie opisu też są ważne",
		authorName: "Mama",
		createdAt: new Date("2026-08-15T12:00:00Z"),
		cfImageId: "img-1",
	};

	beforeEach(() => {
		allowAi();
		resetAiRateLimitsForTests();
	});

	it("searchPostsForAi dostaje limit wg modelu (15/10/8)", async () => {
		mockGroqTokens([{ kind: "text", text: "ok" }], "SZUKAJ");
		const api = createApi();

		await (await postChat(api, ENV, { model: "openai/gpt-oss-120b" })).text();
		expect(mockSearchPosts).toHaveBeenLastCalledWith(expect.any(String), 15);
		resetAiRateLimitsForTests(); // budżet szukania: 6/min — świeże okno na kolejny model

		await (await postChat(api, ENV, { model: "qwen/qwen3.8-27b" })).text();
		expect(mockSearchPosts).toHaveBeenLastCalledWith(expect.any(String), 10);
		resetAiRateLimitsForTests();

		await (await postChat(api, ENV, { model: "openai/gpt-oss-20b" })).text();
		expect(mockSearchPosts).toHaveBeenCalledWith(expect.any(String), 8);
	});

	it("payload do Groqa = metadane postów + rozmowa (bez obrazów, komentarzy, czatu)", async () => {
		mockSearchPosts.mockResolvedValue([POST_A]);
		mockGroqTokens([{ kind: "text", text: "ok" }], "SZUKAJ");
		const api = createApi();
		const res = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
		expect(res.status).toBe(200);
		await res.text(); // wyczerp strumień — pipeline wykonuje się w locie

		const call = mockStreamChat.mock.calls.at(-1);
		if (!call) throw new Error("streamChat nie został wywołany");
		const system = call[0].messages[0];
		if (!system || system.role !== "system") throw new Error("brak system promptu");
		const userMessage = call[0].messages[1];
		if (!userMessage) throw new Error("brak wiadomości usera");

		// Metadane (tytuł z pierwszej linii, pełny opis, autor, data) są w prompcie.
		expect(system.content).toContain("Wakacje nad Bałtykiem");
		expect(system.content).toContain("Dalsze linie opisu też są ważne");
		expect(system.content).toContain("Mama");
		expect(system.content).toContain("2026-08-15");

		// Prywatność: cfImageId i URL obrazów NIE wchodzą do promptu.
		expect(system.content).not.toContain("img-1");
		expect(system.content).not.toContain("imagedelivery");

		// Rozmowa idzie 1:1 (role+content), bez dodatkowych pól.
		expect(call[0].messages).toHaveLength(2);
		expect(Object.keys(userMessage).sort()).toEqual(["content", "role"]);
	});

	it("token posts jako pierwszy w strumieniu, z miniaturą CF Images", async () => {
		mockSearchPosts.mockResolvedValue([POST_A]);
		mockGroqTokens([{ kind: "text", text: "odpowiedź" }], "SZUKAJ");
		const api = createApi();
		const res = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
		expect(res.status).toBe(200);
		const tokens = parseNdjson(await res.text());
		expect(tokens[0]).toEqual({ k: "s" }); // faza szukania
		expect(tokens[1]).toEqual({
			k: "p",
			posts: [
				{
					id: "p1",
					title: "Wakacje nad Bałtykiem",
					author: "Mama",
					date: "2026-08-15",
					thumbnail: "https://imagedelivery.net/imghash/img-1/thumbnail",
				},
			],
		});
		expect(tokens[2]).toEqual({ k: "t", v: "odpowiedź" });
	});

	it("bez dopasowań — brak tokenu posts w strumieniu", async () => {
		mockGroqTokens([{ kind: "text", text: "ok" }]);
		const api = createApi();
		const res = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
		const tokens = parseNdjson(await res.text());
		expect(tokens.every((token) => token.k !== "p")).toBe(true);
	});

	it("AL Lite: reasoning nigdy nie opuszcza serwera, effort=low", async () => {
		mockGroqTokens([
			{ kind: "reasoning", text: "sekretne myśli" },
			{ kind: "text", text: "odpowiedź Lite" },
		]);
		const api = createApi();
		const res = await postChat(api, ENV, { model: "openai/gpt-oss-20b" });
		expect(res.status).toBe(200);
		const tokens = parseNdjson(await res.text());
		expect(tokens).toEqual([{ k: "t", v: "odpowiedź Lite" }]);
		const call = mockStreamChat.mock.calls.at(-1);
		if (!call) throw new Error("streamChat nie został wywołany");
		expect(call[0].reasoningEffort).toBe("low");
	});

	it("AL Pro: bez parametru reasoning_effort", async () => {
		mockGroqTokens([{ kind: "text", text: "ok" }]);
		const api = createApi();
		await postChat(api, ENV, { model: "qwen/qwen3.8-27b" });
		const call = mockStreamChat.mock.calls.at(-1);
		if (!call) throw new Error("streamChat nie został wywołany");
		expect(call[0].reasoningEffort).toBeUndefined();
	});
});

describe("POST /api/ai/chat — błędy Groqa i budżet tokenów (TPM)", () => {
	beforeEach(() => {
		allowAi();
		resetAiRateLimitsForTests();
	});

	it("Groq 429 (TPM) → polski komunikat w bąbelku, bez id organizacji i żargonu", async () => {
		mockStreamChat.mockImplementation(async function* (input?: {
			messages?: { content?: string }[];
		}) {
			const first = input?.messages?.[0]?.content ?? "";
			if (first.includes("jednym słowem")) {
				yield { kind: "text", text: "NIE" };
				return;
			}
			yield { kind: "text", text: "częściowa odpowiedź" };
			throw new GroqError(
				"Rate limit reached for model openai/gpt-oss-120b in organization org_01abc on tokens per minute (TPM): Limit 8000",
				429,
			);
		});
		const api = createApi();
		const res = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
		expect(res.status).toBe(200);
		const body = await res.text();
		const tokens = parseNdjson(body);
		expect(tokens).toEqual([
			{ k: "t", v: "częściowa odpowiedź" },
			{ k: "t", v: "Osiągnąłeś limit korzystania. Spróbuj ponownie za minutę." },
		]);
		expect(body).not.toContain("org_01abc");
		expect(body).not.toContain("Rate limit reached");
		expect(body).not.toContain("gpt-oss");
	});

	it("inny błąd Groqa (np. 503) → generyczny polski komunikat", async () => {
		mockStreamChat.mockImplementation(async function* (input?: {
			messages?: { content?: string }[];
		}) {
			const first = input?.messages?.[0]?.content ?? "";
			if (first.includes("jednym słowem")) {
				yield { kind: "text", text: "NIE" };
				return;
			}
			yield { kind: "text", text: "start" };
			throw new GroqError("Service unavailable", 503);
		});
		const api = createApi();
		const res = await postChat(api, ENV, { model: "openai/gpt-oss-20b" });
		const tokens = parseNdjson(await res.text());
		expect(tokens).toEqual([
			{ k: "t", v: "start" },
			{ k: "t", v: "AL ma teraz problemy techniczne. Spróbuj ponownie za chwilę." },
		]);
	});

	it("opis wstrzyknięty do promptu jest przycięty do 240 znaków", async () => {
		const longDescription = `Post o wakacjach. ${"Długi opis z wieloma szczegółami. ".repeat(12)}`;
		expect(longDescription.length).toBeGreaterThan(240);
		mockSearchPosts.mockResolvedValue([
			{
				id: "p9",
				description: longDescription,
				authorName: "Tata",
				createdAt: new Date("2026-07-01T10:00:00Z"),
				cfImageId: null,
			},
		]);
		mockGroqTokens([{ kind: "text", text: "ok" }], "SZUKAJ");
		const api = createApi();
		const res = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
		expect(res.status).toBe(200);
		await res.text();
		const call = mockStreamChat.mock.calls.at(-1);
		if (!call) throw new Error("streamChat nie został wywołany");
		const system = call[0].messages[0];
		if (!system) throw new Error("brak system promptu");
		expect(system.content).toContain("…");
		expect(system.content).not.toContain(longDescription);
		// 240 znaków + wielokropek = 241; żaden wiersz postów nie jest dłuższy
		const postLine = system.content.split("\n").find((line) => line.startsWith("- „"));
		if (!postLine) throw new Error("brak linii postu w promptcie");
		expect(postLine.length).toBeLessThan(400);
	});
});

describe("POST /api/ai/chat — router wiedzy: AL decyduje o szukaniu postów", () => {
	const ROUTER_POST = {
		id: "p1",
		description: "Wakacje nad Bałtykiem\nDalsze linie opisu też są ważne",
		authorName: "Mama",
		createdAt: new Date("2026-08-15T12:00:00Z"),
		cfImageId: "img-1",
	};

	beforeEach(() => {
		allowAi();
		resetAiRateLimitsForTests();
	});

	it("router TAK → search rusza, posty w prompcie z deklaracją dostępu, karty w strumieniu", async () => {
		mockSearchPosts.mockResolvedValue([ROUTER_POST]);
		mockGroqTokens([{ kind: "text", text: "Na zdjęciach widać…" }], "SZUKAJ");
		const api = createApi();
		const res = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
		expect(res.status).toBe(200);
		const body = await res.text();

		expect(mockSearchPosts).toHaveBeenCalledOnce();
		const call = mockStreamChat.mock.calls.at(-1);
		if (!call) throw new Error("streamChat nie został wywołany");
		const system = call[0].messages[0];
		if (!system) throw new Error("brak system promptu");
		expect(system.content).toContain("MASZ DOSTĘP");
		expect(system.content).toContain("Wakacje nad Bałtykiem");

		const tokens = parseNdjson(body);
		expect(tokens[0]?.k).toBe("s"); // faza szukania
		expect(tokens[1]?.k).toBe("p");
	});

	it("router NIE → search nie jest wołany, prompt mówi wprost, że tym razem nie szukał", async () => {
		mockGroqTokens([{ kind: "text", text: "Cześć! Jak leci?" }]);
		const api = createApi();
		const res = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
		expect(res.status).toBe(200);
		const body = await res.text();

		expect(mockSearchPosts).not.toHaveBeenCalled();
		const call = mockStreamChat.mock.calls.at(-1);
		if (!call) throw new Error("streamChat nie został wywołany");
		const system = call[0].messages[0];
		if (!system) throw new Error("brak system promptu");
		expect(system.content).toContain("posty NIE były przeszukiwane");
		expect(system.content).not.toContain("nie znalazłeś teraz pasujących postów");

		const tokens = parseNdjson(body);
		expect(tokens.every((token) => token.k !== "p")).toBe(true);
	});

	it("SZUKAJ bez trafień → prompt mówi wprost, że szukał i nic nie pasowało", async () => {
		mockGroqTokens([{ kind: "text", text: "ok" }], "SZUKAJ");
		mockSearchPosts.mockResolvedValue([]);
		const api = createApi();
		const res = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
		expect(res.status).toBe(200);
		await res.text();

		const call = mockStreamChat.mock.calls.at(-1);
		if (!call) throw new Error("streamChat nie został wywołany");
		const system = call[0].messages[0];
		if (!system) throw new Error("brak system promptu");
		expect(system.content).toContain("Szukałeś, ale nic nie pasowało");
	});

	it("błąd routera = fail-open do odpowiedzi bez postów (nie 500)", async () => {
		mockStreamChat.mockImplementation(async function* (input?: {
			messages?: { content?: string }[];
		}) {
			const first = input?.messages?.[0]?.content ?? "";
			if (first.includes("jednym słowem")) {
				throw new GroqError("router down", 503);
			}
			yield { kind: "text", text: "odpowiedź mimo awarii routera" };
		});
		const api = createApi();
		const res = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
		expect(res.status).toBe(200);
		expect(mockSearchPosts).not.toHaveBeenCalled();
		const tokens = parseNdjson(await res.text());
		expect(tokens).toEqual([{ k: "t", v: "odpowiedź mimo awarii routera" }]);
	});
});

describe("POST /api/ai/chat — budżet przeszukiwania postów (6/min per user)", () => {
	const SEARCH_POST = {
		id: "p1",
		description: "Wakacje nad Bałtykiem\nDalsze linie opisu też są ważne",
		authorName: "Mama",
		createdAt: new Date("2026-08-15T12:00:00Z"),
		cfImageId: "img-1",
	};

	beforeEach(() => {
		allowAi();
		resetAiRateLimitsForTests();
	});

	it("sześć szukań przechodzi, siódme w tej samej minucie jest pomijane", async () => {
		mockGroqTokens([{ kind: "text", text: "Na zdjęciach widać…" }], "SZUKAJ");
		mockSearchPosts.mockResolvedValue([SEARCH_POST]);
		const api = createApi();

		// 6 szukań = budżet na minutę. Limity odpowiedzi są per model, więc
		// rozkładamy wywołania: 1× Max (1/min) + 2× Pro (2/min) + 3× Lite (5/min) —
		// dopiero siódme (Lite #4) ma spaść na pustym budżecie szukania.
		const models = [
			"openai/gpt-oss-120b",
			"qwen/qwen3.8-27b",
			"qwen/qwen3.8-27b",
			"openai/gpt-oss-20b",
			"openai/gpt-oss-20b",
			"openai/gpt-oss-20b",
		] as const;
		for (const model of models) {
			const res = await postChat(api, ENV, { model });
			expect(res.status).toBe(200);
			const tokens = parseNdjson(await res.text());
			expect(tokens.some((token) => token.k === "p")).toBe(true);
		}
		expect(mockSearchPosts).toHaveBeenCalledTimes(6);

		const seventh = await postChat(api, ENV, { model: "openai/gpt-oss-20b" });
		expect(seventh.status).toBe(200);
		const seventhTokens = parseNdjson(await seventh.text());
		expect(mockSearchPosts).toHaveBeenCalledTimes(6); // budżet wyczerpany
		expect(seventhTokens.every((token) => token.k !== "p")).toBe(true);
	});

	it("po upływie minuty budżet szukania wraca", async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date("2026-09-01T12:00:00Z"));
			mockGroqTokens([{ kind: "text", text: "ok" }], "SZUKAJ");
			mockSearchPosts.mockResolvedValue([SEARCH_POST]);
			const api = createApi();

			const first = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
			await first.text();
			expect(mockSearchPosts).toHaveBeenCalledTimes(1);

			vi.advanceTimersByTime(61_000);
			const again = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
			expect(again.status).toBe(200);
			await again.text();
			expect(mockSearchPosts).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("budżet szukania jest per user", async () => {
		mockGroqTokens([{ kind: "text", text: "ok" }], "SZUKAJ");
		mockSearchPosts.mockResolvedValue([SEARCH_POST]);
		const api = createApi();

		const a = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
		await a.text();
		expect(mockSearchPosts).toHaveBeenCalledTimes(1);

		mockVerifySessionCookie.mockResolvedValue({ userId: "u3", name: "Tomek", role: "member" });
		mockFindUser.mockResolvedValue({
			id: "u3",
			name: "Tomek",
			role: "member",
			tokenHash: "hash",
			deletedAt: new Date(),
			createdAt: new Date(),
			aiOptIn: true,
			aiBlocked: false,
		});
		const b = await postChat(api, ENV, { model: "openai/gpt-oss-120b" });
		expect(b.status).toBe(200);
		await b.text();
		expect(mockSearchPosts).toHaveBeenCalledTimes(2); // inny user = własny budżet
	});
});

describe("POST /api/ai/chat — twarde triggery i uczciwy limit szukania", () => {
	const TRIGGER_POST = {
		id: "p7",
		description: "Siema wszystkim!\nPierwszy post na próbę",
		authorName: "Mama",
		createdAt: new Date("2026-09-01T09:00:00Z"),
		cfImageId: null,
	};

	beforeEach(() => {
		allowAi();
		resetAiRateLimitsForTests();
	});

	it("«poszukaj siema» wymusza szukanie nawet przy decyzji BEZPOSTÓW", async () => {
		mockSearchPosts.mockResolvedValue([TRIGGER_POST]);
		mockGroqTokens([{ kind: "text", text: "ok" }], "BEZPOSTÓW");
		const api = createApi();
		const res = await postChat(api, ENV, {
			model: "openai/gpt-oss-20b",
			message: "poszukaj siema",
		});
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(mockSearchPosts).toHaveBeenCalledTimes(1);
		const tokens = parseNdjson(body);
		expect(tokens.some((token) => token.k === "p")).toBe(true);
	});

	it("wyczerpany budżet szukania → odpowiedź mówi o limicie, nie udaje braku wyników", async () => {
		mockSearchPosts.mockResolvedValue([TRIGGER_POST]);
		mockGroqTokens([{ kind: "text", text: "ok" }]);
		const api = createApi();

		// 6 szukań w minucie (1× Max + 2× Pro + 3× Lite, limity odpowiedzi per
		// model) — siódme wołanie (Lite #4) trafia już w pusty budżet szukania.
		const models = [
			"openai/gpt-oss-120b",
			"qwen/qwen3.8-27b",
			"qwen/qwen3.8-27b",
			"openai/gpt-oss-20b",
			"openai/gpt-oss-20b",
			"openai/gpt-oss-20b",
		] as const;
		for (const model of models) {
			const res = await postChat(api, ENV, { model, message: "poszukaj siema" });
			expect(res.status).toBe(200);
			await res.text();
		}
		expect(mockSearchPosts).toHaveBeenCalledTimes(6);

		const limited = await postChat(api, ENV, {
			model: "openai/gpt-oss-20b",
			message: "poszukaj siema",
		});
		expect(limited.status).toBe(200);
		const body = await limited.text();
		const call = mockStreamChat.mock.calls.at(-1);
		if (!call) throw new Error("streamChat nie został wywołany");
		const system = call[0].messages[0];
		if (!system) throw new Error("brak system promptu");
		expect(system.content).toContain("limit szukania");
		expect(parseNdjson(body).every((token) => token.k !== "p")).toBe(true);
	});
});
