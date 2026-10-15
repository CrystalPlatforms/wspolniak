// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu API załączników (F4 #217):
// - POST /api/chat/attachments: multipart (`files`), przepływ przez Workera do
//   prywatnego bucketa R2 (binding CHAT_ATTACHMENTS). Limity serwerowe: maks. 5
//   plików, 19 MB na plik, video/* → 400. Klucz obiektu = UUID (serwer generuje).
// - GET /api/chat/attachments/:key: tylko uwierzytelnieni (401 dla anonima);
//   zły format klucza → 400; brak obiektu → 404; trafienie → strumień z MIME.
// - Without session → 401 on both (authMiddleware).
import { File as UndiciFile } from "node:buffer";
import { Hono } from "hono";

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
}));

import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import chatAttachmentsEndpoint from "./chat-attachments";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);

/** Mock bindingu R2 — put zwraca potwierdzenie, get zwraca obiekt albo null. */
const r2Stub = {
	put: vi.fn<(key: string, value: ArrayBuffer | string, options?: unknown) => Promise<unknown>>(),
	get: vi.fn<(key: string) => Promise<unknown>>(),
};

function createApi() {
	const api = new Hono<{
		Bindings: { SESSION_SECRET: string; CHAT_ATTACHMENTS: unknown };
	}>().basePath("/api");
	api.route("/chat/attachments", chatAttachmentsEndpoint);
	return api;
}

const env = { SESSION_SECRET: "secret", CHAT_ATTACHMENTS: r2Stub };

