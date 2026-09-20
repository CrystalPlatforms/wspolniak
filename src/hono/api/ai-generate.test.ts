// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Założenia kodowane przez te testy (stan przed RED) — F1 #188:
 * - Endpoint: POST /api/ai/generate { mode: "improve-post-description",
 *   text: string(1..2000 = MAX_DESCRIPTION_LENGTH) } — one-shot JSON, bez
 *   streamingu (wyniki są krótkie). Sukces: 200 { data: { text } }.
 * - Gating identyczny jak /chat (#179): brak sesji → 401; master off → 403;
 *   aiBlocked → 403; brak opt-in → 403 (kształty odpowiedzi jak w czacie).
 * - Aplikacyjny limit generowania USUNIĘTY (#189): 429 wystawia wyłącznie
 *   Groq (TPM organizacji) → 429 z komunikatem „Limit został osiągnięty…".
 * - Prywatność payloadu: do Groqa lecą DOKŁADNIE 2 wiadomości — system persona
 *   + user z samym przesłanym tekstem; zero metadanych postów, komentarzy,
 *   obrazów (searchPostsForAi nie może zostać wołany). Model: gpt-oss-120b
 *   na sztywno (decyzja stakeholdera, jakość > szybkość).
 * - Błędy Groqa (z id organizacji!) nigdy nie wychodzą raw: GroqError 429 →
 *   429 z polskim komunikatem, inne GroqError → 502 z polskim komunikatem.
 *   Brak GROQ_API_KEY → 500 z polskim komunikatem (jak w czacie).
 * - Mockujemy wyłącznie granice systemu: moduły DB (identity/instance), sesję
 *   JWT i klienta Groq (completeChat/streamChat).
 * - Świadomie NIE testowane: UI (przyciski — HITL w F2+), prawdziwa sieć,
 *   timing wygasania okna limitu w realnym czasie.
 */

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
	getAiAccessState: vi.fn(),
}));

vi.mock("@/db/instance/queries", () => ({
	getFeatureFlags: vi.fn(),
}));

vi.mock("@/db/posts", () => ({
	MAX_DESCRIPTION_LENGTH: 2000,
	searchPostsForAi: vi.fn(),
}));

vi.mock("@/core/ai/groq", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/core/ai/groq")>();
	return { ...actual, streamChat: vi.fn(), completeChat: vi.fn() };
});

import { Hono } from "hono";
import { completeChat, GroqError } from "@/core/ai/groq";
import { resetAiRateLimitsForTests } from "@/core/ai/rate-limit";
import { findActiveUserById, getAiAccessState } from "@/db/identity/queries";
import { SESSION_COOKIE_NAME, verifySessionCookie } from "@/db/identity/session";
import { getFeatureFlags } from "@/db/instance/queries";
import { searchPostsForAi } from "@/db/posts";
import aiEndpoint from "./ai";

const mockVerifySessionCookie = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockGetAiAccessState = vi.mocked(getAiAccessState);
const mockGetFeatureFlags = vi.mocked(getFeatureFlags);
const mockCompleteChat = vi.mocked(completeChat);

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

