// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Założenia zakodowane w testach (stan na RED, #146):
 * - FadeImage renderuje prawdziwy <img loading="lazy"> + szary overlay .skeleton
 *   (placeholder) jako rodzeństwo — rodzic musi być `relative`.
 * - Fade = klasa `fade-image-out` + `data-revealed="true"` na overlayu; element
 *   ZOSTAJE w DOM (transition w CSS, zero timerów odmontowujących).
 * - Self-reveal (brak `reveal`): odsłonięcie po onLoad; zdjęcie z cache
 *   (`complete` w ref-callback) też liczy się jako załadowane.
 * - `reveal` podany: rodzic decyazuje o momencie odsłonięcia (choreografia
 *   PostCard — fade jest finalnym etapem karty); load tylko sygnalizuje
 *   przez `onImageLoad`.
 * - `onImageLoad` wołane dokładnie raz na zdjęcie.
 * - Samej animacji opacity ani reduced-motion nie testujemy w jsdom — to
 *   deklaratywny CSS (fade-image.css), wzorzec jak shimmer w #145.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { FadeImage } from "./fade-image";

function overlayFor(img: HTMLElement): HTMLElement {
	const overlay = img.parentElement?.querySelector(".fade-image-placeholder");
	if (!overlay) throw new Error("brak placeholdera obok <img>");
	return overlay as HTMLElement;
}

describe("FadeImage", () => {
	it("pokazuje szary placeholder i wygasza go po załadowaniu zdjęcia (self-reveal)", () => {
		render(
			<div className="relative">
				<FadeImage src="https://img/1" alt="Zdjęcie 1" className="aspect-square w-full" />
			</div>,
		);

		const img = screen.getByRole("img", { name: "Zdjęcie 1" });
		const overlay = overlayFor(img);
		expect(overlay.getAttribute("data-revealed")).toBe("false");
		expect(overlay.className).toContain("skeleton");

		fireEvent.load(img);

		// placeholder zostaje w DOM, tylko przechodzi w stan wygaszenia (fade w CSS)
		expect(overlay.getAttribute("data-revealed")).toBe("true");
		expect(overlay.className).toContain("fade-image-out");
	});

	it("renderuje img z loading=lazy — browser odkłada pobieranie off-screen", () => {
		render(
			<div className="relative">
				<FadeImage src="https://img/1" alt="Zdjęcie 1" className="aspect-square w-full" />
			</div>,
		);

		expect(screen.getByRole("img", { name: "Zdjęcie 1" }).getAttribute("loading")).toBe("lazy");
	});

	it("zdjęcie z cache (complete w ref-callback) odsłania bez zdarzenia load", () => {
		// jsdom nie ładuje obrazków — udajemy, że bytes są już w cache browsera
		const completeSpy = vi
			.spyOn(HTMLImageElement.prototype, "complete", "get")
			.mockReturnValue(true);
		try {
			render(
				<div className="relative">
					<FadeImage src="https://img/1" alt="Zdjęcie 1" className="aspect-square w-full" />
				</div>,
			);

			const overlay = overlayFor(screen.getByRole("img", { name: "Zdjęcie 1" }));
			expect(overlay.getAttribute("data-revealed")).toBe("true");
		} finally {
			completeSpy.mockRestore();
		}
	});

	it("reveal od rodzica: load tylko sygnalizuje, odsłania dopiero reveal=true (kolejność choreografii)", () => {
		const { rerender } = render(
			<div className="relative">
				<FadeImage
					src="https://img/1"
					alt="Zdjęcie 1"
					className="aspect-square w-full"
					reveal={false}
				/>
			</div>,
		);

		const img = screen.getByRole("img", { name: "Zdjęcie 1" });
		fireEvent.load(img);

		// zdjęcie pobrane, ale choreografia ma pierwszeństwo — placeholder trzyma się
		let overlay = overlayFor(img);
		expect(overlay.getAttribute("data-revealed")).toBe("false");

		rerender(
			<div className="relative">
				<FadeImage src="https://img/1" alt="Zdjęcie 1" className="aspect-square w-full" reveal />
			</div>,
		);
		overlay = overlayFor(img);
		expect(overlay.getAttribute("data-revealed")).toBe("true");
	});

	it("onImageLoad woła się dokładnie raz (load po complete nie dubluje)", () => {
		const onImageLoad = vi.fn();
		const completeSpy = vi
			.spyOn(HTMLImageElement.prototype, "complete", "get")
			.mockReturnValue(true);
		try {
			render(
				<div className="relative">
					<FadeImage
						src="https://img/1"
						alt="Zdjęcie 1"
						className="aspect-square w-full"
						reveal={false}
						onImageLoad={onImageLoad}
					/>
				</div>,
			);

			fireEvent.load(screen.getByRole("img", { name: "Zdjęcie 1" }));
			fireEvent.load(screen.getByRole("img", { name: "Zdjęcie 1" }));

			expect(onImageLoad).toHaveBeenCalledTimes(1);
		} finally {
			completeSpy.mockRestore();
		}
	});
});
