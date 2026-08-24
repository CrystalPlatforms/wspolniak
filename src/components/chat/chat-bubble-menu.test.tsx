// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu ChatBubbleMenu (F5 #156 + życzenia usera po HITL, F6 #157):
// - Menu otwiera/wraca ChatView; komponent sam się zamyka: Escape, pointerdown
//   poza menu. Itemy: Odpowiedz, Kopiuj (clipboard), Kto zareagował (dialog
//   wszystkich typów), Info (dialog: autor + pełna data PL), Usuń — widoczny
//   TYLKO dla autora lub admina.
// - KLUCZOWE (regresja HITL): ChatView odmontowuje menu po onClose — itemy
//   otwierające dialog NIE zamykają menu od razu; dialog żyje i dopiero po
//   swoim zamknięciu sprząta całość.
// - Reakcje w menu = ChatReactionBar variant="menu" (duże ikony, flex-1 na
//   całą szerokość; wariant inline pozostał dla kompatybilności).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
	ChatBubbleMenu,
	type ChatBubbleMenuProps,
	formatChatFullDateTime,
} from "@/components/chat/chat-bubble-menu";
import { CHAT_REACTIONS_KEY, type ChatReactionItem } from "./chat-reactions";
import type { ChatMessageItem } from "./chat-view";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function apiMessage(overrides: Partial<ChatMessageItem> = {}): ChatMessageItem {
	return {
		id: "m1",
		authorId: "u2",
		text: "Cześć!",
		replyToId: null,
		replyText: null,
		createdAt: "2026-08-22T10:00:00.000Z",
		expiresAt: "2026-08-23T10:00:00.000Z",
		author: { id: "u2", name: "Kasia" },
		...overrides,
	};
}

function reaction(overrides: Partial<ChatReactionItem> = {}): ChatReactionItem {
	return {
		messageId: "m1",
		userId: "u2",
		reaction: "heart",
		user: { id: "u2", name: "Kasia" },
		...overrides,
	};
}

function createClient(seed: ChatReactionItem[] = []): QueryClient {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData(CHAT_REACTIONS_KEY, seed);
	return client;
}

/** Stub fetcha — wszystko OK (reakcje puste, toggle OK). */
function mockFetch() {
	const fetchMock = vi
		.fn()
		.mockImplementation(() =>
			Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) }),
		);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function renderMenu(client: QueryClient, props: Partial<ChatBubbleMenuProps> = {}) {
	const allProps: ChatBubbleMenuProps = {
		message: apiMessage(),
		position: { x: 10, y: 10 },
		currentUserId: "u1",
		currentUserName: "Tomek",
		isAdmin: false,
		onReply: vi.fn(),
		onDelete: vi.fn(),
		onClose: vi.fn(),
		...props,
	};
	render(
		<QueryClientProvider client={client}>
			<ChatBubbleMenu {...allProps} />
		</QueryClientProvider>,
	);
	return allProps;
}

describe("ChatBubbleMenu", () => {
	it("closes on Escape and on pointerdown outside; a click inside does not close", () => {
		mockFetch();
		const props = renderMenu(createClient());

		// Klik w item menu nie zamyka przez outside-handler (pointerdown w środku).
		fireEvent.pointerDown(screen.getByRole("menuitem", { name: "Info" }));
		expect(props.onClose).not.toHaveBeenCalled();

		fireEvent.keyDown(window, { key: "Escape" });
		expect(props.onClose).toHaveBeenCalledTimes(1);

		fireEvent.pointerDown(document.body);
		expect(props.onClose).toHaveBeenCalledTimes(2);
	});

	it("Kopiuj writes the message text to the clipboard and closes the menu", async () => {
		const user = userEvent.setup();
		mockFetch();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText },
			configurable: true,
		});
		const props = renderMenu(createClient());

		await user.click(screen.getByRole("menuitem", { name: "Kopiuj" }));

		expect(writeText).toHaveBeenCalledWith("Cześć!");
		expect(props.onClose).toHaveBeenCalled();
	});

	it("Info opens a dialog with the author and the full PL-formatted date/time", async () => {
		const user = userEvent.setup();
		mockFetch();
		renderMenu(createClient());

		await user.click(screen.getByRole("menuitem", { name: "Info" }));

		expect(await screen.findByText("Informacje")).toBeDefined();
		expect(screen.getByText("Kasia")).toBeDefined();
		expect(screen.getByText(formatChatFullDateTime("2026-08-22T10:00:00.000Z"))).toBeDefined();
	});

	it("Kto zareagował opens a dialog with names grouped by reaction type", async () => {
		const user = userEvent.setup();
		mockFetch();
		renderMenu(
			createClient([
				reaction({ userId: "u2", user: { id: "u2", name: "Kasia" } }),
				reaction({ userId: "u3", reaction: "laugh", user: { id: "u3", name: "Ala" } }),
			]),
		);

		await user.click(screen.getByRole("menuitem", { name: "Kto zareagował" }));

		expect(await screen.findByText("Kasia")).toBeDefined();
		expect(screen.getByText("Ala")).toBeDefined();
	});

	it("Odpowiedz calls onReply with the message and closes", async () => {
		const user = userEvent.setup();
		mockFetch();
		const message = apiMessage();
		const props = renderMenu(createClient(), { message });

		await user.click(screen.getByRole("menuitem", { name: "Odpowiedz" }));

		expect(props.onReply).toHaveBeenCalledWith(message);
		expect(props.onClose).toHaveBeenCalled();
	});

	it("hides „Usuń” for another member's message; shows it for the author and for an admin", () => {
		mockFetch();
		// Cudza wiadomość, member → brak.
		renderMenu(createClient());
		expect(screen.queryByRole("menuitem", { name: "Usuń" })).toBeNull();
		cleanup();

		// Własna wiadomość → jest.
		renderMenu(createClient(), { message: apiMessage({ authorId: "u1" }) });
		expect(screen.getByRole("menuitem", { name: "Usuń" })).toBeDefined();
		cleanup();

		// Admin na cudzej → jest.
		renderMenu(createClient(), { isAdmin: true });
		expect(screen.getByRole("menuitem", { name: "Usuń" })).toBeDefined();
	});

	it("Usuń calls onDelete with the message id and closes", async () => {
		const user = userEvent.setup();
		mockFetch();
		const props = renderMenu(createClient(), { message: apiMessage({ authorId: "u1" }) });

		await user.click(screen.getByRole("menuitem", { name: "Usuń" }));

		expect(props.onDelete).toHaveBeenCalledWith("m1");
		expect(props.onClose).toHaveBeenCalled();
	});
});

