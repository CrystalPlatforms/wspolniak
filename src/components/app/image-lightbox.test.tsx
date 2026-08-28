// SPDX-License-Identifier: AGPL-3.0-or-later
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { ImageLightbox } from "./image-lightbox";

const images = [
	{ id: "img-1", src: "https://example.com/1.jpg", alt: "Zdjęcie 1" },
	{ id: "img-2", src: "https://example.com/2.jpg", alt: "Zdjęcie 2" },
	{ id: "img-3", src: "https://example.com/3.jpg", alt: "Zdjęcie 3" },
];

function touchStart(target: Element, x: number, y: number) {
	fireEvent.touchStart(target, {
		touches: [{ clientX: x, clientY: y }],
	});
}

function touchEnd(target: Element, x: number, y: number) {
	fireEvent.touchEnd(target, {
		changedTouches: [{ clientX: x, clientY: y }],
	});
}

function pinchStart(target: Element, ax: number, ay: number, bx: number, by: number) {
	fireEvent.touchStart(target, {
		touches: [
			{ clientX: ax, clientY: ay },
			{ clientX: bx, clientY: by },
		],
	});
}

function pinchMove(target: Element, ax: number, ay: number, bx: number, by: number) {
	fireEvent.touchMove(target, {
		touches: [
			{ clientX: ax, clientY: ay },
			{ clientX: bx, clientY: by },
		],
	});
}

/** JSDOM reports zero-sized rects; give the lightbox a measurable image. */
function mockImageRect(img: Element, width: number, height: number) {
	vi.spyOn(img, "getBoundingClientRect").mockReturnValue({
		width,
		height,
		top: 0,
		left: 0,
		right: width,
		bottom: height,
		x: 0,
		y: 0,
		toJSON: () => ({}),
	} as DOMRect);
}