function requestGenerate(
	api: ReturnType<typeof createApi>,
	env: Record<string, string | undefined>,
	body: Record<string, unknown> = { mode: "improve-post-description", text: "koty w ogródku" },
) {
	return api.request(
		"/api/ai/generate",
		{
			method: "POST",
			headers: { ...memberHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
		env,
	);
}

/** Odblokowuje bramki: master ON + user opt-in, nieblokowany. */
function allowAi() {
	mockGetFeatureFlags.mockResolvedValue(FLAGS_AI_ON);
	mockGetAiAccessState.mockResolvedValue({ aiOptIn: true, aiBlocked: false });
}

beforeEach(() => {
	vi.clearAllMocks();
	resetAiRateLimitsForTests();
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
	mockCompleteChat.mockResolvedValue("Koty leniwie wygrzewały się w ogródku.");
});

describe("POST /api/ai/generate — happy path", () => {
	it("w pełni dopuszczony user dostaje poprawiony tekst w { data: { text } }", async () => {
		allowAi();
		const api = createApi();
		const res = await requestGenerate(api, ENV);

		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { text: string } };
		expect(json.data.text).toBe("Koty leniwie wygrzewały się w ogródku.");
	});
});

describe("POST /api/ai/generate — matryca gatingu (#188)", () => {
	it("401 dla anonima (brak cookie sesyjnego)", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/ai/generate",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ mode: "improve-post-description", text: "hej" }),
			},
			ENV,
		);
		expect(res.status).toBe(401);
		expect(mockCompleteChat).not.toHaveBeenCalled();
	});

	it("403 gdy master flag wyłączony (nawet dla opt-in usera) — ten sam komunikat co czat", async () => {
		mockGetAiAccessState.mockResolvedValue({ aiOptIn: true, aiBlocked: false });
		const api = createApi();
		const res = await requestGenerate(api, ENV);
		expect(res.status).toBe(403);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("AL jest obecnie wyłączony");
		expect(mockCompleteChat).not.toHaveBeenCalled();
	});

	it("403 gdy user zablokowany przez admina (mimo mastera ON i opt-in)", async () => {
		allowAi();
		mockGetAiAccessState.mockResolvedValue({ aiOptIn: true, aiBlocked: true });
		const api = createApi();
		const res = await requestGenerate(api, ENV);
		expect(res.status).toBe(403);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("wyłączony przez administratora");
		expect(mockCompleteChat).not.toHaveBeenCalled();
	});

	it("403 gdy user nie optynował do AL (mimo mastera ON)", async () => {
		mockGetFeatureFlags.mockResolvedValue(FLAGS_AI_ON);
		mockGetAiAccessState.mockResolvedValue({ aiOptIn: false, aiBlocked: false });
		const api = createApi();
		const res = await requestGenerate(api, ENV);
		expect(res.status).toBe(403);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("Włącz AL w Ustawieniach");
		expect(mockCompleteChat).not.toHaveBeenCalled();
	});
});

describe("POST /api/ai/generate — walidacja i klucz", () => {
	it("400 dla nieznanej trybu", async () => {
		allowAi();
		const api = createApi();
		const res = await requestGenerate(api, ENV, { mode: "make-me-a-sandwich", text: "hej" });
		expect(res.status).toBe(400);
		expect(mockCompleteChat).not.toHaveBeenCalled();
	});

	it("400 dla pustego tekstu", async () => {
		allowAi();
		const api = createApi();
		const res = await requestGenerate(api, ENV, { mode: "improve-post-description", text: "" });
		expect(res.status).toBe(400);
	});

	it("400 dla tekstu powyżej MAX_DESCRIPTION_LENGTH", async () => {
		allowAi();
		const api = createApi();
		const res = await requestGenerate(api, ENV, {
			mode: "improve-post-description",
			text: "a".repeat(2001),
		});
		expect(res.status).toBe(400);
	});

	it("500 z polskim komunikatem, gdy brak GROQ_API_KEY", async () => {
		allowAi();
		const api = createApi();
		const res = await requestGenerate(api, { ...ENV, GROQ_API_KEY: undefined });
		expect(res.status).toBe(500);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("GROQ_API_KEY");
		expect(mockCompleteChat).not.toHaveBeenCalled();
	});
});

describe("POST /api/ai/generate — prywatność payloadu (#188)", () => {
	it("do Groqa leci DOKŁADNIE persona + sam tekst, model gpt-oss-120b, zero metadanych", async () => {
		allowAi();
		const api = createApi();
		await requestGenerate(api, ENV, {
			mode: "improve-post-description",
			text: "koty w ogródku",
		});

		expect(mockCompleteChat).toHaveBeenCalledTimes(1);
		const call = mockCompleteChat.mock.calls[0]?.[0];
		expect(call).toBeDefined();
		expect(call?.model).toBe("openai/gpt-oss-120b");
		expect(call?.messages).toHaveLength(2);

		const system = call?.messages[0];
		const user = call?.messages[1];
		expect(system?.role).toBe("system");
		expect(system?.content).toContain("po polsku");
		expect(system?.content).toContain("bez emoji");
		expect(system?.content).toContain("bez tabel");
		expect(user?.role).toBe("user");
		expect(user?.content).toBe("koty w ogródku");

		// Żadnego wstrzykiwania postów — generowanie nie sięga po treści rodziny.
		expect(searchPostsForAi).not.toHaveBeenCalled();
	});
});

