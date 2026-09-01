// SPDX-License-Identifier: AGPL-3.0-or-later
import { useQuery } from "@tanstack/react-query";

export interface AiAccessState {
	master: boolean;
	aiOptIn: boolean;
	aiBlocked: boolean;
	effective: boolean;
}

/**
 * Stan dostępu do AL (F6 #184) — wspólny cache z Ustawieniami (ten sam
 * queryKey „ai/access"). `effective` steruje widocznością wejść do czatu
 * (sidebar, przycisk w nagłówku feeda) na desktopie i mobile.
 */
export function useAiAccess() {
	return useQuery({
		queryKey: ["ai", "access"],
		queryFn: async (): Promise<AiAccessState> => {
			const res = await fetch("/api/ai/access");
			if (!res.ok) throw new Error("Nie udało się pobrać ustawień AL");
			const json = (await res.json()) as { data: AiAccessState };
			return json.data;
		},
	});
}