describe("ImageLightbox", () => {
	it("renders nothing when closed", () => {
		render(<ImageLightbox images={images} open={false} onClose={() => {}} />);

		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("renders overlay with the initial image when open", () => {
		render(<ImageLightbox images={images} open={true} onClose={() => {}} />);

		const dialog = screen.getByRole("dialog");
		expect(dialog).toBeDefined();

		const img = screen.getByRole("img");
		expect(img).toBeDefined();
		expect(img.getAttribute("src")).toBe("https://example.com/1.jpg");
	});

	it("renders image at specified initialIndex", () => {
		render(<ImageLightbox images={images} initialIndex={2} open={true} onClose={() => {}} />);

		const img = screen.getByRole("img");
		expect(img.getAttribute("src")).toBe("https://example.com/3.jpg");
	});

	it("navigates to next image via next button", async () => {
		const user = userEvent.setup();
		render(<ImageLightbox images={images} open={true} onClose={() => {}} />);

		expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/1.jpg");

		await user.click(screen.getByLabelText("Następne zdjęcie"));

		expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/2.jpg");
	});

	it("navigates to previous image via prev button", async () => {
		const user = userEvent.setup();
		render(<ImageLightbox images={images} initialIndex={1} open={true} onClose={() => {}} />);

		await user.click(screen.getByLabelText("Poprzednie zdjęcie"));

		expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/1.jpg");
	});

	it("wraps around when navigating past the last image", async () => {
		const user = userEvent.setup();
		render(<ImageLightbox images={images} initialIndex={2} open={true} onClose={() => {}} />);

		await user.click(screen.getByLabelText("Następne zdjęcie"));

		expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/1.jpg");
	});

	it("wraps around when navigating before the first image", async () => {
		const user = userEvent.setup();
		render(<ImageLightbox images={images} initialIndex={0} open={true} onClose={() => {}} />);

		await user.click(screen.getByLabelText("Poprzednie zdjęcie"));

		expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/3.jpg");
	});

	it("closes on Escape key", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(<ImageLightbox images={images} open={true} onClose={onClose} />);

		await user.keyboard("{Escape}");

		await waitFor(() => {
			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});

	it("closes on backdrop click", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(<ImageLightbox images={images} open={true} onClose={onClose} />);

		await user.click(screen.getByRole("dialog"));

		await waitFor(() => {
			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});

	it("does not close when clicking the image itself", async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(<ImageLightbox images={images} open={true} onClose={onClose} />);

		await user.click(screen.getByRole("img"));

		expect(onClose).not.toHaveBeenCalled();
	});

	it("navigates with ArrowRight and ArrowLeft keys", async () => {
		const user = userEvent.setup();
		render(<ImageLightbox images={images} open={true} onClose={() => {}} />);

		await user.keyboard("{ArrowRight}");
		expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/2.jpg");

		await user.keyboard("{ArrowLeft}");
		expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/1.jpg");
	});

	describe("swipe navigation", () => {
		it("navigates to next image on swipe left", () => {
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);
			const dialog = screen.getByRole("dialog");

			touchStart(dialog, 200, 100);
			touchEnd(dialog, 100, 100);

			expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/2.jpg");
		});

		it("navigates to previous image on swipe right", () => {
			render(<ImageLightbox images={images} initialIndex={1} open={true} onClose={() => {}} />);
			const dialog = screen.getByRole("dialog");

			touchStart(dialog, 100, 100);
			touchEnd(dialog, 200, 100);

			expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/1.jpg");
		});

		it("ignores short swipes below threshold", () => {
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);
			const dialog = screen.getByRole("dialog");

			touchStart(dialog, 200, 100);
			touchEnd(dialog, 170, 100);

			expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/1.jpg");
		});

		it("ignores vertical swipes", () => {
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);
			const dialog = screen.getByRole("dialog");

			touchStart(dialog, 100, 100);
			touchEnd(dialog, 100, 300);

			expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/1.jpg");
		});
	});

	describe("zoom", () => {
		it("renders zoom controls when open", () => {
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);

			expect(screen.getByLabelText("Powiększ zdjęcie")).toBeDefined();
			expect(screen.getByLabelText("Pomniejsz zdjęcie")).toBeDefined();
			expect(screen.getByLabelText("Wyzeruj powiększenie")).toBeDefined();
		});

		it("starts at scale 1 (no transform) and increases zoom on zoom-in click", () => {
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);
			const img = screen.getByRole("img");

			expect(img.style.transform).toBe("");

			fireEvent.click(screen.getByLabelText("Powiększ zdjęcie"));

			expect(img.style.transform).toContain("scale(2)");
		});

		it("reaches 10x via zoom-in button and never exceeds it", () => {
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);
			const img = screen.getByRole("img");
			const zoomIn = screen.getByLabelText("Powiększ zdjęcie");

			for (let i = 0; i < 12; i++) fireEvent.click(zoomIn);

			expect(img.style.transform).toContain("scale(10)");
			expect(img.style.transform).not.toContain("scale(11)");
		});

		it("renders crisp pixels at deep zoom and smooth below it", () => {
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);
			const img = screen.getByRole("img");
			const zoomIn = screen.getByLabelText("Powiększ zdjęcie");

			for (let i = 0; i < 3; i++) fireEvent.click(zoomIn);
			expect(img.style.imageRendering).toBe("");

			fireEvent.click(zoomIn);
			expect(img.style.imageRendering).toBe("pixelated");
		});

		it("decreases zoom on zoom-out but never below 1", () => {
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);
			const img = screen.getByRole("img");

			fireEvent.click(screen.getByLabelText("Powiększ zdjęcie"));
			expect(img.style.transform).toContain("scale(2)");

			fireEvent.click(screen.getByLabelText("Pomniejsz zdjęcie"));
			fireEvent.click(screen.getByLabelText("Pomniejsz zdjęcie"));
			fireEvent.click(screen.getByLabelText("Pomniejsz zdjęcie"));

			expect(img.style.transform).toBe("");
		});

		it("resets zoom to 1 when navigating to another image", async () => {
			const user = userEvent.setup();
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);

			fireEvent.click(screen.getByLabelText("Powiększ zdjęcie"));
			expect(screen.getByRole("img").style.transform).toContain("scale(2)");

			await user.click(screen.getByLabelText("Następne zdjęcie"));

			expect(screen.getByRole("img").style.transform).toBe("");
		});

		it("resets zoom when lightbox reopens", () => {
			const { rerender } = render(<ImageLightbox images={images} open={true} onClose={() => {}} />);

			fireEvent.click(screen.getByLabelText("Powiększ zdjęcie"));
			expect(screen.getByRole("img").style.transform).toContain("scale(2)");

			rerender(<ImageLightbox images={images} open={false} onClose={() => {}} />);
			rerender(<ImageLightbox images={images} open={true} onClose={() => {}} />);

			expect(screen.getByRole("img").style.transform).toBe("");
		});

		it("resets zoom to 1 via reset button", () => {
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);

			fireEvent.click(screen.getByLabelText("Powiększ zdjęcie"));
			fireEvent.click(screen.getByLabelText("Powiększ zdjęcie"));
			expect(screen.getByRole("img").style.transform).toContain("scale(3)");

			fireEvent.click(screen.getByLabelText("Wyzeruj powiększenie"));

			expect(screen.getByRole("img").style.transform).toBe("");
		});

		it("pans the image when zoomed in and dragged with mouse", () => {
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);

			fireEvent.click(screen.getByLabelText("Powiększ zdjęcie"));

			const img = screen.getByRole("img");
			mockImageRect(img, 200, 100);
			fireEvent.mouseDown(img, { clientX: 100, clientY: 100 });
			fireEvent.mouseMove(document, { clientX: 150, clientY: 120 });
			fireEvent.mouseUp(document);

			expect(img.style.transform).toContain("translate(50px, 20px)");
		});

		it("clamps panning so the image cannot escape its frame", () => {
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);

			fireEvent.click(screen.getByLabelText("Powiększ zdjęcie"));

			const img = screen.getByRole("img");
			mockImageRect(img, 400, 200);
			fireEvent.mouseDown(img, { clientX: 100, clientY: 100 });
			fireEvent.mouseMove(document, { clientX: 500, clientY: 500 });
			fireEvent.mouseUp(document);

			expect(img.style.transform).toContain("translate(100px, 50px)");
		});

		it("re-clamps the pan offset when zooming back out", () => {
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);

			fireEvent.click(screen.getByLabelText("Powiększ zdjęcie"));
			fireEvent.click(screen.getByLabelText("Powiększ zdjęcie"));

			const img = screen.getByRole("img");
			mockImageRect(img, 400, 200);
			fireEvent.mouseDown(img, { clientX: 100, clientY: 100 });
			fireEvent.mouseMove(document, { clientX: 300, clientY: 200 });
			fireEvent.mouseUp(document);

			fireEvent.click(screen.getByLabelText("Pomniejsz zdjęcie"));

			expect(img.style.transform).toContain("translate(100px, 50px) scale(2)");
		});

		it("does not pan when zoom is 1 (no zoom)", () => {
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);

			const img = screen.getByRole("img");
			fireEvent.mouseDown(img, { clientX: 100, clientY: 100 });
			fireEvent.mouseMove(document, { clientX: 200, clientY: 200 });
			fireEvent.mouseUp(document);

			expect(img.style.transform).toBe("");
		});

		it("pans instead of navigating on swipe when zoomed in", () => {
			render(<ImageLightbox images={images} initialIndex={0} open={true} onClose={() => {}} />);

			fireEvent.click(screen.getByLabelText("Powiększ zdjęcie"));

			const dialog = screen.getByRole("dialog");
			mockImageRect(screen.getByRole("img"), 400, 200);
			touchStart(dialog, 200, 100);
			fireEvent.touchMove(dialog, { touches: [{ clientX: 100, clientY: 100 }] });
			touchEnd(dialog, 100, 100);

			expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/1.jpg");
			expect(screen.getByRole("img").style.transform).toContain("translate(-100px, 0px)");
		});
	});

	describe("pinch zoom", () => {
		it("zooms in when spreading two fingers apart", () => {
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);
			const dialog = screen.getByRole("dialog");
			const img = screen.getByRole("img");

			pinchStart(dialog, 100, 100, 200, 100);
			pinchMove(dialog, 100, 100, 300, 100);

			expect(img.style.transform).toContain("scale(2)");
		});

		it("pinches past 4x up to deep zoom levels", () => {
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);
			const dialog = screen.getByRole("dialog");
			const img = screen.getByRole("img");

			pinchStart(dialog, 100, 100, 200, 100);
			pinchMove(dialog, 100, 100, 600, 100);

			expect(img.style.transform).toContain("scale(5)");
		});

		it("resets the pan offset when a pinch returns the zoom to 1x", () => {
			render(<ImageLightbox images={images} open={true} onClose={() => {}} />);
			const dialog = screen.getByRole("dialog");
			const img = screen.getByRole("img");

			fireEvent.click(screen.getByLabelText("Powiększ zdjęcie"));
			mockImageRect(img, 400, 200);
			touchStart(dialog, 200, 100);
			fireEvent.touchMove(dialog, { touches: [{ clientX: 100, clientY: 100 }] });
			touchEnd(dialog, 100, 100);
			expect(img.style.transform).toContain("translate(-100px, 0px)");

			pinchStart(dialog, 100, 100, 200, 100);
			pinchMove(dialog, 100, 100, 150, 100);

			expect(img.style.transform).toBe("");

			fireEvent.click(screen.getByLabelText("Powiększ zdjęcie"));
			expect(img.style.transform).toContain("translate(0px, 0px)");
		});

		it("does not navigate when a pinch ends, even after a one-finger swipe start", () => {
			render(<ImageLightbox images={images} initialIndex={0} open={true} onClose={() => {}} />);
			const dialog = screen.getByRole("dialog");

			touchStart(dialog, 200, 100);
			pinchStart(dialog, 100, 100, 200, 100);
			pinchMove(dialog, 100, 100, 300, 100);
			fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 100, clientY: 100 }] });

			expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/1.jpg");
		});

		it("does not navigate on the second finger lift after a pinch either", () => {
			render(<ImageLightbox images={images} initialIndex={0} open={true} onClose={() => {}} />);
			const dialog = screen.getByRole("dialog");

			touchStart(dialog, 200, 100);
			pinchStart(dialog, 100, 100, 200, 100);
			pinchMove(dialog, 100, 100, 300, 100);
			fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 100, clientY: 100 }] });
			fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 100, clientY: 100 }] });

			expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/1.jpg");
		});

		it("still swipes with one finger after a pinch returns the zoom to 1x", () => {
			render(<ImageLightbox images={images} initialIndex={0} open={true} onClose={() => {}} />);
			const dialog = screen.getByRole("dialog");

			pinchStart(dialog, 100, 100, 200, 100);
			pinchMove(dialog, 100, 100, 300, 100);
			fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 100, clientY: 100 }] });

			pinchStart(dialog, 100, 100, 200, 100);
			pinchMove(dialog, 100, 100, 150, 100);
			fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 100, clientY: 100 }] });

			touchStart(dialog, 200, 100);
			touchEnd(dialog, 100, 100);

			expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/2.jpg");
		});
	});
});