describe("POST /api/ai/generate — mapowanie błędów Groqa (#188)", () => {
	it("GroqError 429 → 429 z polskim komunikatem, raw payload (id org!) nigdy nie wychodzi", async () => {
		allowAi();
		mockCompleteChat.mockRejectedValue(
			new GroqError("Rate limit reached for organization org_abc123 on model ...", 429),
		);
		const api = createApi();
		const res = await requestGenerate(api, ENV);
		expect(res.status).toBe(429);
		const json = (await res.json()) as { error: string };
		// 429 wystawia sam Groq (TPM organizacji) — jedyny komunikat o limicie.
		expect(json.error).toContain("Limit został osiągnięty, zaczekaj chwilę");
		expect(JSON.stringify(json)).not.toContain("org_abc123");
		expect(JSON.stringify(json)).not.toContain("Rate limit reached for organization");
	});

	it("GroqError 500 → 502 z ogólnym polskim komunikatem, bez treści z Groqa", async () => {
		allowAi();
		mockCompleteChat.mockRejectedValue(
			new GroqError("Internal provider error: token abc123 leaked", 500),
		);
		const api = createApi();
		const res = await requestGenerate(api, ENV);
		expect(res.status).toBe(502);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("AL ma teraz problemy techniczne");
		expect(JSON.stringify(json)).not.toContain("abc123");
		expect(JSON.stringify(json)).not.toContain("Internal provider error");
	});
});

describe("POST /api/ai/generate — bez aplikacyjnego limitu (#189)", () => {
	it("aplikacyjny limit generowania nie istnieje — kolejne wywołania przechodzą (429 wystawia tylko Groq)", async () => {
		allowAi();
		const api = createApi();

		// Dawniej 4/min; teraz endpoint nie trzyma własnego okna — granicę TPM
		// egzekwuje wyłącznie Groq (mapowane wyżej na 429 z polskim komunikatem).
		for (let i = 0; i < 6; i++) {
			const res = await requestGenerate(api, ENV);
			expect(res.status).toBe(200);
			const json = (await res.json()) as { data?: { text?: string } };
			expect(json.data?.text).toBeDefined();
		}
	});
});

