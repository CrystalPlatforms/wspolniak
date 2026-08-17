// SPDX-License-Identifier: AGPL-3.0-or-later
import type { InferSelectModel } from "drizzle-orm";
import type { uploadFailures } from "./table";

vi.mock("@/db/setup", () => ({
	getDb: vi.fn(),
}));

import { getDb } from "@/db/setup";

const mockGetDb = vi.mocked(getDb);

const now = new Date();

type UploadFailureRow = InferSelectModel<typeof uploadFailures>;

function mockFailure(overrides: Partial<UploadFailureRow> = {}): UploadFailureRow {
	return {
		id: "failure-1",
		userId: "user-1",
		step: "image-upload",
		kind: "network",
		detail: "TypeError: Load failed",
		fileName: "wakacje.jpg",
		fileSize: 2048,
		createdAt: now,
		...overrides,
	};
}

describe("insertUploadFailure", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("inserts a failure row with generated id for the reporting user", async () => {
		const mockReturning = vi.fn().mockResolvedValue([mockFailure()]);
		const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
		const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
		mockGetDb.mockReturnValue({ insert: mockInsert } as never);

		const { insertUploadFailure } = await import("./queries");

		const result = await insertUploadFailure({
			userId: "user-1",
			step: "image-upload",
			kind: "network",
			detail: "TypeError: Load failed",
			fileName: "wakacje.jpg",
			fileSize: 2048,
		});

		expect(mockValues).toHaveBeenCalledWith(
			expect.objectContaining({
				id: expect.any(String),
				userId: "user-1",
				step: "image-upload",
				kind: "network",
			}),
		);
		expect(result?.id).toBe("failure-1");
	});
});

describe("listRecentUploadFailures", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("selects failures newest first with a row limit", async () => {
		const mockLimit = vi.fn().mockResolvedValue([mockFailure()]);
		const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
		const mockFrom = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
		const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
		mockGetDb.mockReturnValue({ select: mockSelect } as never);

		const { listRecentUploadFailures } = await import("./queries");

		const result = await listRecentUploadFailures(25);

		expect(mockLimit).toHaveBeenCalledWith(25);
		expect(result).toHaveLength(1);
	});
});
