// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu POST /api/app/post-files (#243, spisane przed testami):
// - multipart, DOKŁADNIE jeden plik na żądanie (pole "file") — dwa → 400;
// - key = UUID generowany po stronie serwera; nazwa/rozmiar/typ z multipartu;
// - limity pilnuje moduł storage: >19 MB → 400, video/* → 400, brak pliku → 400;
// - bajty lecą do bucketa POST_FILES (stream przez Workera, bez presigned URLs);
// - odpowiedź 201 { data: { key, name, size, mimeType } } — dokładnie ten
//   kształt klient odsyła przy attachu create/update posta.

import { File as UndiciFile } from "node:buffer";
import { Hono } from "hono";

vi.mock("@/db/identity/session", () => ({
	verifySessionCookie: vi.fn(),
	SESSION_COOKIE_NAME: "session",
}));

vi.mock("@/db/identity/queries", () => ({
	findActiveUserById: vi.fn(),
}));

vi.mock("@/core/post-files", () => ({
	uploadPostFile: vi.fn(),
	isFileLike: (value: unknown) =>
		typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value,
}));

import { uploadPostFile } from "@/core/post-files";
import { findActiveUserById } from "@/db/identity/queries";
import { verifySessionCookie } from "@/db/identity/session";
import postFilesEndpoint from "./post-files";

const mockVerify = vi.mocked(verifySessionCookie);
const mockFindUser = vi.mocked(findActiveUserById);

const mockUpload = vi.mocked(uploadPostFile);

function createApi() {
	const api = new Hono<{
		Bindings: { SESSION_SECRET: string; POST_FILES: unknown };
	}>().basePath("/api/app");
	api.route("/post-files", postFilesEndpoint);
	return api;
}

const env = { SESSION_SECRET: "secret", POST_FILES: {} };

function authedRequest(init?: RequestInit) {
	return {
		...init,
		headers: { Cookie: "session=valid-jwt", ...init?.headers },
	};
}

// Multipart ręcznie + File z undici — jsdomowy FormData/File nie przechodzi
// brand-checku parsera (patrz chat-attachments.test.ts).
beforeEach(() => {
	vi.stubGlobal("File", UndiciFile);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

interface FakeUploadFile {
	name: string;
	size: number;
	type: string;
}

function multipart(files: FakeUploadFile[]): { body: string; contentType: string } {
	const boundary = "----wspolniak-test-boundary";
	let body = "";
	for (const file of files) {
		body += `--${boundary}\r\n`;
		body += `Content-Disposition: form-data; name="file"; filename="${file.name}"\r\n`;
		body += `Content-Type: ${file.type}\r\n`;
		body += "\r\n";
		body += `${"x".repeat(file.size)}\r\n`;
	}
	body += `--${boundary}--\r\n`;
	return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

function uploadRequest(files: FakeUploadFile[]): RequestInit {
	const { body, contentType } = multipart(files);
	return authedRequest({
		method: "POST",
		headers: { "Content-Type": contentType },
		body,
	});
}

describe("POST /api/app/post-files (#243)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
	});

	it("upload poprawnego pliku → obiekt w R2 + metadane z UUID kluczem", async () => {
		mockUpload.mockResolvedValue({
			ok: true,
			data: {
				key: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
				name: "notatka.txt",
				size: 12,
				mimeType: "text/plain",
			},
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/post-files",
			uploadRequest([{ name: "notatka.txt", size: 12, type: "text/plain" }]),
			env,
		);

		expect(res.status).toBe(201);
		const body = (await res.json()) as { data: { key: string; name: string; size: number } };
		expect(body.data).toEqual({
			key: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
			name: "notatka.txt",
			size: 12,
			mimeType: "text/plain",
		});
		// moduł storage dostał plik + bucket z bindingu
		expect(mockUpload).toHaveBeenCalledWith(env.POST_FILES, expect.any(File));
	});

	it(">19 MB → 400", async () => {
		mockUpload.mockResolvedValue({
			ok: false,
			error: {
				message: "Plik przekracza limit 19 MB",
				code: "VALIDATION",
				status: 400,
				name: "AppError",
			} as never,
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/post-files",
			uploadRequest([
				{ name: "duzy.bin", size: 20 * 1024 * 1024 + 1, type: "application/octet-stream" },
			]),
			env,
		);

		expect(res.status).toBe(400);
	});

	it("video/* → 400", async () => {
		mockUpload.mockResolvedValue({
			ok: false,
			error: {
				message: "Pliki wideo nie są obsługiwane",
				code: "VALIDATION",
				status: 400,
				name: "AppError",
			} as never,
		});

		const api = createApi();
		const res = await api.request(
			"/api/app/post-files",
			uploadRequest([{ name: "kotek.mp4", size: 10, type: "video/mp4" }]),
			env,
		);

		expect(res.status).toBe(400);
	});

	it("brak pliku → 400", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/app/post-files",
			authedRequest({ method: "POST", body: new FormData() }),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockUpload).not.toHaveBeenCalled();
	});

	it("dwa pliki w jednym requeście → 400 (1 plik na żądanie)", async () => {
		const api = createApi();
		const res = await api.request(
			"/api/app/post-files",
			uploadRequest([
				{ name: "a.txt", size: 1, type: "text/plain" },
				{ name: "b.txt", size: 1, type: "text/plain" },
			]),
			env,
		);

		expect(res.status).toBe(400);
		expect(mockUpload).not.toHaveBeenCalled();
	});

	it("401 bez sesji", async () => {
		mockVerify.mockResolvedValue(null);
		const api = createApi();
		const res = await api.request(
			"/api/app/post-files",
			{ method: "POST", body: new FormData() },
			env,
		);
		expect(res.status).toBe(401);
	});
});
