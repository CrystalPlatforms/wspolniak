// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
}));

vi.mock("@/images/client", () => ({
	createDirectUploadUrl: vi.fn(),
	createDirectUploadUrlBatch: vi.fn(),
	getImageUrl: vi.fn(
		(cfg: { cfImageId: string }) => `https://imagedelivery.test/${cfg.cfImageId}/public`,
	),
}));

import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import { createDirectUploadUrl, createDirectUploadUrlBatch } from "@/images/client";
import imagesEndpoint from "./images";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);
const mockCreateUpload = vi.mocked(createDirectUploadUrl);
const mockCreateUploadBatch = vi.mocked(createDirectUploadUrlBatch);

function createApi() {
	const api = new Hono<{
		Bindings: {
			SESSION_SECRET: string;
			CLOUDFLARE_ACCOUNT_ID: string;
			CLOUDFLARE_IMAGES_API_TOKEN: string;
			CLOUDFLARE_IMAGES_ACCOUNT_HASH: string;
		};
	}>().basePath("/api/app");
	api.route("/images", imagesEndpoint);
	return api;
}

const env = {
	SESSION_SECRET: "secret",
	CLOUDFLARE_ACCOUNT_ID: "acc-1",
	CLOUDFLARE_IMAGES_API_TOKEN: "token-1",
	CLOUDFLARE_IMAGES_ACCOUNT_HASH: "hash-1",
};

function authMember() {
	mockVerify.mockResolvedValue({ userId: "u1", name: "Tomek", role: "member" });
	mockFindUser.mockResolvedValue({
		id: "u1",
		name: "Tomek",
		role: "member",
		tokenHash: "hash",
		deletedAt: null,
		createdAt: new Date(),
		aiOptIn: false,
		aiBlocked: false,
	});
}

describe("POST /api/app/images/upload-url", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns upload URL for authenticated user", async () => {
		authMember();
		mockCreateUpload.mockResolvedValue({
			cfImageId: "cf-img-123",
			uploadURL: "https://upload.imagedelivery.net/abc/cf-img-123",
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/images/upload-url",
			{ method: "POST", headers: { Cookie: "session=valid-jwt" } },
			env,
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { cfImageId: string; uploadURL: string } };
		expect(body.data.cfImageId).toBe("cf-img-123");
		expect(body.data.uploadURL).toBe("https://upload.imagedelivery.net/abc/cf-img-123");
	});

	it("returns 401 without session", async () => {
		const api = createApi();
		const res = await api.request("/api/app/images/upload-url", { method: "POST" }, env);

		expect(res.status).toBe(401);
	});
});

