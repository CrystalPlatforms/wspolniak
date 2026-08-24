// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu UI (F1 #152):
// - Wiadomości z GET /api/chat/messages (JSON — daty jako ISO string).
// - Strona bąbelka eksponowana atrybutem data-side="own"|"other" (własne prawo,
//   cudze lewo); imię autora tylko na pierwszym bąbelku grupy kolejnych wiadomości
//   tego samego autora; godzina (HH:MM, pl-PL) w każdym bąbelku.
// - >50 wiadomości: renderujemy 50 najnowszych + wiersz loadera (role="status")
//   + notice (decyzja usera 2026-08-22).
// - Wysyłka optymistyczna: natychmiastowy bąbelek + pasek postępu (role="progressbar")
//   pod nim; błąd → czerwony pasek + przycisk „Ponów"; Ponów wysyła ponownie.
// - Limit 200 znaków w UI (maxLength); pusty tekst nie da się wysłać.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { ChatView } from "./chat-view";

/** Fake WebSocket (granica przeglądarki) — lapany przez useChatSocket w każdym teście. */
class FakeWebSocket {
	static instances: FakeWebSocket[] = [];
	/** WebSocket.OPEN === 1 (wartość z przeglądarki; używana przez throttle typingu). */
	static readonly OPEN = 1;
	url: string;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onclose: (() => void) | null = null;
	send = vi.fn();
	readyState: number = FakeWebSocket.OPEN;

	constructor(url: string) {
		this.url = url;
		FakeWebSocket.instances.push(this);
	}

	close() {
		this.readyState = 3; // CLOSED
		this.onclose?.();
	}
}

beforeEach(() => {
	vi.stubGlobal("WebSocket", FakeWebSocket);
	FakeWebSocket.instances = [];
});

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

interface ApiMessage {
	id: string;
	authorId: string;
	text: string;
	replyToId?: string | null;
	replyText?: string | null;
	createdAt: string;
	author: { id: string; name: string };
}

function apiMessage(overrides: Partial<ApiMessage> = {}): ApiMessage {
	return {
		id: "msg-1",
		authorId: "u2",
		text: "Dzień dobry!",
		createdAt: "2026-08-22T10:00:00.000Z",
		author: { id: "u2", name: "Kasia" },
		...overrides,
	};
}

/** Mock fetch: GET zwraca listę, POST zwraca potwierdzoną wiadomość (konfigurowalne). */
function mockChatApi(messages: ApiMessage[], postResult?: { ok: boolean; message?: ApiMessage }) {
	let postCount = 0;
	const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
		if (init?.method === "POST") {
			postCount += 1;
			if (postResult && !postResult.ok) {
				return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: "x" }) });
			}
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ data: postResult?.message }),
			});
		}
		if (url.includes("/api/chat/messages")) {
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: messages }) });
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
	});
	vi.stubGlobal("fetch", fetchMock);
	return { fetchMock, postCount: () => postCount };
}

function bubbleRows() {
	return Array.from(document.querySelectorAll<HTMLElement>("[data-side]"));
}

