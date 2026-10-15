// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu promptów AL (regresja halucynacji postów — naprawa po
// zgłoszeniu: AL wymyślił listę postów „z drzewami”, których nie ma w feedzie):
// - Gałąź „posty NIE były przeszukiwane” MUSI twardo zakazywać wymyślania
//   postów (tytuły/autorzy/daty/listy) i kierować na jawną prośbę „poszukaj…".
// - Gałąź „szukałem, zero trafień” też zakazuje zmyślania.
// - Gałąź z postami deklaruje dostęp i wypisuje WYŁĄCZNIE przekazane posty.
// - Baza wiedzy zawiera regułę: brak sekcji postów = żadnych postów nie ma.
import { buildSystemPrompt } from "./knowledge";

describe("buildSystemPrompt — zakaz zmyślania postów (regresja halucynacji)", () => {
	it("not-searched branch forbids inventing posts outright", () => {
		const prompt = buildSystemPrompt([], { searched: false });
		expect(prompt).toContain("posty NIE były przeszukiwane");
		expect(prompt).toContain("NIGDY nie wymyślaj postów");
		expect(prompt).toContain("poszukaj postów o wyjeździe");
	});

	it("searched-but-empty branch keeps the no-invention rule", () => {
		const prompt = buildSystemPrompt([], { searched: true });
		expect(prompt).toContain("nic nie pasowało");
		expect(prompt).toContain("Nie zmyślaj treści postów");
	});

	it("posts branch lists ONLY the injected posts", () => {
		const prompt = buildSystemPrompt(
			[
				{
					title: "W górach",
					description: "Spacer po Tatrach",
					author: "Kasia",
					date: "2026-08-01",
				},
			],
			{ searched: true },
		);
		expect(prompt).toContain("MASZ DOSTĘP");
		expect(prompt).toContain("W górach");
		expect(prompt).toContain("Kasia");
	});

	it("base knowledge ties post talk to the posts section (brak sekcji = brak postów)", () => {
		const prompt = buildSystemPrompt([], { searched: false });
		expect(prompt).toContain("brak tej sekcji");
		expect(prompt).toContain("nie wymyślasz ani nie wypisujesz postów spoza sekcji");
	});

	it("search-limited branch honestly reports the budget instead of pretending empty", () => {
		const prompt = buildSystemPrompt([], { searchLimited: true });
		expect(prompt).toContain("limit szukania");
	});
});
