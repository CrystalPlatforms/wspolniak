// SPDX-License-Identifier: AGPL-3.0-or-later
// Hooki URL-i między hostami docs/apka: docsy i apka żyją na RÓŻNYCH hostach
// (docs.* vs główny host), a cookie sesji nie jest współdzielony — router Link
// zostawiłby usera na złym hoście bez sesji. Te hooki liczą pełny URL z originu
// bieżącej karty (useEffect po mount — bez hydration mismatch; przed mount
// zwracają ścieżkę relatywną).
import { useEffect, useState } from "react";
import { appOrigin, docsOrigin } from "./host";

/** Pełny URL ścieżki na GŁÓWNYM hoście apki (np. http://localhost:3000/app,
 *  https://wspolniak.com/app) — z docs hostów prowadzi poza subdomenę. */
export function useAppHref(path: string): string {
	const [href, setHref] = useState(path);
	useEffect(() => {
		setHref(`${appOrigin(window.location.origin)}${path}`);
	}, [path]);
	return href;
}

/** Pełny URL ścieżki na hoście DOCSÓW (np. https://docs.wspolniak.com/,
 *  http://docs.localhost:3000/) — z apki prowadzi na subdomenę docsów. */
export function useDocsHref(path = "/"): string {
	const [href, setHref] = useState(path);
	useEffect(() => {
		setHref(`${docsOrigin(window.location.origin)}${path}`);
	}, [path]);
	return href;
}
