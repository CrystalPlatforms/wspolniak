// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Założenia kodowane przez te testy (stan przed RED) — F3 #190:
 * - Tryb `propose-post-description` istnieje w GENERATION_MODES — endpoint
 *   go dispatchuje, schemat walidacji rozpoznaje.
 * - Wiadomości vision: persona PL (system) + user z DOKŁADNIE dwiema częściami
 *   — tekst instrukcji i obraz jako `image_url` z data URL (do Groqa lecą
 *   wyłącznie bajty, nigdy zdalny URL — prywatność v2).
 * - Polish step: scena (zwykły tekst, wynik wywołania vision) → finalny opis
 *   posta; persona jak improve (polski, bez emoji/tabel, zero wymyślonych
 *   faktów).
 * - Nie testowane: prawdziwe wywołania Groqa, treść promptów słowo w słowo —
 *   tylko cechy zachowania (rola, kształt, cechy komunikatów).
 */

import {
	GENERATION_MODES,
	improvePostDescriptionMessages,
	polishPostDescriptionMessages,
	proposePostDescriptionVisionMessages,
} from "./generation-prompts";
import { VISION_MODEL_ID } from "./models";

const DATA_URL = "data:image/jpeg;base64,QUJDREVGRw==";

describe("GENERATION_MODES", () => {
	it("tryb propose-post-description jest zarejestrowany (F3 #190)", () => {
		expect(GENERATION_MODES).toContain("propose-post-description");
	});
});

describe("VISION_MODEL_ID", () => {
	it("model vision jest zarejestrowany w źródle prawdy modeli", () => {
		expect(VISION_MODEL_ID).toBe("qwen/qwen3.8-27b");
	});
});

describe("proposePostDescriptionVisionMessages", () => {
	it("system = persona PL, user = instrukcja + obraz jako image_url (data URL)", () => {
		const [system, user] = proposePostDescriptionVisionMessages(DATA_URL);
		expect(system?.role).toBe("system");
		expect(typeof system?.content).toBe("string");
		expect(system?.content).toContain("po polsku");
		// HITL 2026-09-20: zna nasze logotypy (Wspólniak, Crystal) — branding
		// pomija, nie zgaduje „co ma znaczyć"
		expect(system?.content).toContain("logotyp");
		expect(system?.content).toContain("Crystal");
		expect(user?.role).toBe("user");
		expect(user?.content).toEqual([
			{ type: "text", text: expect.stringContaining("Opisz") },
			{ type: "image_url", image_url: { url: DATA_URL } },
		]);
	});
});

describe("polishPostDescriptionMessages", () => {
	it("scena ląduje jako user content, persona pilnuje polskiego i zakazu wymyślania", () => {
		const scene = "Na tarasie stoi stół z dwiema osobami przy kawie.";
		const [system, user] = polishPostDescriptionMessages(scene);
		expect(system?.role).toBe("system");
		expect(system?.content).toContain("po polsku");
		expect(system?.content).toContain("nie wymyślasz");
		// HITL 2026-09-20: opisy mają być krótkie — twardy limit 2 zdań
		expect(system?.content).toContain("2 zdania");
		// HITL 2026-09-20 (humanizer): pisze jak członek rodziny, nie opisuje
		// mechanicznie „na zdjęciu widać", zero konstrukcji typu „Nie tylko…, ale…"
		expect(system?.content).toContain("członek rodziny");
		expect(system?.content).toContain("Na zdjęciu");
		expect(system?.content).toContain("Nie tylko");
		// HITL 2026-09-20: podpisy mają być zabawne; emoji dozwolone, ale
		// oszczędnie i na końcu zdań (wyrażanie emocji)
		expect(system?.content).toContain("humoru");
		expect(system?.content.toLowerCase()).toContain("emoji");
		// humanizer (Wikipedia Signs of AI writing): proste copula zamiast
		// „stanowi/cechuje się", zero myślników-dramu i aforyzmów „To język…"
		expect(system?.content).toContain("stanowi");
		expect(system?.content.toLowerCase()).toContain("myślnik");
		expect(system?.content).toContain("aforyzm");
		// HITL 2026-09-20: gdy w kadrze nasze logotypy (Wspólniak, Crystal),
		// podpis mówi o markach DOBRZE — ciepło i z dumą, nie pomija
		expect(system?.content).toContain("Wspólniak");
		expect(system?.content).toContain("dobrze");
		expect(user?.content).toBe(scene);
	});
});

describe("improvePostDescriptionMessages (regresja F1)", () => {
	it("bez zmian: system + user z samym tekstem", () => {
		const [system, user] = improvePostDescriptionMessages("koty w ogródku");
		expect(system?.content).toContain("po polsku");
		expect(user?.content).toBe("koty w ogródku");
	});
});
