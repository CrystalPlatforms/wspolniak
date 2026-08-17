// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";

// POST /upload-failures — body raportu o nieudanym uploadzie z klienta.
// userId NIE pochodzi z body — serwer bierze go z sesji (klient nie może
// podszywać się pod kogoś innego).
export const reportUploadFailureSchema = z.object({
	step: z.enum(["upload-urls", "compress", "image-upload", "create-post"]),
	kind: z.enum(["timeout", "network", "http", "unknown"]),
	detail: z.string().max(2000).optional(),
	fileName: z.string().max(500).optional(),
	fileSize: z.number().int().nonnegative().optional(),
});

export type ReportUploadFailureRequest = z.infer<typeof reportUploadFailureSchema>;
