// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo } from "react";
import { useBootSettled } from "./boot-splash";

/**
 * Czysta reguła kolejności odsłaniania etapów choreografii bootu (#145):
 * etap jest widoczny wtedy i tylko wtedy, gdy on sam oraz wszystkie wcześniejsze
 * etapy są gotowe. Funkcja czysta, bez timerów — etap pojawia się w tej samej
 * ticki, w której spełnione są jego warunki („zero sztucznych opóźnień").
 */
export function revealStages<T extends string>(
	stages: readonly T[],
	ready: Record<T, boolean>,
): Record<T, boolean> {
	let unlocked = true;
	const visible = {} as Record<T, boolean>;
	for (const stage of stages) {
		unlocked = unlocked && ready[stage] === true;
		visible[stage] = unlocked;
	}
	return visible;
}

/**
 * Sekwencer choreografii treści — jedno miejsce na wszystkie ekrany
 * (#145: feed; P5: widok posta, wideo, biblioteka). Odpowiada na pytanie
 * „czy etap X może się już pokazać?" i hermetyzuje:
 * - kolejność odsłaniania (revealStages) z zerem sztucznych opóźnień,
 * - cold/warm: przed osiadnięciem pasków (useBootSettled=false) treść czeka
 *   na szkieletach; warm (nawigacja kliencka po boot) pokazuje wszystko od razu.
 * `ready` to mapa gotowości od wywołującego (dane z query, zdjęcia onLoad itp.).
 */
export function useBootSequence<T extends string>(
	stages: readonly T[],
	ready: Record<T, boolean>,
): Record<T, boolean> {
	const settled = useBootSettled();
	return useMemo(() => {
		if (!settled) {
			const hidden = {} as Record<T, boolean>;
			for (const stage of stages) hidden[stage] = false;
			return hidden;
		}
		return revealStages(stages, ready);
	}, [settled, stages, ready]);
}
