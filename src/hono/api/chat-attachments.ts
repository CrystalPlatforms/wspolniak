// SPDX-License-Identifier: AGPL-3.0-or-later
import { type AttachmentMeta, MAX_CHAT_ATTACHMENT_BYTES, MAX_CHAT_ATTACHMENTS } from "@/db/chat";
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";

const chatAttachmentsEndpoint = createHono();

chatAttachmentsEndpoint.use("*", authMiddleware());

/** Klucz obiektu R2 = goły UUID (generujemy go sami — regex zamyka ścieżki i cudze klucze). */
const ATTACHMENT_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Upload załączników czatu (F4 #217): multipart POST przepływający przez Workera
 * do prywatnego bucketa R2 (bez presigned URLs — odrzucone w PRD #201). Limity
 * egzekwowane serwerowo: maks. 5 plików, 19 MB na plik, MIME `video/*` odrzucone
 * (stojąca reguła: wideo tylko przez YouTube). Klucz = UUID; nazwa/typ/rozmiar
 * wracają do klienta i lądują w payloadzie wiadomości `kind = 'attachments'`.
 * Obiekty kasuje reguła lifecycle bucketa (`--expire-days 1`, krok 0 HITL).
 */
chatAttachmentsEndpoint.post("/", async (c) => {
	const formData = await c.req.formData();
	const files = formData
		.getAll("files")
		.filter(
			(entry): entry is File =>
				typeof entry === "object" && entry !== null && "arrayBuffer" in entry && "size" in entry,
		);

	if (files.length === 0) {
		return c.json({ error: "Nie wybrano plików" }, 400);
	}
	if (files.length > MAX_CHAT_ATTACHMENTS) {
		return c.json({ error: `Możesz załączyć maksymalnie ${MAX_CHAT_ATTACHMENTS} plików` }, 400);
	}

	const attachments: AttachmentMeta[] = [];
	for (const file of files) {
		if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
			return c.json({ error: `Plik „${file.name}" przekracza limit 19 MB` }, 400);
		}
		const mimeType = file.type || "application/octet-stream";
		if (mimeType.startsWith("video/")) {
			return c.json({ error: `Plik „${file.name}" — pliki wideo nie są obsługiwane` }, 400);
		}
		// Nazwa potrafi przekroczyć limit payloadu (200 znaków) — przycinamy tu,
		// by wiadomość przechodziła walidację Zod bez zaskoczeń po stronie klienta.
		const name = (file.name || "plik").slice(0, 200);
		const key = crypto.randomUUID();
		await c.env.CHAT_ATTACHMENTS.put(key, await file.arrayBuffer(), {
			httpMetadata: { contentType: mimeType },
		});
		attachments.push({ key, name, size: file.size, mimeType });
	}

	return c.json({ data: { attachments } }, 201);
});

/**
 * Pobranie załącznika (F4 #217): bucket jest prywatny, więc pliki wychodzą
 * WYŁĄCZNIE tą autoryzowaną trasą — uwierzytelnieni członkowie rodziny dostają
 * strumień z zachowanym typem MIME; anonimowi dostają 401 z authMiddleware.
 * Kliknięty plik zapisuje się pod oryginalną nazwą dzięki `download` w UI.
 */
chatAttachmentsEndpoint.get("/:key", async (c) => {
	const key = c.req.param("key");
	if (!ATTACHMENT_KEY_RE.test(key)) {
		return c.json({ error: "Nieprawidłowy klucz załącznika" }, 400);
	}

	const object = await c.env.CHAT_ATTACHMENTS.get(key);
	if (!object) {
		return c.json({ error: "Załącznik nie istnieje lub wygasł" }, 404);
	}

	return c.body(object.body, 200, {
		"content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
		"content-length": String(object.size),
		"cache-control": "private, max-age=3600",
	});
});

export default chatAttachmentsEndpoint;
