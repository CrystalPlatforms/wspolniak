// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Flagi funkcji instancji — plik lekki, bez importów drizzle/neon (issue #239).
 * Komponenty klienta importują stąd głęboką ścieżką (@/db/instance/feature-flags);
 * kod serwerowy może dalej używać beczki @/db/instance.
 */

export interface FeatureFlags {
	markdown: boolean;
	library: boolean;
	chat: boolean;
	albums: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
	markdown: true,
	library: true,
	chat: true,
	albums: true,
};