function expectedTime(iso: string) {
	return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("ChatView — lista wiadomości", () => {
	it("własne wiadomości po prawej, cudze po lewej, imię tylko na pierwszym z grupy, godzina w każdym bąbelku", async () => {
		mockChatApi([
			apiMessage({ id: "m1", text: "Cześć wam" }),
			apiMessage({ id: "m2", text: "Co słychać?" }),
			apiMessage({
				id: "m3",
				authorId: "u1",
				author: { id: "u1", name: "Tomek" },
				text: "U nas dobrze",
			}),
		]);

		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});

		// Czekaj na załadowanie listy.
		expect(await screen.findByText("Cześć wam")).toBeDefined();

		const rows = bubbleRows();
		expect(rows).toHaveLength(3);
		// Kasia (u2) → lewa strona; Tomek (u1, własna) → prawa.
		expect(rows[0]?.dataset.side).toBe("other");
		expect(rows[1]?.dataset.side).toBe("other");
		expect(rows[2]?.dataset.side).toBe("own");

		// Imię „Kasia" tylko raz — druga wiadomość tej samej autorki jest w grupie.
		expect(screen.getAllByText("Kasia")).toHaveLength(1);
		// Własne wiadomości nigdy nie pokazują imienia.
		expect(screen.queryByText("Tomek")).toBeNull();

		// Godzina w każdym bąbelku (to samo wywołanie Intl co w komponencie).
		const time = expectedTime("2026-08-22T10:00:00.000Z");
		expect(screen.getAllByText(time)).toHaveLength(3);
	});

	it("pokazuje przyjazny pusty stan, gdy nie ma żadnych wiadomości", async () => {
		mockChatApi([]);

		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});

		expect(await screen.findByText(/Nie ma jeszcze żadnych wiadomości/i)).toBeDefined();
	});

	it("przy ponad 50 wiadomościach pokazuje 50 najnowszych + loader + notice (starsze ukryte)", async () => {
		const many = Array.from({ length: 51 }, (_, i) =>
			apiMessage({ id: `m${i}`, text: `Wiadomość numer ${i}` }),
		);
		mockChatApi(many);

		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});

		// Najnowsza (50) widoczna, najstarsza (0) ukryta — renderujemy tylko 50.
		expect(await screen.findByText("Wiadomość numer 50")).toBeDefined();
		expect(screen.queryByText("Wiadomość numer 0")).toBeNull();
		// Wiersz loadera nad listą (starsze wiadomości istnieją, ale są ukryte).
		expect(screen.getByRole("status")).toBeDefined();
		expect(screen.getByText(/starsze wiadomości z ostatniej doby są ukryte/i)).toBeDefined();
	});
});

describe("ChatView — wysyłka wiadomości", () => {
	it("pokazuje optymistyczny bąbelek natychmiast z paskiem postępu (bez czekania na API)", async () => {
		// POST wisi w nieskończoność — bąbelek i tak musi być widoczny od razu.
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
				if (init?.method === "POST") return new Promise(() => {});
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
			}),
		);

		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		const input = await screen.findByRole("textbox", { name: /wiadomość/i });
		await userEvent.type(input, "Idziemy na obiad?");
		await userEvent.click(screen.getByRole("button", { name: /wyślij/i }));

		// Bąbelek pojawia się natychmiast, po stronie własnej, z paskiem postępu.
		const bubble = screen.getByText("Idziemy na obiad?");
		expect(bubble).toBeDefined();
		expect(bubble.closest<HTMLElement>("[data-side]")?.dataset.side).toBe("own");
		expect(screen.getByRole("progressbar")).toBeDefined();
	});

	it("przy błędzie API pasek robi się czerwony i pojawia się Ponów; ponowienie wysyła ponownie", async () => {
		const confirmed = apiMessage({
			id: "server-1",
			authorId: "u1",
			author: { id: "u1", name: "Tomek" },
			text: "Idziemy na obiad?",
		});
		// Pierwszy POST — błąd; drugi (Ponów) — sukces. GET zawsze pusty.
		let postCount = 0;
		const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
			if (init?.method === "POST") {
				postCount += 1;
				if (postCount === 1) {
					return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: "x" }) });
				}
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ data: confirmed }),
				});
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		const input = await screen.findByRole("textbox", { name: /wiadomość/i });
		await userEvent.type(input, "Idziemy na obiad?");
		await userEvent.click(screen.getByRole("button", { name: /wyślij/i }));

		// Błąd: pasek czerwony (aria-label zmienia się na „Błąd wysyłania”) + Ponów.
		expect(await screen.findByRole("progressbar", { name: /błąd wysyłania/i })).toBeDefined();
		const retryButton = screen.getByRole("button", { name: /ponów/i });
		expect(retryButton).toBeDefined();

		await userEvent.click(retryButton);

		// Ponów: pomyślny POST, bąbelek potwierdzony — brak paska i przycisku Ponów.
		// (Sukces przychodzi natychmiast, więc nie asertujemy po drodze stanu „wysyłanie”.)
		await waitFor(() => {
			expect(screen.queryByRole("progressbar")).toBeNull();
			expect(screen.queryByRole("button", { name: /ponów/i })).toBeNull();
		});
		expect(screen.getByText("Idziemy na obiad?")).toBeDefined();
		expect(fetchMock.mock.calls.filter(([_url, init]) => init?.method === "POST")).toHaveLength(2);
	});

	it("nie dubluje potwierdzonej wiadomości, gdy broadcast WS wygra wyścig z odpowiedzią POST", async () => {
		const confirmed = apiMessage({
			id: "server-1",
			authorId: "u1",
			author: { id: "u1", name: "Tomek" },
			text: "Wyścig broadcastu",
		});
		// POST wisi, aż go puścimy — w międzyczasie nadchodzi broadcast (ten sam id).
		let resolvePost: ((value: unknown) => void) | undefined;
		const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
			if (init?.method === "POST") {
				return new Promise((res) => {
					resolvePost = () => res({ ok: true, json: () => Promise.resolve({ data: confirmed }) });
				});
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		const input = await screen.findByRole("textbox", { name: /wiadomość/i });
		await userEvent.type(input, "Wyścig broadcastu");
		await userEvent.click(screen.getByRole("button", { name: /wyślij/i }));

		// Bąbelek w locie: dokładnie jeden.
		expect(screen.getAllByText("Wyścig broadcastu")).toHaveLength(1);

		// Broadcast WS (własna wiadomość wraca do nadawcy) PRZED odpowiedzią POST.
		act(() => {
			FakeWebSocket.instances[0]?.onmessage?.({
				data: JSON.stringify({ type: "message", data: confirmed }),
			});
		});

		// Teraz dopiero odpowiedź POST — nie może dokleić duplikatu.
		await act(async () => {
			resolvePost?.(undefined);
		});

		await waitFor(() => {
			expect(screen.getAllByText("Wyścig broadcastu")).toHaveLength(1);
		});
		// Bąbelek potwierdzony (po stronie own), pasek postępu zniknął.
		expect(screen.queryByRole("progressbar")).toBeNull();
	});

	it("egzekwuje limit 200 znaków (maxLength) i blokuje wysyłkę pustej wiadomości", async () => {
		const { fetchMock } = mockChatApi([]);

		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		const input = await screen.findByRole("textbox", { name: /wiadomość/i });

		// Limit UI = limit API (Zod): input nie przyjmie 201. znaku.
		expect(input.getAttribute("maxlength")).toBe("200");

		// Pusty draft → przycisk Wyślij nieaktywny; zero POST-ów po kliknięciu formularza.
		const sendButton = screen.getByRole("button", { name: /wyślij/i });
		expect(sendButton.hasAttribute("disabled")).toBe(true);
		await userEvent.type(input, "   ");
		expect(sendButton.hasAttribute("disabled")).toBe(true);

		expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
	});
});

