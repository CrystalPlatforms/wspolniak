// SPDX-License-Identifier: AGPL-3.0-or-later
import { lazy, Suspense } from "react";

/**
 * Lazy boundary wokół renderera markdown (issue #239).
 *
 * Chunk react-markdown (+ remark-gfm/breaks i tokenizer) to ~158 kB — leci do
 * klienta dopiero, gdy jest realnie potrzebny (post z opisem), zamiast z
 * feedem i każdym widokiem posta. Fallback null: SSR rozwiązuje lazy
 * serwerowo (opis jest w HTML od pierwszej klatki), a jsdom/klient doładowuje
 * w mikrotasku. Renderer żyje w markdown-text-impl.tsx (prywatna implementacja).
 */
const MarkdownTextImpl = lazy(() =>
	import("./markdown-text-impl").then((m) => ({ default: m.MarkdownTextImpl })),
);

export function MarkdownText({ text, className }: { text: string | null; className?: string }) {
	if (!text) return null;
	return (
		<Suspense fallback={null}>
			<MarkdownTextImpl text={text} className={className} />
		</Suspense>
	);
}