describe("POST /api/app/images/upload-urls (batch)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns N upload pairs for authenticated user and calls batch with count", async () => {
		authMember();
		mockCreateUploadBatch.mockResolvedValue([
			{ cfImageId: "cf-1", uploadURL: "https://upload/cf-1" },
			{ cfImageId: "cf-2", uploadURL: "https://upload/cf-2" },
		]);

		const api = createApi();
		const res = await api.request(
			"/api/app/images/upload-urls",
			{
				method: "POST",
				headers: { Cookie: "session=valid-jwt", "Content-Type": "application/json" },
				body: JSON.stringify({ count: 2 }),
			},
			env,
		);

		expect(res.status).toBe(200);
		expect(mockCreateUploadBatch).toHaveBeenCalledWith(
			{ accountId: "acc-1", apiToken: "token-1" },
			2,
		);
		const body = (await res.json()) as {
			data: { cfImageId: string; uploadURL: string }[];
		};
		expect(body.data).toHaveLength(2);
		expect(body.data[0]?.cfImageId).toBe("cf-1");
		expect(body.data[1]?.cfImageId).toBe("cf-2");
	});

	it("returns empty data array for count 0", async () => {
		authMember();
		mockCreateUploadBatch.mockResolvedValue([]);

		const api = createApi();
		const res = await api.request(
			"/api/app/images/upload-urls",
			{
				method: "POST",
				headers: { Cookie: "session=valid-jwt", "Content-Type": "application/json" },
				body: JSON.stringify({ count: 0 }),
			},
			env,
		);

		expect(res.status).toBe(200);
		expect(mockCreateUploadBatch).toHaveBeenCalledWith(
			{ accountId: "acc-1", apiToken: "token-1" },
			0,
		);
		const body = (await res.json()) as { data: unknown[] };
		expect(body.data).toEqual([]);
	});

	it("returns 401 without session", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/app/images/upload-urls",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ count: 2 }),
			},
			env,
		);

		expect(res.status).toBe(401);
	});

	it("returns 400 for negative count", async () => {
		authMember();
		const api = createApi();
		const res = await api.request(
			"/api/app/images/upload-urls",
			{
				method: "POST",
				headers: { Cookie: "session=valid-jwt", "Content-Type": "application/json" },
				body: JSON.stringify({ count: -1 }),
			},
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreateUploadBatch).not.toHaveBeenCalled();
	});

	it("returns 400 when count is missing", async () => {
		authMember();
		const api = createApi();
		const res = await api.request(
			"/api/app/images/upload-urls",
			{
				method: "POST",
				headers: { Cookie: "session=valid-jwt", "Content-Type": "application/json" },
				body: JSON.stringify({}),
			},
			env,
		);

		expect(res.status).toBe(400);
		expect(mockCreateUploadBatch).not.toHaveBeenCalled();
	});
});

describe("GET /api/app/images/:cfImageId/download (#225)", () => {
	function stubUpstream(body: string, init?: ResponseInit) {
		const upstream = new Response(body, init ?? { headers: { "content-type": "image/jpeg" } });
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream));
	}

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("streamuje zdjęcie z nagłówkiem attachment i nazwą z query", async () => {
		authMember();
		stubUpstream("BYTES");
		const api = createApi();
		const res = await api.request(
			"/api/app/images/cf-9/download?name=wakacje.jpg",
			{ headers: { Cookie: "session=valid-jwt" } },
			env,
		);

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/jpeg");
		expect(res.headers.get("content-disposition")).toContain(
			'attachment; filename="wakacje.jpg"',
		);
		expect(await res.text()).toBe("BYTES");
		const fetchMock = vi.mocked(globalThis.fetch);
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://imagedelivery.test/cf-9/public");
	});

	it("returns 401 without session", async () => {
		const api = createApi();
		const res = await api.request("/api/app/images/cf-9/download", {}, env);

		expect(res.status).toBe(401);
	});

	it("zwraca 404 gdy Cloudflare nie zna zdjęcia", async () => {
		authMember();
		stubUpstream("nope", { status: 404 });
		const api = createApi();
		const res = await api.request(
			"/api/app/images/missing/download",
			{ headers: { Cookie: "session=valid-jwt" } },
			env,
		);

		expect(res.status).toBe(404);
	});

	it("sanityzuje nazwę z query (cudzysłowy i znaki kontrolne nie wchodzą do nagłówka)", async () => {
		authMember();
		stubUpstream("BYTES");
		const api = createApi();
		const res = await api.request(
			`/api/app/images/cf-9/download?name=${encodeURIComponent('w"ak\r\nacje.jpg')}`,
			{ headers: { Cookie: "session=valid-jwt" } },
			env,
		);

		expect(res.status).toBe(200);
		const disposition = res.headers.get("content-disposition") ?? "";
		// część ASCII po sanityzacji: " → _, CR/LF → _
		expect(disposition).toContain('filename="w_ak__acje.jpg"');
		expect(disposition).not.toContain("\r");
		expect(disposition).not.toContain("\n");
		// filename* = zakodowana oryginalna nazwa (procentowo, więc bezpieczna)
		expect(disposition).toContain("filename*=UTF-8''");
	});
});
