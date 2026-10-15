// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu schematu wiadomości (#217/#218):
// - `kind = 'attachments'`: payload 1–5 metadanych (klucz = UUID, nazwa 1–200,
//   rozmiar ≤ 19 MB, MIME bez video/*); podpis (`text`) OPCJONALNY → default "".
// - `kind = 'post'`: payload niesie samo postId; komentarz opcjonalny (default "").
// - Brak `kind` → zwykły tekst (preprocess — wsteczna kompatybilność, #215).
import {
	attachmentMetaSchema,
	createChatMessageSchema,
	MAX_CHAT_ATTACHMENT_BYTES,
	MAX_CHAT_ATTACHMENTS,
} from "./schema";

const validAttachment = {
	key: "9f8c2b1a-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
	name: "dokument.pdf",
	size: 1024,
	mimeType: "application/pdf",
};

describe("attachmentMetaSchema", () => {
	it("accepts a well-formed attachment", () => {
		expect(attachmentMetaSchema.safeParse(validAttachment).success).toBe(true);
	});

	it("rejects a non-UUID key", () => {
		const parsed = attachmentMetaSchema.safeParse({ ...validAttachment, key: "../etc/passwd" });
		expect(parsed.success).toBe(false);
	});

	it("rejects a video MIME type (wideo tylko przez YouTube)", () => {
		const parsed = attachmentMetaSchema.safeParse({ ...validAttachment, mimeType: "video/mp4" });
		expect(parsed.success).toBe(false);
	});

	it("rejects a size above the 19 MB limit", () => {
		const parsed = attachmentMetaSchema.safeParse({
			...validAttachment,
			size: MAX_CHAT_ATTACHMENT_BYTES + 1,
		});
		expect(parsed.success).toBe(false);
	});
});

describe("createChatMessageSchema — kind 'attachments' (#217)", () => {
	it("accepts attachments with an optional caption (default empty)", async () => {
		const parsed = await createChatMessageSchema.parseAsync({
			kind: "attachments",
			payload: { attachments: [validAttachment] },
		});
		expect(parsed).toMatchObject({ kind: "attachments", text: "" });
	});

	it("accepts a caption within the 200-char limit", () => {
		const parsed = createChatMessageSchema.safeParse({
			kind: "attachments",
			text: "Z obiadu u babci",
			payload: { attachments: [validAttachment] },
		});
		expect(parsed.success).toBe(true);
	});

	it("rejects an empty attachments array", () => {
		const parsed = createChatMessageSchema.safeParse({
			kind: "attachments",
			payload: { attachments: [] },
		});
		expect(parsed.success).toBe(false);
	});

	it("rejects more than 5 attachments", async () => {
		const attachments = Array.from({ length: MAX_CHAT_ATTACHMENTS + 1 }, () => validAttachment);
		const parsed = createChatMessageSchema.safeParse({
			kind: "attachments",
			payload: { attachments },
		});
		expect(parsed.success).toBe(false);
	});

	it("rejects a video attachment inside the payload (server-side defense in depth)", () => {
		const parsed = createChatMessageSchema.safeParse({
			kind: "attachments",
			payload: { attachments: [{ ...validAttachment, mimeType: "video/quicktime" }] },
		});
		expect(parsed.success).toBe(false);
	});
});

describe("createChatMessageSchema — kind 'post' (#218)", () => {
	it("accepts a post share without a comment (text defaults to empty)", async () => {
		const parsed = await createChatMessageSchema.parseAsync({
			kind: "post",
			payload: { postId: "p1" },
		});
		expect(parsed).toMatchObject({ kind: "post", text: "", payload: { postId: "p1" } });
	});

	it("accepts a post share with a comment", () => {
		const parsed = createChatMessageSchema.safeParse({
			kind: "post",
			text: "Spójrzcie na to",
			payload: { postId: "p1" },
		});
		expect(parsed.success).toBe(true);
	});

	it("rejects a post share without postId", () => {
		const parsed = createChatMessageSchema.safeParse({ kind: "post", text: "" });
		expect(parsed.success).toBe(false);
	});
});

describe("createChatMessageSchema — wsteczna kompatybilność", () => {
	it("treats a missing kind as plain text (#215)", () => {
		const parsed = createChatMessageSchema.safeParse({ text: "Cześć!" });
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.kind).toBe("text");
		}
	});
});