// #171: „Dodaj do albumu" w lightboxie — włącza go PostView (canAddToAlbum +
// cfImageId na obrazie); lightbox albumu i feedu (bez props) nie pożycza.
// Overlay idzie przez portal do body (naprawa: komentarze przebijaly lightbox).
describe("ImageLightbox — Dodaj do albumu (#171)", () => {
	const postImages = [
		{ id: "img-1", src: "https://example.com/1.jpg", alt: "Zdjęcie 1", cfImageId: "cf-aaa" },
		{ id: "img-2", src: "https://example.com/2.jpg", alt: "Zdjęcie 2" },
	];

	function renderLightbox(images: typeof postImages, props?: { canAddToAlbum?: boolean }) {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		return render(
			<QueryClientProvider client={queryClient}>
				<ImageLightbox images={images} open={true} onClose={() => {}} {...props} />
			</QueryClientProvider>,
		);
	}

	it("renders the add-to-album button next to download when enabled", () => {
		renderLightbox(postImages, { canAddToAlbum: true });

		expect(screen.getByRole("button", { name: "Dodaj zdjęcie do albumu" })).not.toBeNull();
		expect(screen.getByRole("button", { name: "Pobierz zdjęcie" })).not.toBeNull();
	});

	it("hides the button when canAddToAlbum is off (album/feed lightbox)", () => {
		renderLightbox(postImages);

		expect(screen.queryByRole("button", { name: "Dodaj zdjęcie do albumu" })).toBeNull();
	});

	it("hides the button for images without a cfImageId", () => {
		const noRef = [{ id: "img-2", src: "https://example.com/2.jpg", alt: "Zdjęcie 2" }];
		renderLightbox(noRef, { canAddToAlbum: true });

		expect(screen.queryByRole("button", { name: "Dodaj zdjęcie do albumu" })).toBeNull();
	});
});
