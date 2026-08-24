// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu UI /share (#166 + rewizja usera 2026-08-24):
// - Kroki: kod dostępu → wybór imienia (członkowie) → redirect; kod admina
//   (1219, verify zwraca isAdmin) → ekran potwierdzenia → redirect.
// - Zły kod → Alert „Nieprawidłowy kod dostępu"; rate limit (429) → odczekaj.
// - Wybór imienia → POST /api/share/login {code, memberId} → window.location.
// - Komponent nie zna trasy — prop initialCode pre-filluje input.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { SharePage } from "./share-page";

function renderWithProviders(ui: ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/** jsdom nie implementuje nawigacji — podmieniamy location na zwykły obiekt. */
function stubLocation(): { href: string } {
	const loc = { href: "" };
	Object.defineProperty(window, "location", { value: loc, configurable: true, writable: true });
	return loc;
}

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("SharePage", () => {
	it("pre-fills the code input when initialCode prop is provided", () => {
		renderWithProviders(<SharePage initialCode="4827" />);

		const input = screen.getByLabelText("Kod dostępu") as HTMLInputElement;
		expect(input.value).toBe("4827");
	});

	it("shows an error alert for an invalid code (401)", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(jsonResponse({ error: "Invalid code" }, 401));

		renderWithProviders(<SharePage />);
		await userEvent.type(screen.getByLabelText("Kod dostępu"), "9999");
		await userEvent.click(screen.getByRole("button", { name: /dalej/i }));

		await waitFor(() => {
			expect(screen.getByText("Nieprawidłowy kod dostępu")).toBeDefined();
		});
		expect(fetchSpy).toHaveBeenCalled();
	});

	it("tells the user to wait when rate-limited (429)", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({ error: "Too many requests" }, 429),
		);

		renderWithProviders(<SharePage />);
		await userEvent.type(screen.getByLabelText("Kod dostępu"), "9999");
		await userEvent.click(screen.getByRole("button", { name: /dalej/i }));

		await waitFor(() => {
			expect(screen.getByText(/odczekaj chwilę/i)).toBeDefined();
		});
	});

	it("renders the member list after a valid code; choosing one logs in and redirects", async () => {
		const location = stubLocation();
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(
				jsonResponse({
					members: [
						{ id: "u2", name: "Kasia" },
						{ id: "u3", name: "Anna" },
					],
					isAdmin: false,
				}),
			)
			.mockResolvedValueOnce(jsonResponse({ redirectUrl: "/app/u/member-token" }));

		renderWithProviders(<SharePage initialCode="4827" />);

		await userEvent.click(screen.getByRole("button", { name: /dalej/i }));
		const kasia = await screen.findByRole("button", { name: "Kasia" });
		expect(screen.getByRole("button", { name: "Anna" })).toBeDefined();

		await userEvent.click(kasia);

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledWith(
				"/api/share/login",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ code: "4827", memberId: "u2" }),
				}),
			);
		});
		await waitFor(() => {
			expect(location.href).toBe("/app/u/member-token");
		});
	});

	it("admin code: verify → confirmation screen → login with empty memberId → redirect", async () => {
		const location = stubLocation();
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(jsonResponse({ isAdmin: true }))
			.mockResolvedValueOnce(jsonResponse({ redirectUrl: "/app/u/admin-token" }));

		renderWithProviders(<SharePage />);

		await userEvent.type(screen.getByLabelText("Kod dostępu"), "1219");
		await userEvent.click(screen.getByRole("button", { name: /dalej/i }));

		const confirm = await screen.findByRole("button", { name: /zaloguj jako admin/i });
		await userEvent.click(confirm);

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledWith(
				"/api/share/login",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ code: "1219", memberId: "" }),
				}),
			);
		});
		await waitFor(() => {
			expect(location.href).toBe("/app/u/admin-token");
		});
	});

	it("admin confirmation can be cancelled back to the code step", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ isAdmin: true }));

		renderWithProviders(<SharePage />);
		await userEvent.type(screen.getByLabelText("Kod dostępu"), "1219");
		await userEvent.click(screen.getByRole("button", { name: /dalej/i }));

		await screen.findByRole("button", { name: /zaloguj jako admin/i });
		await userEvent.click(screen.getByRole("button", { name: /anuluj/i }));

		await waitFor(() => {
			expect(screen.getByLabelText("Kod dostępu")).toBeDefined();
		});
	});
});