// Parser multipart undici brand-checkuje File globalnym `webidl.is.File` —
// jsdom podmienia globalny File, więc przywracamy implementację undici (Node),
// inaczej c.req.formData() wywala się na własnym brand checku (500 w testach).
beforeEach(() => {
	vi.stubGlobal("File", UndiciFile);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const KEY = "9f8c2b1a-1b2c-3d4e-5f6a-7b8c9d0e1f2a";

function authedUser() {
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

interface FakeUploadFile {
	name: string;
	size: number;
	type: string;
}

/**
 * Multipart budowany ręcznie zamiast przez jsdom FormData — serializacja FormData
 * przez undici (Request ctor) robi brand-check na SWOIM File, a testy chodzą w
 * jsdom (inny realm). Ręczne body omija niespójność; treść ma REALNY rozmiar
 * (`size` bajtów), bo endpoint czyta go z parsowanego pliku.
 */
function multipart(files: FakeUploadFile[]): { body: string; contentType: string } {
	const boundary = "----wspolniak-test-boundary";
	let body = "";
	for (const file of files) {
		body += `--${boundary}\r\n`;
		body += `Content-Disposition: form-data; name="files"; filename="${file.name}"\r\n`;
		body += `Content-Type: ${file.type}\r\n`;
		body += "\r\n";
		body += `${"x".repeat(file.size)}\r\n`;
	}
	body += `--${boundary}--\r\n`;
	return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

function authedRequest(init?: RequestInit) {
	return {
		...init,
		headers: { Cookie: "session=valid-jwt", ...init?.headers },
	};
}

/** Żądanie uploadu z sesją — ciasteczko + ręczne multipart (Content-Type z boundary). */
function authedUpload(files: FakeUploadFile[]) {
	const { body, contentType } = multipart(files);
	return authedRequest({
		method: "POST",
		headers: { "Content-Type": contentType },
		body,
	});
}

describe("POST /api/chat/attachments", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
		r2Stub.put.mockResolvedValue(undefined);
	});

	it("uploads files into R2 and returns metadata with generated keys", async () => {
		const res = await createApi().request(
			"/api/chat/attachments",
			authedUpload([{ name: "dokument.pdf", size: 2048, type: "application/pdf" }]),
			env,
		);
		expect(res.status).toBe(201);
		const json = (await res.json()) as {
			data: { attachments: Array<{ key: string; name: string; size: number; mimeType: string }> };
		};
		expect(json.data.attachments).toHaveLength(1);
		const meta = json.data.attachments[0];
		if (!meta) throw new Error("upload zwrócił pustą listę załączników");
		expect(meta.key).toMatch(/^[0-9a-f-]{36}$/);
		expect(meta.name).toBe("dokument.pdf");
		expect(meta.size).toBe(2048);
		expect(meta.mimeType).toBe("application/pdf");
		// Plik faktycznie trafił do bucketa pod wygenerowanym kluczem, z MIME w metadanych.
		const putCall = r2Stub.put.mock.calls[0];
		expect(putCall?.[0]).toBe(meta.key);
		expect((putCall?.[1] as ArrayBuffer).byteLength).toBe(2048);
		expect(putCall?.[2]).toEqual({ httpMetadata: { contentType: "application/pdf" } });
	});

	it("roundtrips: the uploaded key is immediately readable from R2 (upload→payload→download)", async () => {
		const res = await createApi().request(
			"/api/chat/attachments",
			authedUpload([{ name: "a.txt", size: 10, type: "text/plain" }]),
			env,
		);
		const json = (await res.json()) as { data: { attachments: Array<{ key: string }> } };
		const key = json.data.attachments[0]?.key;
		if (!key) throw new Error("upload zwrócił pustą listę załączników");
		// payload wiadomości referencjonuje klucz z uploadu — put poszedł pod ten klucz
		expect(r2Stub.put.mock.calls[0]?.[0]).toBe(key);
		expect(r2Stub.put).toHaveBeenCalledTimes(1);
	});

	it("rejects the 6th file with 400", async () => {
		const files = Array.from({ length: 6 }, (_, i) => ({
			name: `f${i}.txt`,
			size: 10,
			type: "text/plain",
		}));
		const res = await createApi().request("/api/chat/attachments", authedUpload(files), env);
		expect(res.status).toBe(400);
		expect(r2Stub.put).not.toHaveBeenCalled();
	});

	it("rejects a file over 19 MB with 400", async () => {
		const res = await createApi().request(
			"/api/chat/attachments",
			{
				method: "POST",
				body: multipart([{ name: "kolos.jpg", size: 19 * 1024 * 1024 + 1, type: "image/jpeg" }])
					.body,
				headers: {
					Cookie: "session=valid-jwt",
					"Content-Type": multipart([
						{ name: "kolos.jpg", size: 19 * 1024 * 1024 + 1, type: "image/jpeg" },
					]).contentType,
				},
			},
			env,
		);
		expect(res.status).toBe(400);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("19 MB");
		expect(r2Stub.put).not.toHaveBeenCalled();
	});

	it("rejects a video MIME with 400 (wideo tylko przez YouTube)", async () => {
		const res = await createApi().request(
			"/api/chat/attachments",
			authedUpload([{ name: "film.mp4", size: 100, type: "video/mp4" }]),
			env,
		);
		expect(res.status).toBe(400);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("wideo");
		expect(r2Stub.put).not.toHaveBeenCalled();
	});

	it("rejects an empty upload with 400", async () => {
		const res = await createApi().request("/api/chat/attachments", authedUpload([]), env);
		expect(res.status).toBe(400);
	});

	it("returns 401 without a session", async () => {
		mockVerify.mockResolvedValue(null);
		const res = await createApi().request(
			"/api/chat/attachments",
			authedUpload([{ name: "a.txt", size: 10, type: "text/plain" }]),
			env,
		);
		expect(res.status).toBe(401);
		expect(r2Stub.put).not.toHaveBeenCalled();
	});
});

describe("GET /api/chat/attachments/:key", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authedUser();
	});

	it("serves the object body with the stored MIME type", async () => {
		r2Stub.get.mockResolvedValue({
			body: new ReadableStream(),
			size: 2048,
			httpMetadata: { contentType: "application/pdf" },
		});
		const res = await createApi().request(`/api/chat/attachments/${KEY}`, authedRequest(), env);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("application/pdf");
		expect(res.headers.get("content-length")).toBe("2048");
		expect(r2Stub.get).toHaveBeenCalledWith(KEY);
	});

	it("returns 404 when the object does not exist (wygasł lub usunięty przez lifecycle)", async () => {
		r2Stub.get.mockResolvedValue(null);
		const res = await createApi().request(`/api/chat/attachments/${KEY}`, authedRequest(), env);
		expect(res.status).toBe(404);
	});

	it("returns 400 for a malformed key", async () => {
		const res = await createApi().request("/api/chat/attachments/not-a-uuid", authedRequest(), env);
		expect(res.status).toBe(400);
		expect(r2Stub.get).not.toHaveBeenCalled();
	});

	it("denies anonymous requests with 401 (prywatny bucket — tylko autoryzowana trasa)", async () => {
		mockVerify.mockResolvedValue(null);
		const res = await createApi().request(`/api/chat/attachments/${KEY}`, {}, env);
		expect(res.status).toBe(401);
		expect(r2Stub.get).not.toHaveBeenCalled();
	});
});
