// SPDX-License-Identifier: AGPL-3.0-or-later

// Receptury szkła na komponentach (#234): karta posta i karta komentarza
// niosą glass-surface tylko przy ON; dolna nawigacja i FAB — glass-chrome.
// OFF = żadnej klasy receptury nigdzie (AC #234).

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommentItem } from "@/components/app/comment-item";
import type { CommentWithAuthor } from "@/components/app/comment-section";
import { MobileNav } from "@/components/app/mobile-nav";
import { PostCard, type PostCardPost } from "@/components/app/post-card";
import { GLASS_CHROME_CLASS, GLASS_SURFACE_CLASS, GlassProvider } from "./glass-provider";

// PostCard/MobileNav renderują Link (TanStack Router) — passthrough jak w
// testach feedu, plus useLocation i useNavigate.
vi.mock("@tanstack/react-router", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-router")>();
	return {
		...actual,
		useLocation: () => ({ pathname: "/app" }),
		useNavigate: () => () => {},
		Link: ({
			to,
			params,
			className,
			children,
			...rest
		}: ComponentProps<"a"> & { to: string; params?: Record<string, string> }) => {
			const resolved = params
				? Object.entries(params).reduce((path, [k, v]) => path.replace(`$${k}`, v), to)
				: to;
			return (
				<a href={resolved} className={className} {...rest}>
					{children}
				</a>
			);
		},
	};
});

function makePost(): PostCardPost {
	return {
		id: "p-1",
		authorId: "u-1",
		description: "Wspólny obiad",
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
		author: { id: "u-1", name: "Tomek" },
		images: [],
	};
}

function makeComment(overrides: Partial<CommentWithAuthor> = {}): CommentWithAuthor {
	return {
		id: "c-1",
		postId: "post-1",
		authorId: "u-1",
		body: "Fajne!",
		parentId: null,
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		author: { id: "u-1", name: "Tomek" },
		replies: [],
		...overrides,
	};
}

function renderWithGlass(ui: ReactNode, stored: "on" | "off" | null) {
	if (stored !== null) {
		window.localStorage.setItem("ui-glass", stored);
	}
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(ui, {
		wrapper: ({ children }) => (
			<QueryClientProvider client={queryClient}>
				<GlassProvider>{children}</GlassProvider>
			</QueryClientProvider>
		),
	});
}

describe("glass recipes on feed surfaces (#234)", () => {
	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.removeAttribute("data-glass");
	});

	afterEach(() => {
		cleanup();
		window.localStorage.clear();
		document.documentElement.removeAttribute("data-glass");
	});

	it("post card carries glass-surface only when ON", () => {
		const on = renderWithGlass(
			<PostCard
				post={makePost()}
				imageAccountHash="h"
				currentUserId="u-1"
				currentUserRole="member"
			/>,
			"on",
		);
		expect(document.querySelector("article.glass-surface")).not.toBeNull();
		on.unmount();
		document.documentElement.removeAttribute("data-glass");

		renderWithGlass(
			<PostCard
				post={makePost()}
				imageAccountHash="h"
				currentUserId="u-1"
				currentUserRole="member"
			/>,
			"off",
		);
		expect(document.querySelector("article.glass-surface")).toBeNull();
	});

	it("top-level comment card carries glass-surface only when ON; reply never does", () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: [] }) }),
		);
		const comment = makeComment({
			replies: [makeComment({ id: "r-1", parentId: "c-1", author: { id: "u-9", name: "Kasia" } })],
		});
		renderWithGlass(
			<CommentItem
				comment={comment}
				postId="post-1"
				currentUserId="u-2"
				currentUserRole="member"
			/>,
			"on",
		);
		expect(document.querySelectorAll(`div.${GLASS_SURFACE_CLASS}`)).toHaveLength(1);

		cleanup();
		document.documentElement.removeAttribute("data-glass");

		renderWithGlass(
			<CommentItem
				comment={comment}
				postId="post-1"
				currentUserId="u-2"
				currentUserRole="member"
			/>,
			"off",
		);
		expect(document.querySelectorAll(`div.${GLASS_SURFACE_CLASS}`)).toHaveLength(0);
	});

	it("mobile nav and FAB carry glass-chrome only when ON", () => {
		const on = renderWithGlass(<MobileNav />, "on");
		expect(document.querySelector(`nav.${GLASS_CHROME_CLASS}`)).not.toBeNull();
		expect(document.querySelector(`button.${GLASS_CHROME_CLASS}`)).not.toBeNull();
		on.unmount();
		document.documentElement.removeAttribute("data-glass");

		renderWithGlass(<MobileNav />, "off");
		expect(document.querySelector(`nav.${GLASS_CHROME_CLASS}`)).toBeNull();
		expect(document.querySelector(`button.${GLASS_CHROME_CLASS}`)).toBeNull();
	});
});
