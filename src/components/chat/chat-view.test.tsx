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
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

		render(<ChatView currentUserId="u1" currentUserName="Tomek" />, { wrapper: createWrapper() });

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

		render(<ChatView currentUserId="u1" currentUserName="Tomek" />, { wrapper: createWrapper() });

		expect(await screen.findByText(/Nie ma jeszcze żadnych wiadomości/i)).toBeDefined();
	});

	it("przy ponad 50 wiadomościach pokazuje 50 najnowszych + loader + notice (starsze ukryte)", async () => {
		const many = Array.from({ length: 51 }, (_, i) =>
			apiMessage({ id: `m${i}`, text: `Wiadomość numer ${i}` }),
		);
		mockChatApi(many);

		render(<ChatView currentUserId="u1" currentUserName="Tomek" />, { wrapper: createWrapper() });

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

		render(<ChatView currentUserId="u1" currentUserName="Tomek" />, { wrapper: createWrapper() });
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

		render(<ChatView currentUserId="u1" currentUserName="Tomek" />, { wrapper: createWrapper() });
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

		render(<ChatView currentUserId="u1" currentUserName="Tomek" />, { wrapper: createWrapper() });
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

		render(<ChatView currentUserId="u1" currentUserName="Tomek" />, { wrapper: createWrapper() });
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

		render(<ChatView currentUserId="u1" currentUserName="Tomek" />, { wrapper: createWrapper() });
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
		render(<ChatView currentUserId="u1" currentUserName="Tomek" />, { wrapper: createWrapper() });
		expect(await screen.findByText("Starsza")).toBeDefined();
		const scroller = prepareScroller(50); // 50px od dna → blisko

		act(() => {
			FakeWebSocket.instances[0]?.onmessage?.({ data: wsIncoming("m2", "Nowa") });
		});
		await screen.findByText("Nowa");

		expect(scroller.scrollTo).toHaveBeenCalled();
		expect(screen.queryByRole("button", { name: /nowe wiadomości/i })).toBeNull();
	});

	it("shows the „↓ nowe wiadomości” button when scrolled up; click scrolls down", async () => {
		mockChatApi([apiMessage({ id: "m1", text: "Starsza" })]);
		render(<ChatView currentUserId="u1" currentUserName="Tomek" />, { wrapper: createWrapper() });
		expect(await screen.findByText("Starsza")).toBeDefined();
		const scroller = prepareScroller(500); // 500px od dna → przewinięte w górę

		act(() => {
			FakeWebSocket.instances[0]?.onmessage?.({ data: wsIncoming("m2", "Nowa") });
		});
		const jumpButton = await screen.findByRole("button", { name: /nowe wiadomości/i });
		expect(scroller.scrollTo).not.toHaveBeenCalled();

		await userEvent.click(jumpButton);

		expect(scroller.scrollTo).toHaveBeenCalled();
		await waitFor(() => {
			expect(screen.queryByRole("button", { name: /nowe wiadomości/i })).toBeNull();
		});
	});
});

describe("ChatView — typing indicator wiring (F3 #154)", () => {
	beforeEach(() => {
		vi.stubGlobal("WebSocket", FakeWebSocket);
		FakeWebSocket.instances = [];
	});

	it("sends a typing event while the local user types and shows the indicator for incoming typing", async () => {
		mockChatApi([]);
		render(<ChatView currentUserId="u1" currentUserName="Tomek" />, { wrapper: createWrapper() });
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

describe("ChatView — reaction row wiring (F4 #155)", () => {
	beforeEach(() => {
		vi.stubGlobal("WebSocket", FakeWebSocket);
		FakeWebSocket.instances = [];
	});

	it("renders the reaction row under each bubble; tapping toggles mine optimistically", async () => {
		const user = userEvent.setup();
		const { fetchMock } = mockChatApi([apiMessage({ id: "m1", text: "Cześć" })]);
		render(<ChatView currentUserId="u1" currentUserName="Tomek" />, {
			wrapper: createWrapper(),
		});
		expect(await screen.findByText("Cześć")).toBeDefined();

		const heart = screen.getByRole("button", { name: "serce" });
		expect(heart.getAttribute("aria-pressed")).toBe("false");
		await user.click(heart);

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/chat/messages/m1/reactions",
			expect.objectContaining({ method: "POST" }),
		);
		expect(heart.getAttribute("aria-pressed")).toBe("true");
	});
});
