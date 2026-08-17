// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { type UploadFailureEntry, UploadFailuresSection } from "./upload-failures-section";

function makeFailure(overrides: Partial<UploadFailureEntry> = {}): UploadFailureEntry {
	return {
		id: "failure-1",
		userId: "u2",
		userName: "Kasia",
		step: "image-upload",
		kind: "network",
		detail: "TypeError: Load failed",
		fileName: "wakacje.jpg",
		fileSize: 2048,
		createdAt: "2026-08-17T10:00:00.000Z",
		...overrides,
	};
}

describe("UploadFailuresSection", () => {
	it("pokazuje stan ładowania", () => {
		render(<UploadFailuresSection failures={undefined} isLoading={true} />);

		expect(screen.getByText(/ładowanie/i)).toBeTruthy();
	});

	it("pokazuje pusty stan, gdy brak nieudanych uploadów", () => {
		render(<UploadFailuresSection failures={[]} isLoading={false} />);

		expect(screen.getByText(/brak nieudanych uploadów/i)).toBeTruthy();
	});

	it("listuje wpisy: kto, krok, rodzaj błędu i plik", () => {
		render(
			<UploadFailuresSection
				failures={[
					makeFailure(),
					makeFailure({
						id: "failure-2",
						userName: "Tomek",
						kind: "timeout",
						step: "create-post",
						fileName: null,
						fileSize: null,
					}),
				]}
				isLoading={false}
			/>,
		);

		expect(screen.getByText("Kasia")).toBeTruthy();
		expect(screen.getByText(/image-upload/)).toBeTruthy();
		expect(screen.getByText(/network/)).toBeTruthy();
		expect(screen.getByText(/wakacje\.jpg/)).toBeTruthy();
		expect(screen.getByText(/create-post/)).toBeTruthy();
		expect(screen.getByText(/timeout/)).toBeTruthy();
	});
});
