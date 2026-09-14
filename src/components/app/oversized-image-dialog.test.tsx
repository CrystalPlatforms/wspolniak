// SPDX-License-Identifier: AGPL-3.0-or-later
// Dialog „za duże zdjęcie" (#200): shrinkImageToLimit = granica (worker w środku),
// mock jak w album-create-dialog.test.tsx — kolejność, rozmiary i błędy sterujemy wprost.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { OversizedImageDialog } from "./oversized-image-dialog";

vi.mock("@/images/shrink", () => ({
	shrinkImageToLimit: vi.fn(),
	ShrinkError: class ShrinkError extends Error {
		name = "ShrinkError";
	},
}));

import { ShrinkError, shrinkImageToLimit } from "@/images/shrink";

const mockShrink = vi.mocked(shrinkImageToLimit);

function fileOfSize(name: string, bytes: number, type = "image/jpeg"): File {
	return new File([new Uint8Array(bytes)], name, { type });
}

function renderDialog(overrides: { file?: File | null } = {}) {
	const onShrunk = vi.fn();
	const file =
		overrides.file !== undefined ? overrides.file : fileOfSize("duze.jpg", 20 * 1024 * 1024);
	render(
		<OversizedImageDialog
			file={file}
			limitMb={19}
			open={file !== null}
			onOpenChange={() => {}}
			onShrunk={onShrunk}
		/>,
	);
	return { onShrunk };
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("OversizedImageDialog", () => {
	it("pokazuje nazwę pliku, rzeczywisty rozmiar i limit", () => {
		renderDialog({ file: fileOfSize("wakacje.jpg", 21 * 1024 * 1024) });

		expect(screen.getByRole("dialog").textContent).toContain("wakacje.jpg");
		expect(screen.getByRole("dialog").textContent).toContain("21 MB");
		expect(screen.getByRole("dialog").textContent).toContain("19 MB");
	});

	it("akcja Zmniejsz wywołuje onShrunk ze zmniejszonym plikiem i blokuje przycisk w trakcie", async () => {
		const { onShrunk } = renderDialog();
		let resolveShrink!: (file: File) => void;
		mockShrink.mockImplementation(
			() =>
				new Promise<File>((resolve) => {
					resolveShrink = resolve;
				}),
		);

		await userEvent.click(screen.getByRole("button", { name: /zmniejsz zdjęcie/i }));

		// w trakcie kompresji przycisk zablokowany (label „Zmniejszanie…")
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /zmniejsz/i })).toHaveProperty("disabled", true),
		);

		const small = fileOfSize("duze.webp", 400 * 1024, "image/webp");
		resolveShrink(small);

		await waitFor(() => expect(onShrunk).toHaveBeenCalledTimes(1));
		expect(onShrunk).toHaveBeenCalledWith(small);
	});

	it("pokazuje błąd w dialogu i nie wywołuje onShrunk, gdy zmniejszanie się nie uda", async () => {
		const { onShrunk } = renderDialog();
		mockShrink.mockRejectedValueOnce(
			new ShrinkError(
				`Nie udało się zmniejszyć zdjęcia „duze.jpg" poniżej limitu — usuń je i dodaj mniejsze.`,
			),
		);

		await userEvent.click(screen.getByRole("button", { name: /zmniejsz zdjęcie/i }));

		await waitFor(() =>
			expect(screen.getByRole("dialog").textContent).toMatch(/nie udało się zmniejszyć/i),
		);
		expect(onShrunk).not.toHaveBeenCalled();
	});

	it("Anuluj zamyka dialog", async () => {
		const onOpenChange = vi.fn();
		render(
			<OversizedImageDialog
				file={fileOfSize("duze.jpg", 20 * 1024 * 1024)}
				limitMb={19}
				open
				onOpenChange={onOpenChange}
				onShrunk={vi.fn()}
			/>,
		);

		await userEvent.click(screen.getByRole("button", { name: /anuluj/i }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
