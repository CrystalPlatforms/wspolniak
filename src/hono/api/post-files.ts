// SPDX-License-Identifier: AGPL-3.0-or-later
import { isFileLike, uploadPostFile } from "@/core/post-files";
import { createHono } from "@/hono/factory";
import { authMiddleware } from "@/hono/middleware/auth";

const postFilesEndpoint = createHono();

postFilesEndpoint.use("*", authMiddleware());

/**
 * Upload załącznika posta (#243): multipart POST, DOKŁADNIE jeden plik na
 * żądanie, przepływający przez Workera do prywatnego bucketa POST_FILES
 * (bez presigned URLs — odrzucone w PRD #240). Klucz = UUID serwera; limity
 * 19 MB i blokada wideo pilnuje moduł storage. Plik ląduje w R2 od razu;
 * przyczepienie do posta następuje dopiero przy create/update (orphan uploady
 * tolerowane świadomie, YAGNI).
 */
postFilesEndpoint.post("/", async (c) => {
	const formData = await c.req.formData();
	const files = formData.getAll("file").filter(isFileLike);
	if (files.length === 0) {
		return c.json({ error: "Nie wybrano pliku" }, 400);
	}
	if (files.length > 1) {
		return c.json({ error: "Tylko jeden plik na żądanie" }, 400);
	}

	const file = files[0];
	if (!file) {
		return c.json({ error: "Nie wybrano pliku" }, 400);
	}

	const result = await uploadPostFile(c.env.POST_FILES, file);
	if (!result.ok) {
		return c.json({ error: result.error.message }, 400);
	}
	return c.json({ data: result.data }, 201);
});

export default postFilesEndpoint;
