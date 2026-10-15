// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu UI dla nowych typów wiadomości i draftów (#217/#218/#219):
// - Bąbelek załączników: zdjęcia jako <img>, pliki nieobrazowe jako karty
//   (nazwa + rozmiar) z downloadem; podpis (text) w bąbelku.
// - Bąbelek posta: karta (miniatura + wycinek + autor); post: null → placeholder
//   „Post usunięty". Klik w kartę prowadzi do /app/post/$id.
// - Draft posta (draftPostId): podgląd w composerze, NIC nie leci automatycznie
//   (wysyłka ręczna — decyzja właściciela); Wyślij tworzy kind='post'.
// - Draft tekstowy (draftText): tekst wstawiony do pola, gotowy do edycji.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { ChatView } from "./chat-view";

// Karta posta renderuje Link (TanStack Router) — passthrough na <a>, jak w
// post-card.test.tsx; nawigacja jest przedmiotem testów karty postu.
vi.mock("@tanstack/react-router", () => ({
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
}));

/** Fake WebSocket (granica przeglądarki) — lapany przez useChatSocket w każdym teście. */
class FakeWebSocket {
	static instances: FakeWebSocket[] = [];
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
		this.readyState = 3;
		this.onclose?.();
	}
}

beforeEach(() => {
	vi.stubGlobal("WebSocket", FakeWebSocket);
	FakeWebSocket.instances = [];
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const KEY_1 = "9f8c2b1a-1b2c-3d4e-5f6a-7b8c9d0e1f2a";
const KEY_2 = "0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d";

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
	kind?: string;
	payload?: unknown;
	post?: unknown;
	createdAt: string;
	author: { id: string; name: string };
}

function apiMessage(overrides: Partial<ApiMessage> = {}): ApiMessage {
	return {
		id: "msg-1",
		authorId: "u2",
		text: "",
		createdAt: "2026-10-15T10:00:00.000Z",
		author: { id: "u2", name: "Kasia" },
		...overrides,
	};
}

/** Mock fetch: GET /messages zwraca listę; share-preview konfigurowalny; POST rejestrowany. */
function mockChatApi(options: {
	messages?: ApiMessage[];
	preview?: unknown;
	previewStatus?: number;
}) {
	const posts: ApiMessage[] = [];
	const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
		if (init?.method === "POST") {
			posts.push(JSON.parse(init.body as string) as ApiMessage);
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						data: apiMessage({
							id: "server-1",
							authorId: "u1",
							...(JSON.parse(init.body as string) as object),
						}),
					}),
			});
		}
		if (url.includes("/api/chat/share-preview")) {
			if (options.previewStatus) {
				return Promise.resolve({
					ok: false,
					status: options.previewStatus,
					json: () => Promise.resolve({}),
				});
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: options.preview }) });
		}
		if (url.includes("/api/chat/messages")) {
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ data: options.messages ?? [] }),
			});
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
	});
	vi.stubGlobal("fetch", fetchMock);
	return { fetchMock, posts: () => posts };
}

