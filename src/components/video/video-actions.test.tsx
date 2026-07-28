// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { vi } from "vitest";

// VideoActions uses useNavigate (TanStack Router); stub it to render without a RouterProvider.
vi.mock("@tanstack/react-router", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-router")>();
	return { ...actual, useNavigate: () => () => {} };
});

import { VideoActions } from "./video-actions";

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

// Radix (Dialog overlay) may use pointer-capture APIs absent in jsdom.
beforeEach(() => {
	window.PointerEvent = window.MouseEvent as never;
	Element.prototype.hasPointerCapture = () => false;
	Element.prototype.setPointerCapture = () => {};
	Element.prototype.releasePointerCapture = () => {};
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("VideoActions", () => {
	it("opens a confirmation dialog when the delete button is clicked", async () => {
		const user = userEvent.setup();
		render(<VideoActions videoId="v-1" />, { wrapper: createWrapper() });

		await user.click(screen.getByRole("button", { name: "Usuń wideo" }));

		expect(
			screen.getByText("Czy na pewno chcesz usunąć to wideo? Tej operacji nie można cofnąć."),
		).toBeDefined();
		expect(screen.getByRole("button", { name: "Anuluj" })).toBeDefined();
	});

	it("sends DELETE /api/video/:id on confirm", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ data: { id: "v-1" } }),
		} as never);
		const user = userEvent.setup();
		render(<VideoActions videoId="v-1" />, { wrapper: createWrapper() });

		await user.click(screen.getByRole("button", { name: "Usuń wideo" }));
		await user.click(screen.getByRole("button", { name: "Usuń" }));

		await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
		expect(fetchSpy).toHaveBeenCalledWith("/api/video/v-1", { method: "DELETE" });
	});
});