describe("ChatView — real-time (WS)", () => {
	function wsIncoming(id: string, text: string) {
		return JSON.stringify({
			type: "message",
			data: apiMessage({ id, text, authorId: "u2", author: { id: "u2", name: "Kasia" } }),
		});
	}

	function rowByText(text: string): HTMLElement {
		const bubble = screen.getByText(text);
		return bubble.closest("li") as HTMLElement;
	}

	/** Scrollowalny kontener listy z podmienioną geometrią (jsdom ma same zera). */
	function prepareScroller(distance: number) {
		const el = document.querySelector<HTMLElement>("[data-chat-scroll]");
		if (!el) throw new Error("brak kontenera scrolla");
		const scrollHeight = 1000;
		const clientHeight = 400;
		Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
		Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
		Object.defineProperty(el, "scrollTop", {
			value: scrollHeight - clientHeight - distance,
			configurable: true,
		});
		el.scrollTo = vi.fn();
		return el;
	}

	it("incoming WS message renders live with the slide-in class; initial list does not animate", async () => {
		mockChatApi([apiMessage({ id: "m1", text: "Starsza wiadomość" })]);

		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		expect(await screen.findByText("Starsza wiadomość")).toBeDefined();

		// Początkowa lista się NIE animuje (brak chat-bubble-in).
		expect(rowByText("Starsza wiadomość").classList.contains("chat-bubble-in")).toBe(false);

		// Wiadomość z WS pojawia się na żywo, z animacją slide-in.
		act(() => {
			FakeWebSocket.instances[0]?.onmessage?.({ data: wsIncoming("m2", "Świeża wiadomość") });
		});
		const newRow = await screen.findByText("Świeża wiadomość");
		expect(newRow).toBeDefined();
		expect(rowByText("Świeża wiadomość").classList.contains("chat-bubble-in")).toBe(true);
		// Stara nadal bez animacji.
		expect(rowByText("Starsza wiadomość").classList.contains("chat-bubble-in")).toBe(false);
	});

	it("auto-scrolls to the new message when the user is near the bottom (no button)", async () => {
		mockChatApi([apiMessage({ id: "m1", text: "Starsza" })]);
		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		expect(await screen.findByText("Starsza")).toBeDefined();
		const scroller = prepareScroller(50); // 50px od dna → blisko

		act(() => {
			FakeWebSocket.instances[0]?.onmessage?.({ data: wsIncoming("m2", "Nowa") });
		});
		await screen.findByText("Nowa");

		expect(scroller.scrollTo).toHaveBeenCalled();
		expect(screen.queryByRole("button", { name: /zjedź na sam dół/i })).toBeNull();
	});

	it("shows the „↓ Zjedź na sam dół” button when scrolled up; click scrolls down", async () => {
		mockChatApi([apiMessage({ id: "m1", text: "Starsza" })]);
		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		expect(await screen.findByText("Starsza")).toBeDefined();
		const scroller = prepareScroller(500); // 500px od dna → przewinięte w górę
		// Przewinięcie = event scroll (przeglądarka odpala go przy scrollu usera).
		await act(async () => {
			fireEvent.scroll(scroller);
		});

		act(() => {
			FakeWebSocket.instances[0]?.onmessage?.({ data: wsIncoming("m2", "Nowa") });
		});
		await screen.findByText("Nowa");
		const jumpButton = screen.getByRole("button", { name: /zjedź na sam dół/i });
		expect(scroller.scrollTo).not.toHaveBeenCalled();

		await userEvent.click(jumpButton);

		expect(scroller.scrollTo).toHaveBeenCalled();
		await waitFor(() => {
			expect(screen.queryByRole("button", { name: /zjedź na sam dół/i })).toBeNull();
		});
	});

	// F8 #159 HITL (zgłoszenie usera): przycisk widoczny ZAWSZE gdy przewinięto
	// w górę — nie tylko po nadejściu nowej wiadomości. Sterowany pozycją scrolla.
	it("shows the jump button on scroll-up alone (no new message); hides back at the bottom", async () => {
		mockChatApi([apiMessage({ id: "m1", text: "Starsza" })]);
		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		expect(await screen.findByText("Starsza")).toBeDefined();

		// Bez eventu scroll przycisku nie ma (stan startowy: przy dniu).
		expect(screen.queryByRole("button", { name: /zjedź na sam dół/i })).toBeNull();

		// User przewija w górę → przycisk natychmiast (bez nowych wiadomości).
		const scroller = prepareScroller(500);
		await act(async () => {
			fireEvent.scroll(scroller);
		});
		expect(screen.getByRole("button", { name: /zjedź na sam dół/i })).toBeDefined();

		// Powrót na dół → przycisk znika.
		Object.defineProperty(scroller, "scrollTop", { value: 1000, configurable: true });
		await act(async () => {
			fireEvent.scroll(scroller);
		});
		expect(screen.queryByRole("button", { name: /zjedź na sam dół/i })).toBeNull();
	});
});

