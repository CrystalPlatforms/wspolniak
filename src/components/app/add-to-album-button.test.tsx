// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (#171/#172):
// - Dialog pobiera GET /api/app/albums?addable=1 dopiero po otwarciu (enabled: open).
// - Wybór albumu: POST /api/app/albums/:id/items z { kind, refs: [itemRef] }.
// - Pusta lista → „Nie masz albumów, musisz najpierw stworzyć." + skrót do
//   AlbumCreateDialog („Stwórz album" otwiera flow tworzenia z F1).
// - Trigger bierze styl i treść od mount-pointu (deep module); dialog +
//   komunikaty błędów (sonner) są wspólne.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, vi } from "vitest";
import { AddToAlbumButton } from "./add-to-album-button";

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

// F7 #176: bramka flagi albums czyta useAppBootstrap — mock na poziomie pliku.
// `?? { featureFlags: undefined }`: afterEach robi restoreAllMocks, co czyści
// mockReturnValue — fallback chroni testy spoza describe flagi.
const mockUseAppBootstrap = vi.fn();
vi.mock("@/core/app-bootstrap", () => ({
	useAppBootstrap: () => mockUseAppBootstrap() ?? { featureFlags: undefined },
}));

const mockToast = vi.mocked(toast);

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

/** fetch: GET addable → lista albumów; POST .../items → 201 (albo init.fail). */
function mockAddableApi(
	albums: { id: string; title: string }[] = [{ id: "a1", title: "Wakacje" }],
	opts: { failPost?: boolean } = {},
) {
	return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
		if (init?.method === "POST" && url.includes("/items")) {
			if (opts.failPost) {
				return Promise.resolve({
					ok: false,
					status: 403,
					json: () => Promise.resolve({ error: "Forbidden" }),
				});
			}
			return Promise.resolve({
				ok: true,
				status: 201,
				json: () => Promise.resolve({ data: { added: 1 } }),
			});
		}
		if (url.includes("/api/app/albums?addable=1")) {
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: albums }) });
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
	});
}

interface RenderProps {
	kind?: "post_photo" | "video";
	itemRef?: string;
	ariaLabel?: string;
}

function renderButton({
	kind = "post_photo",
	itemRef = "cf-9",
	ariaLabel = "Dodaj zdjęcie do albumu",
}: RenderProps = {}) {
	return render(
		<AddToAlbumButton kind={kind} itemRef={itemRef} ariaLabel={ariaLabel} className="trigger-x">
			<span>Ikonka</span>
		</AddToAlbumButton>,
		{ wrapper: createWrapper() },
	);
}

