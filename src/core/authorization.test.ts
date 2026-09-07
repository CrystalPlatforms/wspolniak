// SPDX-License-Identifier: AGPL-3.0-or-later
import {
	type Actor,
	type CommentTarget,
	canDeleteComment,
	canDeletePost,
	canEditComment,
	canEditPost,
	type PostTarget,
} from "./authorization";

function actor(overrides: Partial<Actor> = {}): Actor {
	return { userId: "u1", role: "member", ...overrides };
}

function post(overrides: Partial<PostTarget> = {}): PostTarget {
	return { authorId: "u1", ...overrides };
}

describe("canEditPost", () => {
	it("allows author to edit their own post", () => {
		expect(canEditPost(actor({ userId: "u1" }), post({ authorId: "u1" }))).toBe(true);
	});

	it("allows admin to edit any post", () => {
		expect(canEditPost(actor({ userId: "u2", role: "admin" }), post({ authorId: "u1" }))).toBe(
			true,
		);
	});

	it("denies non-author member", () => {
		expect(canEditPost(actor({ userId: "u2", role: "member" }), post({ authorId: "u1" }))).toBe(
			false,
		);
	});
});

describe("canDeletePost", () => {
	it("allows author to delete their own post", () => {
		expect(canDeletePost(actor({ userId: "u1" }), post({ authorId: "u1" }))).toBe(true);
	});

	it("allows admin to delete any post", () => {
		expect(canDeletePost(actor({ userId: "u2", role: "admin" }), post({ authorId: "u1" }))).toBe(
			true,
		);
	});

	it("denies non-author member", () => {
		expect(canDeletePost(actor({ userId: "u2", role: "member" }), post({ authorId: "u1" }))).toBe(
			false,
		);
	});
});

function comment(overrides: Partial<CommentTarget> = {}): CommentTarget {
	return { authorId: "u1", ...overrides };
}

describe("canEditComment", () => {
	it("allows author to edit their own comment", () => {
		expect(canEditComment(actor({ userId: "u1" }), comment({ authorId: "u1" }))).toBe(true);
	});

	it("allows admin to edit any comment", () => {
		expect(
			canEditComment(actor({ userId: "u2", role: "admin" }), comment({ authorId: "u1" })),
		).toBe(true);
	});

	it("denies non-author member", () => {
		expect(
			canEditComment(actor({ userId: "u2", role: "member" }), comment({ authorId: "u1" })),
		).toBe(false);
	});
});

describe("canDeleteComment", () => {
	it("allows author to delete their own comment", () => {
		expect(canDeleteComment(actor({ userId: "u1" }), comment({ authorId: "u1" }))).toBe(true);
	});

	it("allows admin to delete any comment", () => {
		expect(
			canDeleteComment(actor({ userId: "u2", role: "admin" }), comment({ authorId: "u1" })),
		).toBe(true);
	});

	it("denies non-author member", () => {
		expect(
			canDeleteComment(actor({ userId: "u2", role: "member" }), comment({ authorId: "u1" })),
		).toBe(false);
	});
});

describe("canPinPost", () => {
	it("allows admin to pin", async () => {
		const { canPinPost } = await import("./authorization");
		expect(canPinPost(actor({ role: "admin" }))).toBe(true);
	});

	it("denies member (even acting on their own behalf)", async () => {
		const { canPinPost } = await import("./authorization");
		expect(canPinPost(actor({ role: "member" }))).toBe(false);
	});
});
