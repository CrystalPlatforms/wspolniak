// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadFlowError } from "@/images/upload";
import { UploadErrorAlert } from "./upload-error-alert";

describe("UploadErrorAlert", () => {
	it("pokazuje komunikat błędu i przycisk ponowienia wołający onRetry", async () => {
		const user = userEvent.setup();
		const onRetry = vi.fn();
		const error = new UploadFlowError(
			"image-upload",
			"network",
			`Nie udało się przesłać zdjęcia „wakacje.jpg" — sprawdź połączenie z internetem i spróbuj ponownie.`,
			"TypeError: Load failed",
			"wakacje.jpg",
		);

		render(<UploadErrorAlert error={error} onRetry={onRetry} />);

		expect(screen.getByText(/Nie udało się przesłać zdjęcia/i)).toBeTruthy();

		await user.click(screen.getByRole("button", { name: /spróbuj ponownie/i }));

		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("bez onRetry nie pokazuje przycisku ponowienia", () => {
		render(<UploadErrorAlert error={new Error("cokolwiek")} />);

		expect(screen.queryByRole("button", { name: /spróbuj ponownie/i })).toBeNull();
	});

	it("rozwija szczegóły diagnostyczne (krok, typ, plik) po kliknięciu Szczegóły", async () => {
		const user = userEvent.setup();
		const error = new UploadFlowError(
			"image-upload",
			"timeout",
			"Przesłanie zdjęcia trwało zbyt długo.",
			"TimeoutError: The operation was aborted due to timeout",
			"duze.jpg",
		);

		render(<UploadErrorAlert error={error} />);

		await user.click(screen.getByRole("button", { name: /szczegóły/i }));

		expect(screen.getByText(/krok/i)).toBeTruthy();
		expect(screen.getByText(/image-upload/i)).toBeTruthy();
		expect(screen.getByText(/timeout/i)).toBeTruthy();
		expect(screen.getByText(/duze\.jpg/i)).toBeTruthy();
	});

	it("przycisk Kopiuj zapisuje diagnostykę do schowka", async () => {
		const user = userEvent.setup();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText },
			configurable: true,
		});

		const error = new UploadFlowError(
			"create-post",
			"network",
			"Nie udało się połączyć z serwerem.",
			"TypeError: Load failed",
		);

		render(<UploadErrorAlert error={error} />);

		await user.click(screen.getByRole("button", { name: /szczegóły/i }));
		await user.click(screen.getByRole("button", { name: /kopiuj/i }));

		expect(writeText).toHaveBeenCalledTimes(1);
		const copied = writeText.mock.calls[0]?.[0] as string;
		expect(copied).toContain("Krok: create-post");
		expect(copied).toContain("network");
	});
});
