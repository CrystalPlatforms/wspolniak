// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu UI (#166 + rewizja usera 2026-08-24) — dialog admina
// „Kod dostępu /share" (QR usunięty w całości):
// - Samowystarczalny: props {open, onOpenChange}; kod z GET /api/admin/share-code.
// - Zmiana kodu: „Wygeneruj losowy kod" wypełnia input 4 LOSOWYMI CYFRAMI;
//   własny kod dozwolony, ale „Zapisz" wymaga 4–20 cyfr (serwer i tak waliduje
//   — PUT /api/admin/share-code). Błąd 400 → Alert.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { ShareCodeDialog } from "./share-code-dialog";

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** fetch admin-API: GET kod; opcjonalny PUT (wynik). */
function mockAdminApi(
	options: { code?: string | null; putStatus?: number; putError?: string } = {},
) {
	const { code = "4827", putStatus = 200, putError } = options;
	return vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
		if (url === "/api/admin/share-code" && init?.method === "PUT") {
			return Promise.resolve(
				jsonResponse(putError ? { error: putError } : { data: { code: "x" } }, putStatus),
			);
		}
		if (url === "/api/admin/share-code") {
			return Promise.resolve(jsonResponse({ data: { code } }));
		}
		return Promise.resolve(jsonResponse({ data: null }));
	});
}

function renderDialog() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	const ui: ReactElement = <ShareCodeDialog open onOpenChange={() => {}} />;
	return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("ShareCodeDialog", () => {
	it("shows the current share code", async () => {
		mockAdminApi();
		renderDialog();

		expect((await screen.findAllByText("4827")).length).toBeGreaterThan(0);
	});

	it("generate button fills the input with 4 random digits; save PUTs it", async () => {
		const fetchSpy = mockAdminApi();
		renderDialog();
		await screen.findAllByText("4827");

		await userEvent.click(screen.getByRole("button", { name: /zmień kod/i }));
		await userEvent.click(screen.getByRole("button", { name: /wygeneruj losowy kod/i }));
		const input = screen.getByLabelText("Nowy kod") as HTMLInputElement;
		expect(input.value).toMatch(/^\d{4}$/);

		await userEvent.click(screen.getByRole("button", { name: /^zapisz$/i }));

		await waitFor(() => {
			const put = fetchSpy.mock.calls.find(
				([url, init]) => url === "/api/admin/share-code" && init?.method === "PUT",
			);
			expect(put).toBeDefined();
			expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({ code: input.value });
		});
	});

	it("save stays disabled for a custom code shorter than 4 digits or with letters", async () => {
		mockAdminApi();
		renderDialog();
		await screen.findAllByText("4827");

		await userEvent.click(screen.getByRole("button", { name: /zmień kod/i }));
		const input = screen.getByLabelText("Nowy kod") as HTMLInputElement;
		const save = screen.getByRole("button", { name: /^zapisz$/i });

		await userEvent.clear(input);
		await userEvent.type(input, "123");
		expect(save.hasAttribute("disabled")).toBe(true);

		// 4 znaki, ale z literami — nadal nie.
		await userEvent.clear(input);
		await userEvent.type(input, "12ab");
		expect(save.hasAttribute("disabled")).toBe(true);

		await userEvent.clear(input);
		await userEvent.type(input, "1234");
		expect(save.hasAttribute("disabled")).toBe(false);
	});

	it("shows a server error alert when the PUT is rejected (400)", async () => {
		mockAdminApi({ putStatus: 400, putError: "Share code must be 4-20 digits" });
		renderDialog();
		await screen.findAllByText("4827");

		await userEvent.click(screen.getByRole("button", { name: /zmień kod/i }));
		await userEvent.click(screen.getByRole("button", { name: /wygeneruj losowy kod/i }));
		await userEvent.click(screen.getByRole("button", { name: /^zapisz$/i }));

		await waitFor(() => {
			expect(screen.getByText(/Share code must be 4-20 digits/i)).toBeDefined();
		});
	});
});