describe("ChatView — typing indicator wiring (F3 #154)", () => {
	beforeEach(() => {
		vi.stubGlobal("WebSocket", FakeWebSocket);
		FakeWebSocket.instances = [];
	});

	it("sends a typing event while the local user types and shows the indicator for incoming typing", async () => {
		mockChatApi([]);
		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		const socket = FakeWebSocket.instances[0];
		expect(socket).toBeDefined();

		// Lokalne pisanie → wychodzący event typing (pierwsze uderzenie, throttle 2s).
		await userEvent.type(screen.getByLabelText("Wiadomość"), "Cześć");
		expect(socket?.send).toHaveBeenCalledWith(JSON.stringify({ type: "typing" }));

		// Przychodzący anonimowy typing → wskaźnik widoczny nad inputem.
		act(() => {
			socket?.onmessage?.({ data: JSON.stringify({ type: "typing" }) });
		});
		const indicator = screen
			.getByText("ktoś pisze…")
			.closest("[data-typing-indicator]") as HTMLElement | null;
		expect(indicator).not.toBeNull();
		expect(indicator?.getAttribute("data-visible")).toBe("true");
	});
});

describe("ChatView — reactions live only in the context menu (HITL F5)", () => {
	beforeEach(() => {
		vi.stubGlobal("WebSocket", FakeWebSocket);
		FakeWebSocket.instances = [];
	});

	it("does NOT render the reaction bar under bubbles anymore", async () => {
		mockChatApi([apiMessage({ id: "m1", text: "Cześć" })]);
		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		expect(await screen.findByText("Cześć")).toBeDefined();

		// Pasek reakcji zniknął spod bąbelków — reakcje tylko w context menu.
		expect(document.querySelectorAll("[data-chat-reaction-bar]")).toHaveLength(0);
		expect(screen.queryByRole("button", { name: "serce" })).toBeNull();
	});
});

