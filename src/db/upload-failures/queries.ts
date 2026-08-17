// SPDX-License-Identifier: AGPL-3.0-or-later
import type { InferSelectModel } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { getDb } from "@/db/setup";
import { uploadFailures } from "./table";

export type UploadFailure = InferSelectModel<typeof uploadFailures>;

interface InsertUploadFailureInput {
	userId: string;
	step: string;
	kind: string;
	detail?: string | null;
	fileName?: string | null;
	fileSize?: number | null;
}

// Zapisuje raport o nieudanym uploadzie (best-effort z klienta, issue #135).
export async function insertUploadFailure(input: InsertUploadFailureInput): Promise<UploadFailure> {
	const db = getDb();
	const rows = await db
		.insert(uploadFailures)
		.values({
			id: crypto.randomUUID(),
			userId: input.userId,
			step: input.step,
			kind: input.kind,
			detail: input.detail ?? null,
			fileName: input.fileName ?? null,
			fileSize: input.fileSize ?? null,
		})
		.returning();
	const row = rows[0];
	if (!row) throw new Error("insert upload failure returned no rows");
	return row;
}

// Ostatnie nieudane uploady dla panelu admina, najnowsze pierwsze.
export async function listRecentUploadFailures(limit = 50): Promise<UploadFailure[]> {
	const db = getDb();
	return db.select().from(uploadFailures).orderBy(desc(uploadFailures.createdAt)).limit(limit);
}