describe("ChatView — bąbelek załączników (F4 #217)", () => {
	it("renders images as photos and non-image files as file cards with size", async () => {
		mockChatApi({
			messages: [
				apiMessage({
					id: "att-1",
					authorId: "u1",
					author: { id: "u1", name: "Tomek" },
					kind: "attachments",
					text: "Z wakacji",
					payload: {
						attachments: [
							{ key: KEY_1, name: "zdjecie.jpg", size: 2048, mimeType: "image/jpeg" },
							{ key: KEY_2, name: "umowa.pdf", size: 943_000, mimeType: "application/pdf" },
						],
					},
				}),
			],
		});

		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});

		const photo = await screen.findByRole("img", { name: "zdjecie.jpg" });
		expect(photo.getAttribute("src")).toBe(`/api/chat/attachments/${KEY_1}`);

		const fileCard = await screen.findByRole("link", { name: /umowa\.pdf/ });
		expect(fileCard.getAttribute("download")).toBe("umowa.pdf");
		expect(fileCard.getAttribute("href")).toBe(`/api/chat/attachments/${KEY_2}`);
		expect(fileCard.textContent).toContain("920,9 KB");
		expect(screen.getByText("Z wakacji")).toBeDefined();
	});

	it("opens the lightbox after clicking a photo (zamiast nowej karty)", async () => {
		mockChatApi({
			messages: [
				apiMessage({
					id: "att-2",
					authorId: "u1",
					author: { id: "u1", name: "Tomek" },
					kind: "attachments",
					payload: {
						attachments: [{ key: KEY_1, name: "zdjecie.jpg", size: 2048, mimeType: "image/jpeg" }],
					},
				}),
			],
		});
		const user = userEvent.setup();

		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});

		await user.click(await screen.findByRole("button", { name: "Powiększ zdjęcie zdjecie.jpg" }));

		const dialog = await screen.findByRole("dialog");
		expect(dialog.getAttribute("aria-modal")).toBe("true");
		// Lightbox ma własne pobieranie — zdjęcie nie musi już otwierać nowej karty.
		expect(screen.getByRole("button", { name: /pobierz zdjęcie/i })).toBeDefined();
		expect(within(dialog).getByRole("img", { name: "zdjecie.jpg" }).getAttribute("src")).toBe(
			`/api/chat/attachments/${KEY_1}`,
		);
	});

	it("falls back to plain text for a corrupt payload", async () => {
		mockChatApi({
			messages: [
				apiMessage({
					id: "att-bad",
					authorId: "u2",
					kind: "attachments",
					text: "Uszkodzone",
					payload: { attachments: "nie-macie" },
				}),
			],
		});

		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});

		expect(await screen.findByText("Uszkodzone")).toBeDefined();
		expect(document.querySelector("[data-attachments-bubble]")).toBeNull();
	});
});

describe("ChatView — bąbelek udostępnionego posta (F5 #218)", () => {
	it("renders the resolved card (thumbnail, snippet, author) linking to the post", async () => {
		mockChatApi({
			messages: [
				apiMessage({
					id: "post-1",
					authorId: "u2",
					text: "Zobaczcie",
					kind: "post",
					payload: { postId: "p1" },
					post: {
						id: "p1",
						snippet: "Wakacje nad morzem",
						authorName: "Kasia",
						thumbnailUrl: "https://img.example/x.jpg",
					},
				}),
			],
		});

		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});

		const card = await screen.findByRole("link", { name: /Wakacje nad morzem/ });
		expect(card.getAttribute("href")).toBe("/app/post/p1");
		expect(card.textContent).toContain("Kasia");
		// Miniatura (alt="" — dekoracyjna) siedzi wewnątrz karty.
		expect(card.querySelector("img")).toBeTruthy();
		expect(screen.getByText("Zobaczcie")).toBeDefined();
	});

	it("renders the „Post usunięty” placeholder when the post no longer exists", async () => {
		mockChatApi({
			messages: [
				apiMessage({
					id: "post-dead",
					authorId: "u2",
					kind: "post",
					payload: { postId: "p1" },
					post: null,
				}),
			],
		});

		render(<ChatView currentUserId="u1" currentUserName="Tomek" isAdmin={false} />, {
			wrapper: createWrapper(),
		});

		expect(await screen.findByText("Post usunięty")).toBeDefined();
		expect(document.querySelector("[data-post-card]")).toBeNull();
	});
});