// ─── Regresja HITL: dialogi w prawdziwym cyklu życia menu ─────────────────────
// ChatView renderuje `{menu && menuMessage ? <ChatBubbleMenu …/> : null}` —
// onClose odmontowuje CAŁY komponent. Bug z HITL: itemy Info/Kto zareagował
// wołały onClose od razu → dialog ginął przed pokazaniem się. Harness niżej
// odwzorowuje warunkowe odmontowanie jak w ChatView.

/** Harness jak w ChatView: menu znika z DOM po onClose. */
function renderMenuLikeChatView(client: QueryClient, props: Partial<ChatBubbleMenuProps> = {}) {
	const onClose = vi.fn();
	function Harness() {
		const [mounted, setMounted] = useState(true);
		if (!mounted) return null;
		return (
			<ChatBubbleMenu
				message={apiMessage()}
				position={{ x: 10, y: 10 }}
				currentUserId="u1"
				currentUserName="Tomek"
				isAdmin={false}
				onReply={vi.fn()}
				onDelete={vi.fn()}
				onClose={() => {
					onClose();
					setMounted(false);
				}}
				{...props}
			/>
		);
	}
	render(
		<QueryClientProvider client={client}>
			<Harness />
		</QueryClientProvider>,
	);
	return { onClose };
}

describe("ChatBubbleMenu — dialogi w cyklu życia ChatView (regresja HITL)", () => {
	it("Info opens the dialog even though ChatView unmounts the menu on onClose; closing the dialog disposes everything", async () => {
		const user = userEvent.setup();
		mockFetch();
		const { onClose } = renderMenuLikeChatView(createClient());

		await user.click(screen.getByRole("menuitem", { name: "Info" }));

		// Dialog ŻYJE (poprzednio ginął z odmontowanym menu).
		expect(await screen.findByText("Informacje")).toBeDefined();
		expect(screen.getByText("Kasia")).toBeDefined();

		// Zamknięcie dialogu (Escape) sprząta całość — menu nie wraca.
		// Radix słucha keydown na document (event bąbelkuje do window dla menu).
		fireEvent.keyDown(document, { key: "Escape" });
		await waitFor(() => {
			expect(screen.queryByRole("menu")).toBeNull();
			expect(screen.queryByText("Informacje")).toBeNull();
		});
		expect(onClose).toHaveBeenCalled();
	});

	it("Kto zareagował opens the grouped dialog under the same lifecycle", async () => {
		const user = userEvent.setup();
		mockFetch();
		renderMenuLikeChatView(
			createClient([reaction({ userId: "u2", user: { id: "u2", name: "Kasia" } })]),
		);

		await user.click(screen.getByRole("menuitem", { name: "Kto zareagował" }));

		expect(await screen.findByText("Kasia")).toBeDefined();
		// Menu schowane, dialog otwarty; klik w tło (overlay) zamyka wszystko.
		// Radix odraca dismiss na click (pointerdown z button=0, jak w przeglądarce)
		// — symulujemy pełną interakcję: pointerdown + click (#167).
		expect(screen.queryByRole("menu")).toBeNull();
		fireEvent.pointerDown(document.body);
		fireEvent.click(document.body);
		await waitFor(() => {
			expect(screen.queryByText("Kasia")).toBeNull();
		});
	});
});

describe("ChatBubbleMenu — reakcje (HITL: przycisk Zareaguj + pill jak w feedzie)", () => {
	it("shows Zareaguj as the first item and no standalone emoji row", () => {
		mockFetch();
		renderMenu(createClient());

		const items = screen.getAllByRole("menuitem");
		expect(items[0]?.textContent).toContain("Zareaguj");
		// Brak rzędu pojedynczych emoji — reakcje tylko przez bąbelek pickera.
		expect(screen.queryByRole("button", { name: "serce" })).toBeNull();
		expect(screen.queryByRole("button", { name: "ogień" })).toBeNull();
		// Kto zareagował zostaje w menu.
		expect(screen.getByRole("menuitem", { name: "Kto zareagował" })).toBeTruthy();
	});

	it("clicking Zareaguj opens the emoji pill; picking a reaction POSTs the toggle", async () => {
		const user = userEvent.setup();
		const fetchMock = mockFetch();
		renderMenu(createClient());

		await user.click(screen.getByRole("menuitem", { name: "Zareaguj" }));

		// Bąbelek z 5 emoji — ten sam co w feedzie.
		const pill = screen.getByRole("menu", { name: "Wybierz reakcję" });
		expect(pill).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: "smutek" })).toBeTruthy();

		await user.click(screen.getByRole("menuitem", { name: "ogień" }));
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/chat/messages/m1/reactions",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ reaction: "flame" }),
			}),
		);
	});
});