// ─── F5 #156 + F6 #157 ────────────────────────────────────────────────────────
// Założenia kontraktu UI (context menu / reply / delete):
// - Menu otwiera long-press (~500ms), prawy klik lub Enter/Space na bąbelku;
//   zwykły tap nic nie robi. Itemy: Odpowiedz, Kopiuj, Kto zareagował, Info,
//   reakcje (ten sam pasek) i Usuń (tylko autor/admin).
// - Odpowiedz: quote preview nad inputem; POST z replyToId; potwierdzona
//   odpowiedź renderuje quote nad bąbelkiem; klik quote scrolluje do ŻYWEGO
//   oryginału (wygasły/usunięty = bez scrolla).
// - Usuń: DELETE /api/chat/messages/:id; event WS "delete" animuje bąbelek
//   (chat-bubble-out) i po ~230ms czyści go z cache.

/** Czekanie na prawdziwych timerach (long-press 500ms / bubble-out 230ms). */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Bąbelek (div[role=button]) zawierający tekst wiadomości. */
function bubbleOf(text: string): HTMLElement {
	return screen.getByText(text).closest('[role="button"]') as HTMLElement;
}

describe("ChatView — context menu (F5 #156)", () => {
	beforeEach(() => {
		vi.stubGlobal("WebSocket", FakeWebSocket);
		FakeWebSocket.instances = [];
	});

	it("opens on right-click with all items + reactions; plain tap is inert; no „Usuń” on others' messages", async () => {
		const user = userEvent.setup();
		mockChatApi([apiMessage({ id: "m1", text: "Cześć" })]); // autor u2 (cudza)
		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		await screen.findByText("Cześć");

		// Zwykły tap (pointerdown+up bez przytrzymania) nie otwiera menu.
		fireEvent.pointerDown(bubbleOf("Cześć"), { clientX: 10, clientY: 10 });
		fireEvent.pointerUp(bubbleOf("Cześć"));
		await sleep(600);
		expect(screen.queryByRole("menu")).toBeNull();

		// Prawy klik otwiera menu ze wszystkimi itemami.
		fireEvent.contextMenu(bubbleOf("Cześć"), { clientX: 100, clientY: 100 });
		expect(screen.getByRole("menu", { name: "Menu wiadomości" })).toBeDefined();
		for (const label of ["Odpowiedz", "Kopiuj", "Kto zareagował", "Info"]) {
			expect(screen.getByRole("menuitem", { name: label })).toBeDefined();
		}
		// Życzenie usera: reakcje też w menu (ten sam pasek serce/śmiech/ogień).
		const menuEl = screen.getByRole("menu", { name: "Menu wiadomości" });
		expect(within(menuEl).getByRole("button", { name: "serce" })).toBeDefined();
		// Cudza wiadomość + member → bez „Usuń".
		expect(screen.queryByRole("menuitem", { name: "Usuń" })).toBeNull();

		// Escape zamyka menu.
		fireEvent.keyDown(window, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
		expect(user).toBeDefined();
	});

	it("opens after a long-press (~500ms) and shows „Usuń” on own message", async () => {
		mockChatApi([
			apiMessage({ id: "m1", authorId: "u1", author: { id: "u1", name: "Tomek" }, text: "Moja" }),
		]);
		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		await screen.findByText("Moja");

		fireEvent.pointerDown(bubbleOf("Moja"), { clientX: 10, clientY: 10, pointerType: "touch" });
		await sleep(600);
		expect(screen.getByRole("menu")).toBeDefined();
		expect(screen.getByRole("menuitem", { name: "Usuń" })).toBeDefined();
	});

	it("shows „Usuń” on someone else's message for an admin", async () => {
		mockChatApi([apiMessage({ id: "m1", text: "Cudza" })]);
		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin />, {
			wrapper: createWrapper(),
		});
		await screen.findByText("Cudza");

		fireEvent.contextMenu(bubbleOf("Cudza"), { clientX: 50, clientY: 50 });
		expect(screen.getByRole("menuitem", { name: "Usuń" })).toBeDefined();
	});
});