describe("POST /api/ai/generate — tryb propose (F3 #190)", () => {
	const VISION_DATA_URL = "data:image/jpeg;base64,QUJDREVGRw==";
	const SCENE = "Na tarasie stół i dwie osoby piją kawę.";
	it("happy path: vision → polish, obraz tylko w 1. wywołaniu, zero URL-i w payloadach", async () => {
		allowAi();
		mockCompleteChat.mockResolvedValueOnce(SCENE).mockResolvedValueOnce("Kawa na tarasie.");
		const api = createApi();
		const res = await requestGenerate(api, ENV, {
			mode: "propose-post-description",
			image: VISION_DATA_URL,
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { text: string } };
		expect(json.data.text).toBe("Kawa na tarasie.");
		expect(mockCompleteChat).toHaveBeenCalledTimes(2);
		const vision = mockCompleteChat.mock.calls[0]?.[0];
		expect(vision?.model).toBe("qwen/qwen3.8-27b");
		expect(JSON.stringify(vision)).toContain(VISION_DATA_URL);
		expect(JSON.stringify(vision)).not.toContain("http://");
		expect(JSON.stringify(vision)).not.toContain("https://");

		// Wywołanie 2 — polish: gpt-oss-120b dostaje samą scenę (bez obrazu).
		const polish = mockCompleteChat.mock.calls[1]?.[0];
		expect(polish?.model).toBe("openai/gpt-oss-120b");
		expect(polish?.messages.at(-1)?.content).toBe(SCENE);
		expect(JSON.stringify(polish)).not.toContain("image_url");
	});
	const PROPOSE_BODY = { mode: "propose-post-description", image: VISION_DATA_URL };

	it("gating jak improve: master off → 403, Groq nie wołany", async () => {
		const api = createApi();
		const res = await requestGenerate(api, ENV, PROPOSE_BODY);
		expect(res.status).toBe(403);
		expect(mockCompleteChat).not.toHaveBeenCalled();
	});
	it("400 dla obrazu spoza formatu data:image (np. zdalny URL)", async () => {
		allowAi();
		const api = createApi();
		const res = await requestGenerate(api, ENV, {
			mode: "propose-post-description",
			image: "http://example.com/x.jpg",
		});
		expect(res.status).toBe(400);
		expect(mockCompleteChat).not.toHaveBeenCalled();
	});
	it("400 dla obrazu powyżej VISION_IMAGE_MAX_CHARS", async () => {
		allowAi();
		const api = createApi();
		const BIG = `data:image/jpeg;base64,${"A".repeat(4_000_001)}`;
		const res = await requestGenerate(api, ENV, { mode: "propose-post-description", image: BIG });
		expect(res.status).toBe(400);
		expect(mockCompleteChat).not.toHaveBeenCalled();
	});
	it("pusta scena z vision → 502 z polskim komunikatem, polish nie wołany", async () => {
		allowAi();
		mockCompleteChat.mockResolvedValueOnce("");
		const api = createApi();
		const res = await requestGenerate(api, ENV, PROPOSE_BODY);
		expect(res.status).toBe(502);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("problemy techniczne");
		expect(mockCompleteChat).toHaveBeenCalledTimes(1);
	});
	it("429 z Groqa (krok vision) → 429 z polskim komunikatem, bez id organizacji", async () => {
		allowAi();
		mockCompleteChat.mockRejectedValueOnce(
			new GroqError("Rate limit reached for organization org_abc123 on model ...", 429),
		);
		const api = createApi();
		const res = await requestGenerate(api, ENV, PROPOSE_BODY);
		expect(res.status).toBe(429);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("Limit został osiągnięty, zaczekaj chwilę");
		expect(JSON.stringify(json)).not.toContain("org_abc123");
	});
	it("błąd 500 w kroku polish → 502 z ogólnym polskim komunikatem", async () => {
		allowAi();
		mockCompleteChat.mockResolvedValueOnce(SCENE);
		mockCompleteChat.mockRejectedValueOnce(
			new GroqError("Internal provider error: token abc123 leaked", 500),
		);
		const api = createApi();
		const res = await requestGenerate(api, ENV, PROPOSE_BODY);
		expect(res.status).toBe(502);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("problemy techniczne");
		expect(JSON.stringify(json)).not.toContain("abc123");
	});
	it("scena czyszczona z tagow think przed krokiem polish", async () => {
		allowAi();
		mockCompleteChat.mockResolvedValueOnce("<think>rozwa</think>Stol na tarasie.");
		const api = createApi();
		const res = await requestGenerate(api, ENV, PROPOSE_BODY);
		expect(res.status).toBe(200);
		const polish = mockCompleteChat.mock.calls[1]?.[0];
		expect(polish?.messages.at(-1)?.content).toBe("Stol na tarasie.");
	});
});

describe("POST /api/ai/generate — tryb improve-comment (F4 #191)", () => {
	const COMMENT_BODY = { mode: "improve-comment", text: "koty w ogródku byly super i fajne bylo" };

	it("happy path: gpt-oss-120b, persona + sam tekst, wynik w { data: { text } }", async () => {
		allowAi();
		mockCompleteChat.mockResolvedValue("Koty były super.");
		const api = createApi();
		const res = await requestGenerate(api, ENV, COMMENT_BODY);
		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { text: string } };
		expect(json.data.text).toBe("Koty były super.");

		expect(mockCompleteChat).toHaveBeenCalledTimes(1);
		const call = mockCompleteChat.mock.calls[0]?.[0];
		expect(call?.model).toBe("openai/gpt-oss-120b");
		expect(call?.messages).toHaveLength(2);
		const system = call?.messages[0];
		const user = call?.messages[1];
		expect(system?.role).toBe("system");
		expect(system?.content).toContain("po polsku");
		// Wariant comment: twarda instrukcja skracania.
		expect(system?.content).toContain("KRÓTSZY NIŻ ORYGINAŁ");
		expect(user?.role).toBe("user");
		expect(user?.content).toBe("koty w ogródku byly super i fajne bylo");
	});

	it("gating jak improve: master off → 403, Groq nie wołany", async () => {
		const api = createApi();
		const res = await requestGenerate(api, ENV, COMMENT_BODY);
		expect(res.status).toBe(403);
		expect(mockCompleteChat).not.toHaveBeenCalled();
	});

	it("400 dla tekstu powyżej limitu kompozytora (1000)", async () => {
		allowAi();
		const api = createApi();
		const res = await requestGenerate(api, ENV, {
			mode: "improve-comment",
			text: "a".repeat(1001),
		});
		expect(res.status).toBe(400);
		expect(mockCompleteChat).not.toHaveBeenCalled();
	});
});

