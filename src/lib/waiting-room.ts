// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * „Poczekalnia" plików (Android Wrapper F1, #220): wąski pomost między źródłem
 * plików a kompozytorem `/app/new`. Dziś jedynym źródłem są testy; w F3 ten sam
 * `putPendingFiles` woła mostek Androida (udostępnione pliki trafiają tutaj,
 * zanim kompozytor zdąży się zamontować). PWA użytkownicy nigdy niczego nie
 * widzą — bez put poczekalnia jest pusta.
 *
 * Stan wyłącznie w pamięci procesu (modułowy singleton): refresh strony go
 * traci — zgodnie z decyzją PRD o braku draft protection. Nowy wkład ZASTĘPUJE
 * poprzedni („późniejszy intake wygrywa"), a odbiór przez kompozytor czyści
 * poczekalnię — pliki znikają z niej z chwilą pokazania ich w formie.
 */

let pendingFiles: File[] = [];

/** Wkłada pliki do poczekalni, zastępując wcześniejszy (nieodebrany) wkład. */
export function putPendingFiles(files: readonly File[]): void {
	pendingFiles = [...files];
}

/** Odbiera i czyści poczekalnię — kompozytor woła raz, przy montażu `/app/new`. */
export function takePendingFiles(): File[] {
	const files = pendingFiles;
	pendingFiles = [];
	return files;
}