describe("ChatView — draft posta w composerze (F5 #218)", () => {
	it("shows the preview and does NOT auto-send (wysyłka ręczna)", async () => {
		const api = mockChatApi({
			preview: { id: "p1", snippet: "Wakacje", authorName: "Kasia", thumbnailUrl: null },
		});

		render(
			<ChatView
				currentUserId="u1"
				currentUserName="Tomek"
				isAdmin={false}
				draftPostId="p1"
				onDraftConsumed={() => {}}
			/>,
			{ wrapper: createWrapper() },
		);

		expect(await screen.findByText("Udostępnij post")).toBeDefined();
		expect(screen.getByText("Wakacje")).toBeDefined();
		// Nic nie wysłane: zero POST-ów po otwarciu czatu z draftem.
		await waitFor(() => expect(api.posts()).toHaveLength(0));
	});

	it("sends kind='post' with the optional comment, then clears the draft", async () => {
		const api = mockChatApi({
			preview: { id: "p1", snippet: "Wakacje", authorName: "Kasia", thumbnailUrl: null },
		});
		const onDraftConsumed = vi.fn();

		render(
			<ChatView
				currentUserId="u1"
				currentUserName="Tomek"
				isAdmin={false}
				draftPostId="p1"
				onDraftConsumed={onDraftConsumed}
			/>,
			{ wrapper: createWrapper() },
		);

		await screen.findByText("Udostępnij post");
		const input = screen.getByRole("textbox", { name: /wiadomość/i });
		await userEvent.type(input, "Spójrzcie na to");
		await userEvent.click(screen.getByRole("button", { name: /wyślij/i }));

		await waitFor(() => expect(api.posts()).toHaveLength(1));
		expect(api.posts()[0]).toMatchObject({
			kind: "post",
			text: "Spójrzcie na to",
			payload: { postId: "p1" },
		});
		await waitFor(() => expect(onDraftConsumed).toHaveBeenCalled());
	});

	it("sends without a comment (pusty tekst nie blokuje draftu posta)", async () => {
		const api = mockChatApi({
			preview: { id: "p1", snippet: "Wakacje", authorName: "Kasia", thumbnailUrl: null },
		});

		render(
			<ChatView
				currentUserId="u1"
				currentUserName="Tomek"
				isAdmin={false}
				draftPostId="p1"
				onDraftConsumed={() => {}}
			/>,
			{ wrapper: createWrapper() },
		);

		await screen.findByText("Udostępnij post");
		const sendButton = screen.getByRole("button", { name: /wyślij/i });
		await waitFor(() => expect(sendButton.hasAttribute("disabled")).toBe(false));
		await userEvent.click(sendButton);

		await waitFor(() => expect(api.posts()).toHaveLength(1));
		expect(api.posts()[0]).toMatchObject({ kind: "post", text: "" });
	});
});

describe("ChatView — draft tekstowy (F6 #219)", () => {
	it("prefills the composer with the template, ready to edit and send", async () => {
		const api = mockChatApi({});

		render(
			<ChatView
				currentUserId="u1"
				currentUserName="Tomek"
				isAdmin={false}
				draftText="Witam, tu Tomek I chciałem zaproponować nową datę"
				onDraftConsumed={() => {}}
			/>,
			{ wrapper: createWrapper() },
		);

		const input = (await screen.findByRole("textbox", {
			name: /wiadomość/i,
		})) as HTMLInputElement;
		expect(input.value).toBe("Witam, tu Tomek I chciałem zaproponować nową datę");

		await userEvent.click(screen.getByRole("button", { name: /wyślij/i }));
		await waitFor(() => expect(api.posts()).toHaveLength(1));
		expect(api.posts()[0]).toMatchObject({
			text: "Witam, tu Tomek I chciałem zaproponować nową datę",
		});
	});

	it("collapses whitespace (jednowierszowy input sanitizuje CR/LF)", async () => {
		mockChatApi({});
		render(
			<ChatView
				currentUserId="u1"
				currentUserName="Tomek"
				isAdmin={false}
				draftText={"linia 1\nlinia 2\n\nlinia 3"}
				onDraftConsumed={() => {}}
			/>,
			{ wrapper: createWrapper() },
		);

		const input = (await screen.findByRole("textbox", {
			name: /wiadomość/i,
		})) as HTMLInputElement;
		expect(input.value).toBe("linia 1 linia 2 linia 3");
	});
});
