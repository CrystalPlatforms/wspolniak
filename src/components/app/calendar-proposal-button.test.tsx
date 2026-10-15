// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu przycisku „Zaproponuj datę" (F6 #219):
// - Dropdown z DWIEMA opcjami: [Jako post] (dotychczasowe zachowanie — formularz
//   posta z szablonem) i [Na czat] (czat z szablonem w composerze).
// - Klik w opcję woła odpowiedni callback; dropdown zamyka się po wyborze.
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarProposalButton } from "./calendar-proposal-button";

describe("CalendarProposalButton (F6 #219)", () => {
	afterEach(() => {
		cleanup();
	});

	it("offers both targets: [Jako post] and [Na czat]", async () => {
		const user = userEvent.setup();
		render(<CalendarProposalButton onProposeAsPost={vi.fn()} onProposeToChat={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: /Zaproponuj datę/i }));

		expect(await screen.findByText("Jako post")).toBeDefined();
		expect(screen.getByText("Na czat")).toBeDefined();
	});

	it("fires onProposeAsPost for [Jako post] (stare zachowanie bez zmian)", async () => {
		const onProposeAsPost = vi.fn();
		const onProposeToChat = vi.fn();
		const user = userEvent.setup();
		render(
			<CalendarProposalButton
				onProposeAsPost={onProposeAsPost}
				onProposeToChat={onProposeToChat}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /Zaproponuj datę/i }));
		await user.click(await screen.findByText("Jako post"));

		expect(onProposeAsPost).toHaveBeenCalledTimes(1);
		expect(onProposeToChat).not.toHaveBeenCalled();
	});

	it("fires onProposeToChat for [Na czat]", async () => {
		const onProposeAsPost = vi.fn();
		const onProposeToChat = vi.fn();
		const user = userEvent.setup();
		render(
			<CalendarProposalButton
				onProposeAsPost={onProposeAsPost}
				onProposeToChat={onProposeToChat}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /Zaproponuj datę/i }));
		await user.click(await screen.findByText("Na czat"));

		expect(onProposeToChat).toHaveBeenCalledTimes(1);
		expect(onProposeAsPost).not.toHaveBeenCalled();
	});
});