describe("POST /api/ai/generate — tryb album-title (F5 #192)", () => {
	const ALBUM_BODY = {
		mode: "album-title",
		files: [
			{ name: "IMG_20260820_153022.jpg", date: "2026-08-20T13:30:22.000Z" },
			{ name: "wakacje.jpg", date: "2026-08-21T08:15:30.000Z" },
		],
	};

	it("happy path: gpt-oss-120b dostaje WYŁĄCZNIE nazwy plików i daty", async () => {
		allowAi();
		mockCompleteChat.mockResolvedValue("Wakacje nad morzem");
		const api = createApi();
		const res = await requestGenerate(api, ENV, ALBUM_BODY);
		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { text: string } };
		expect(json.data.text).toBe("Wakacje nad morzem");

		expect(mockCompleteChat).toHaveBeenCalledTimes(1);
		const call = mockCompleteChat.mock.calls[0]?.[0];
		expect(call?.model).toBe("openai/gpt-oss-120b");
		expect(call?.messages).toHaveLength(2);
		const payload = JSON.stringify(call);
		// Prywatność (AC #192): payload przenosi tylko metadane plików —
		// zero bajtów obrazów, zero URL-i.
		expect(payload).not.toMatch(/data:image/);
		expect(payload).not.toMatch(/https?:\/\//);
		expect(payload).toContain("IMG_20260820_153022.jpg");
		expect(payload).toContain("2026-08-20T13:30:22.000Z");
		expect(payload).toContain("wakacje.jpg");
	});

	it("gating jak improve: master off → 403, Groq nie wołany", async () => {
		const api = createApi();
		const res = await requestGenerate(api, ENV, ALBUM_BODY);
		expect(res.status).toBe(403);
		expect(mockCompleteChat).not.toHaveBeenCalled();
	});

	it("400 bez plików (min 1)", async () => {
		allowAi();
		const api = createApi();
		const res = await requestGenerate(api, ENV, { mode: "album-title", files: [] });
		expect(res.status).toBe(400);
		expect(mockCompleteChat).not.toHaveBeenCalled();
	});

	it("400 powyżej 200 plików", async () => {
		allowAi();
		const api = createApi();
		const res = await requestGenerate(api, ENV, {
			mode: "album-title",
			files: Array.from({ length: 201 }, (_, i) => ({
				name: `f${i}.jpg`,
				date: "2026-08-20T13:30:22.000Z",
			})),
		});
		expect(res.status).toBe(400);
		expect(mockCompleteChat).not.toHaveBeenCalled();
	});
});