function openDialog() {
	fireEvent.click(screen.getByRole("button", { name: "Dodaj zdjęcie do albumu" }));
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("AddToAlbumButton", () => {
	it("renders the trigger with mount-point content; dialog closed until clicked", () => {
		vi.stubGlobal("fetch", mockAddableApi());
		renderButton();

		const trigger = screen.getByRole("button", { name: "Dodaj zdjęcie do albumu" });
		expect(trigger).not.toBeNull();
		expect(trigger.getAttribute("class")).toContain("trigger-x");
		expect(screen.queryByText("Ikonka")).not.toBeNull();
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("lists the member's addable albums after opening (fetch gated on open)", async () => {
		const fetchSpy = mockAddableApi([
			{ id: "a1", title: "Wakacje" },
			{ id: "a2", title: "Święta" },
		]);
		vi.stubGlobal("fetch", fetchSpy);
		renderButton();

		openDialog();

		await waitFor(() => {
			expect(screen.getByText("Wakacje")).not.toBeNull();
		});
		expect(screen.getByText("Święta")).not.toBeNull();
		expect(fetchSpy).toHaveBeenCalledWith("/api/app/albums?addable=1");
	});

	it("adds the photo to the chosen album (POST with kind and cfImageId ref)", async () => {
		const fetchSpy = mockAddableApi();
		vi.stubGlobal("fetch", fetchSpy);
		renderButton();

		openDialog();
		await waitFor(() => screen.getByText("Wakacje"));
		fireEvent.click(screen.getByText("Wakacje"));

		// Bez toastu sukcesu (revizja usera #173) — czekamy na sam POST.
		await waitFor(() => {
			expect(fetchSpy.mock.calls.some(([, init]) => (init as RequestInit)?.method === "POST")).toBe(
				true,
			);
		});
		const post = fetchSpy.mock.calls.find(([, init]) => (init as RequestInit)?.method === "POST");
		expect(post).toBeDefined();
		const [url, init] = post as [string, RequestInit];
		expect(url).toBe("/api/app/albums/a1/items");
		expect(JSON.parse(init.body as string)).toEqual({ kind: "post_photo", refs: ["cf-9"] });
	});

	it("adds a video with kind video and the video id as ref (#172)", async () => {
		const fetchSpy = mockAddableApi();
		vi.stubGlobal("fetch", fetchSpy);
		renderButton({ kind: "video", itemRef: "yt-1", ariaLabel: "Dodaj wideo do albumu" });

		fireEvent.click(screen.getByRole("button", { name: "Dodaj wideo do albumu" }));
		await waitFor(() => screen.getByText("Wakacje"));
		fireEvent.click(screen.getByText("Wakacje"));

		// Bez toastu sukcesu (revizja usera #173) — czekamy na sam POST.
		await waitFor(() => {
			expect(fetchSpy.mock.calls.some(([, init]) => (init as RequestInit)?.method === "POST")).toBe(
				true,
			);
		});
		const post = fetchSpy.mock.calls.find(([, init]) => (init as RequestInit)?.method === "POST");
		const [, init] = post as [string, RequestInit];
		expect(JSON.parse(init.body as string)).toEqual({ kind: "video", refs: ["yt-1"] });
	});

	it("shows the empty state with a working create shortcut", async () => {
		vi.stubGlobal("fetch", mockAddableApi([]));
		renderButton();

		openDialog();

		await waitFor(() => {
			expect(screen.getByText(/Nie masz albumów, musisz najpierw stworzyć/i)).not.toBeNull();
		});
		fireEvent.click(screen.getByRole("button", { name: "Stwórz album" }));
		// Skrót otwiera flow tworzenia (F1) — dialog „Nowy album".
		expect(screen.getByText("Nowy album")).not.toBeNull();
	});

	it("toasts an error when the add fails", async () => {
		vi.stubGlobal("fetch", mockAddableApi([{ id: "a1", title: "Wakacje" }], { failPost: true }));
		renderButton();

		openDialog();
		await waitFor(() => screen.getByText("Wakacje"));
		fireEvent.click(screen.getByText("Wakacje"));

		await waitFor(() => {
			expect(mockToast.error).toHaveBeenCalledWith("Nie udało się dodać do albumu");
		});
	});
});

// F7 #176: master switch „Albumy" — przy fladze OFF przycisk „Dodaj do albumu"
// znika z każdego mount-pointu (lightbox, post-view, wideo), bo bramka siedzi
// w samym AddToAlbumButton. URL /app/albums zostaje bez guarda (decyzja PRD).
describe("AddToAlbumButton — flaga albums (F7 #176)", () => {
	function renderButton() {
		const Wrapper = createWrapper();
		render(
			<Wrapper>
				<AddToAlbumButton kind="post_photo" itemRef="cf-1" ariaLabel="Dodaj Wakacje do albumu">
					<span>Dodaj do albumu</span>
				</AddToAlbumButton>
			</Wrapper>,
		);
	}

	it("renders the trigger when the albums flag is on", () => {
		mockUseAppBootstrap.mockReturnValue({ featureFlags: { albums: true } });
		renderButton();

		expect(screen.getByRole("button", { name: "Dodaj Wakacje do albumu" })).toBeTruthy();
	});

	it("renders nothing when the albums flag is off", () => {
		mockUseAppBootstrap.mockReturnValue({ featureFlags: { albums: false } });
		renderButton();

		expect(screen.queryByRole("button", { name: "Dodaj Wakacje do albumu" })).toBeNull();
	});

	it("renders when flags are not loaded yet (undefined featureFlags)", () => {
		mockUseAppBootstrap.mockReturnValue({ featureFlags: undefined });
		renderButton();

		expect(screen.getByRole("button", { name: "Dodaj Wakacje do albumu" })).toBeTruthy();
	});
});
