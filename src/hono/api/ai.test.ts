// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Założenia kodowane przez te testy (stan przed RED):
 * - Endpoint: POST /api/ai/chat { messages: [{role: user|assistant, content}] },
 *   max 50 wiadomości, content max 8000. Model wybiera SERWER (AL Max hardcoded,
 *   F2); klient nie wysyła modelu.
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
 * - Świadomie NIE testowane: rate limity (F4), pick modelu (F4), wstrzykiwanie
 *   postów (F5), UI.
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

vi.mock("@/core/ai/groq", () => ({
	streamChat: vi.fn(),
}));

import { Hono } from "hono";
import { streamChat } from "@/core/ai/groq";
import { DEFAULT_MODEL_ID } from "@/core/ai/models";
import { AL_SYSTEM_PROMPT } from "@/core/ai/persona";
import { findActiveUserById, getAiAccessState, setUserAiOptIn } from "@/db/identity/queries";
import { SESSION_COOKIE_NAME, verifySessionCookie } from "@/db/identity/session";
import { getFeatureFlags } from "@/db/instance/queries";
import aiEndpoint from "./ai";

const mockVerifySessionCookie = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockGetAiAccessState = vi.mocked(getAiAccessState);
const mockSetUserAiOptIn = vi.mocked(setUserAiOptIn);
const mockGetFeatureFlags = vi.mocked(getFeatureFlags);
const mockStreamChat = vi.mocked(streamChat);

const FLAGS_AI_OFF = {
	video: true,
	markdown: true,
	library: true,
	chat: true,
	albums: true,
	ai: false,
};

const FLAGS_AI_ON = { ...FLAGS_AI_OFF, ai: true };

const ENV = { SESSION_SECRET: "secret", GROQ_API_KEY: "gsk_test" };

function createApi() {
	const api = new Hono<{
		Bindings: { SESSION_SECRET: string; GROQ_API_KEY?: string };
	}>().basePath("/api");
	api.route("/ai", aiEndpoint);
	return api;
}

function memberHeaders() {
	return { Cookie: `${SESSION_COOKIE_NAME}=valid-jwt` };
}

/** Zamienia mock streamChat w generator zwracający zadane tokeny. */
function mockGroqTokens(tokens: Array<{ kind: "text" | "reasoning"; text: string }>): void {
	mockStreamChat.mockImplementation(async function* () {
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
		const res = await requestChat(api, ENV);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("application/x-ndjson");
		const tokens = parseNdjson(await res.text());
		expect(tokens).toEqual([
			{ k: "r", v: "myślę nad odpowiedzią" },
			{ k: "t", v: "Wspólniak to " },
			{ k: "t", v: "rodzinny serwis." },
		]);
		expect(mockStreamChat).toHaveBeenCalledOnce();
		expect(mockStreamChat).toHaveBeenCalledWith({
			apiKey: "gsk_test",
			model: DEFAULT_MODEL_ID,
			messages: [
				{ role: "system", content: AL_SYSTEM_PROMPT },
				{ role: "user", content: "Cześć, co to Wspólniak?" },
			],
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

	it("przekazuje model domyślny AL Max", async () => {
		mockGetFeatureFlags.mockResolvedValue(FLAGS_AI_ON);
		mockGetAiAccessState.mockResolvedValue({ aiOptIn: true, aiBlocked: false });
		mockGroqTokens([{ kind: "text", text: "ok" }]);
		const api = createApi();
		const res = await requestChat(api, ENV);
		expect(res.status).toBe(200);
		expect(mockStreamChat).toHaveBeenCalledOnce();
		const call = mockStreamChat.mock.calls[0];
		if (!call) throw new Error("streamChat nie został wywołany");
		expect(call[0].model).toBe(DEFAULT_MODEL_ID);
		expect(DEFAULT_MODEL_ID).toBe("openai/gpt-oss-120b");
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
