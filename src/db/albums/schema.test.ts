// SPDX-License-Identifier: AGPL-3.0-or-later
import { createAlbumSchema } from "./schema";

// Założenia kontraktu (#170): album powstaje z tytułu + ≥1 własnego zdjęcia.
// Zdjęcia identyfikuje cfImageId (ten sam pipeline co posty); batch startowy
// max 10 (limit kompozytora). Zod odrzuca: pusty/za długi tytuł, zero zdjęć.
describe("createAlbumSchema", () => {
	const valid = { title: "Wakacje 2026", photoIds: ["cf-img-1"] };

	it("accepts a title and at least one photo", () => {
		const result = createAlbumSchema.safeParse(valid);
		expect(result.success).toBe(true);
	});

	it("accepts multiple photos up to 10", () => {
		const result = createAlbumSchema.safeParse({
			title: "Wakacje",
			photoIds: Array.from({ length: 10 }, (_, i) => `cf-${i}`),
		});
		expect(result.success).toBe(true);
	});

	it("rejects an empty title", () => {
		const result = createAlbumSchema.safeParse({ ...valid, title: "" });
		expect(result.success).toBe(false);
	});

	it("rejects a whitespace-only title", () => {
		const result = createAlbumSchema.safeParse({ ...valid, title: "   " });
		expect(result.success).toBe(false);
	});

	it("rejects a title longer than 100 characters", () => {
		const result = createAlbumSchema.safeParse({ ...valid, title: "a".repeat(101) });
		expect(result.success).toBe(false);
	});

	it("trims surrounding whitespace from the title", () => {
		const result = createAlbumSchema.safeParse({ ...valid, title: "  Wakacje  " });
		if (!result.success) throw new Error("expected success");
		expect(result.data.title).toBe("Wakacje");
	});

	it("rejects zero photos", () => {
		const result = createAlbumSchema.safeParse({ ...valid, photoIds: [] });
		expect(result.success).toBe(false);
	});

	it("rejects more than 10 photos in the initial batch", () => {
		const result = createAlbumSchema.safeParse({
			title: "Wakacje",
			photoIds: Array.from({ length: 11 }, (_, i) => `cf-${i}`),
		});
		expect(result.success).toBe(false);
	});
});
