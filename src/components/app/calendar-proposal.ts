// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Szablon „Zaproponuj datę" (#163 Kalendarz v2): imię wypełniane z sesji,
 * <data> i <opis> zostawione userowi do uzupełnienia w formularzu posta.
 */
export function calendarProposalTemplate(name: string): string {
	return `Witam, tu ${name}
I chciałem/ałam zaproponować nową datę do naszego Kalendarza:

<data> - To <opis>`;
}