describe("ChatView — reply (F5 #156)", () => {
	beforeEach(() => {
		vi.stubGlobal("WebSocket", FakeWebSocket);
		FakeWebSocket.instances = [];
	});

	it("Odpowiedz sets the quote preview above the input and sends replyToId with the message", async () => {
		const user = userEvent.setup();
		const reply = apiMessage({
			id: "m2",
			authorId: "u1",
			author: { id: "u1", name: "Tomek" },
			text: "Moja odpowiedź",
			replyToId: "m1",
			replyText: "Oryginał",
		});
		const { fetchMock } = mockChatApi([apiMessage({ id: "m1", text: "Oryginał" })], {
			ok: true,
			message: reply,
		});
		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		await screen.findByText("Oryginał");

		fireEvent.contextMenu(bubbleOf("Oryginał"), { clientX: 50, clientY: 50 });
		await user.click(screen.getByRole("menuitem", { name: "Odpowiedz" }));

		// Preview nad inputem: etykieta „Odpowiedź" + cytowany tekst.
		const preview = document.querySelector("[data-reply-preview]");
		expect(preview).not.toBeNull();
		expect(preview?.textContent).toContain("Oryginał");

		await user.type(screen.getByLabelText("Wiadomość"), "Moja odpowiedź");
		await user.click(screen.getByRole("button", { name: /wyślij/i }));

		// POST z replyToId (dokładnie ten endpoint, nie reakcje).
		const postCall = fetchMock.mock.calls.find(
			([url, init]) => url === "/api/chat/messages" && init?.method === "POST",
		);
		expect(postCall).toBeDefined();
		expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
			text: "Moja odpowiedź",
			replyToId: "m1",
		});

		// Potwierdzona odpowiedź renderuje quote nad bąbelkiem.
		await screen.findByText("Moja odpowiedź");
		const quote = document.querySelector("[data-reply-quote]");
		expect(quote?.textContent).toContain("Oryginał");
	});

	it("anulowanie odpowiedzi usuwa preview i wysyła bez replyToId", async () => {
		const user = userEvent.setup();
		const confirmed = apiMessage({
			id: "m2",
			authorId: "u1",
			author: { id: "u1", name: "Tomek" },
			text: "Zwykła",
		});
		const { fetchMock } = mockChatApi([apiMessage({ id: "m1", text: "Oryginał" })], {
			ok: true,
			message: confirmed,
		});
		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		await screen.findByText("Oryginał");

		fireEvent.contextMenu(bubbleOf("Oryginał"), { clientX: 50, clientY: 50 });
		await user.click(screen.getByRole("menuitem", { name: "Odpowiedz" }));
		await user.click(screen.getByRole("button", { name: "Anuluj odpowiedź" }));
		expect(document.querySelector("[data-reply-preview]")).toBeNull();

		await user.type(screen.getByLabelText("Wiadomość"), "Zwykła");
		await user.click(screen.getByRole("button", { name: /wyślij/i }));

		const postCall = fetchMock.mock.calls.find(
			([url, init]) => url === "/api/chat/messages" && init?.method === "POST",
		);
		expect(JSON.parse(String(postCall?.[1]?.body))).not.toHaveProperty("replyToId");
	});

	it("clicking a quote scrolls to a live original; a gone original does not scroll", async () => {
		mockChatApi([
			apiMessage({ id: "m1", text: "Oryginał" }),
			apiMessage({ id: "m2", text: "Odp", replyToId: "m1", replyText: "Oryginał" }),
			apiMessage({ id: "m3", text: "Odp2", replyToId: "gone", replyText: "Stara wiadomość" }),
		]);
		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		await screen.findByText("Odp");

		const scrollIntoView = vi.fn();
		Element.prototype.scrollIntoView = scrollIntoView;

		// Oryginał nie istnieje (wygasł/usunięty) — quote zostaje, bez scrolla.
		fireEvent.click(screen.getByText("Stara wiadomość"));
		expect(scrollIntoView).not.toHaveBeenCalled();

		// Żywy oryginał — scroll do jego wiersza.
		const liveQuote = screen.getByText("Odp").closest("li")?.querySelector("[data-reply-quote]");
		expect(liveQuote).not.toBeNull();
		fireEvent.click(liveQuote as Element);
		expect(scrollIntoView).toHaveBeenCalledTimes(1);
	});
});

