// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { vi } from "vitest";
import { DEFAULT_FEATURE_FLAGS } from "@/db/instance";
import { MobileNav } from "./mobile-nav";

// Sterowana ścieżka routera — granica systemu (zewnętrzny framework).
let currentPathname = "/app";

vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, className, children, ...rest }: ComponentProps<"a"> & { to: string }) => (
		<a href={to} className={className} {...rest}>
			{children}
		</a>
	),
	useLocation: () => ({ pathname: currentPathname }),
}));

function setPathname(pathname: string) {
	currentPathname = pathname;
}

// MobileSidebar (przez kropkę „new" #176) czyta react-query — wrapper jak w appce.
function withQueryClient() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return (props: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
	);
}

describe("MobileNav", () => {
	it("renderuje link Home prowadzacy do feedu /app", () => {
		setPathname("/app");
		render(<MobileNav />, { wrapper: withQueryClient() });

		const homeLink = screen.getByRole("link", { name: /home/i });
		expect(homeLink.getAttribute("href")).toBe("/app");
	});

	it("nie zawiera juz przycisku Feedback", () => {
		setPathname("/app");
		render(<MobileNav />, { wrapper: withQueryClient() });

		expect(screen.queryByText(/feedback/i)).toBeNull();
	});

	it("podswietla Home gdy uzytkownik jest na feedzie /app", () => {
		setPathname("/app");
		render(<MobileNav />, { wrapper: withQueryClient() });

		const homeLink = screen.getByRole("link", { name: /home/i });
		expect(homeLink.className).toMatch(/font-bold/);
	});

	it("nie podswietla Home na podstronie feedu (exact match)", () => {
		setPathname("/app/new");
		render(<MobileNav />, { wrapper: withQueryClient() });

		const homeLink = screen.getByRole("link", { name: /home/i });
		expect(homeLink.className).not.toMatch(/font-bold/);
	});

	it("renderuje link Chat prowadzacy do /app/chat", () => {
		setPathname("/app");
		render(<MobileNav />, { wrapper: withQueryClient() });

		const chatLink = screen.getByRole("link", { name: /chat/i });
		expect(chatLink.getAttribute("href")).toBe("/app/chat");
	});

	it("podswietla Chat gdy uzytkownik jest w czacie", () => {
		setPathname("/app/chat");
		render(<MobileNav />, { wrapper: withQueryClient() });

		const chatLink = screen.getByRole("link", { name: /chat/i });
		expect(chatLink.className).toMatch(/font-bold/);
	});

	it("nie podswietla Chat poza czatem", () => {
		setPathname("/app");
		render(<MobileNav />, { wrapper: withQueryClient() });

		const chatLink = screen.getByRole("link", { name: /chat/i });
		expect(chatLink.className).not.toMatch(/font-bold/);
	});

	it("chowa Chat gdy flaga chat jest wylaczona", () => {
		setPathname("/app");
		render(<MobileNav featureFlags={{ ...DEFAULT_FEATURE_FLAGS, chat: false }} />, {
			wrapper: withQueryClient(),
		});

		expect(screen.queryByRole("link", { name: /chat/i })).toBeNull();
	});
});