describe("ChatView — delete for everyone (F6 #157)", () => {
	beforeEach(() => {
		vi.stubGlobal("WebSocket", FakeWebSocket);
		FakeWebSocket.instances = [];
	});

	it("a WS delete event animates the bubble out and removes it after the animation", async () => {
		mockChatApi([apiMessage({ id: "m1", text: "Do usunięcia" })]);
		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		await screen.findByText("Do usunięcia");
		const row = screen.getByText("Do usunięcia").closest("li") as HTMLElement;

		act(() => {
			FakeWebSocket.instances[0]?.onmessage?.({
				data: JSON.stringify({ type: "delete", data: { messageId: "m1" } }),
			});
		});

		// Najpierw animacja (transform+opacity), potem zniknięcie z DOM.
		expect(row.classList.contains("chat-bubble-out")).toBe(true);
		await sleep(400);
		expect(screen.queryByText("Do usunięcia")).toBeNull();
	});

	it("„Usuń” in the menu calls DELETE /api/chat/messages/:id", async () => {
		const user = userEvent.setup();
		const mine = apiMessage({
			id: "m1",
			authorId: "u1",
			author: { id: "u1", name: "Tomek" },
			text: "Moja",
		});
		const { fetchMock } = mockChatApi([mine]);
		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		await screen.findByText("Moja");

		fireEvent.contextMenu(bubbleOf("Moja"), { clientX: 50, clientY: 50 });
		await user.click(screen.getByRole("menuitem", { name: "Usuń" }));

		expect(fetchMock).toHaveBeenCalledWith("/api/chat/messages/m1", { method: "DELETE" });
	});
});

// Założenia kontraktu offline (F8 #159): navigator.onLine = granica przeglądarki
// (override przez defineProperty jak w use-online-status.test.ts). Offline →
// banner „Jesteś offline" nad kompozytorem, input i Wyślij zablokowane, reakcje
// w menu zablokowane (bez kolejowania — PRD). Powrót online odblokowuje.
function setNavigatorOnline(value: boolean) {
	Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

describe("ChatView — offline (F8 #159)", () => {
	afterEach(() => {
		setNavigatorOnline(true);
	});

	it("shows the Jesteś offline banner and disables the composer while offline", async () => {
		setNavigatorOnline(false);
		mockChatApi([apiMessage({ id: "m1", text: "Cześć" })]);
		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		await screen.findByText("Cześć");

		expect(screen.getByText("Jesteś offline")).toBeDefined();
		expect(screen.getByLabelText("Wiadomość")).toHaveProperty("disabled", true);
		expect(screen.getByRole("button", { name: "Wyślij" }).getAttribute("disabled")).not.toBeNull();
	});

	it("disables reaction buttons in the context menu while offline", async () => {
		setNavigatorOnline(false);
		mockChatApi([apiMessage({ id: "m1", text: "Cześć" })]);
		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		await screen.findByText("Cześć");

		fireEvent.contextMenu(bubbleOf("Cześć"), { clientX: 100, clientY: 100 });
		const menuEl = screen.getByRole("menu", { name: "Menu wiadomości" });
		const heart = within(menuEl).getByRole("button", { name: "serce" });
		expect(heart.getAttribute("disabled")).not.toBeNull();
	});

	it("re-enables the composer when back online", async () => {
		setNavigatorOnline(false);
		mockChatApi([apiMessage({ id: "m1", text: "Cześć" })]);
		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});
		await screen.findByText("Cześć");
		expect(screen.getByText("Jesteś offline")).toBeDefined();

		await act(async () => {
			setNavigatorOnline(true);
			window.dispatchEvent(new Event("online"));
		});

		expect(screen.queryByText("Jesteś offline")).toBeNull();
		expect(screen.getByLabelText("Wiadomość")).toHaveProperty("disabled", false);

		// Wyślij odblokowany, gdy jest tekst (przy pustym drafcie disabled zawsze).
		const user = userEvent.setup();
		await user.type(screen.getByLabelText("Wiadomość"), "wracam");
		expect(screen.getByRole("button", { name: "Wyślij" }).getAttribute("disabled")).toBeNull();
	});
});
