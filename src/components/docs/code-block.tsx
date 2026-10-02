// SPDX-License-Identifier: AGPL-3.0-or-later
// Blok kodu docsów (F3 #206): przed hydratacją prosty stylowany <pre> (krótki błysk
// bez kolorów zaakceptowany w PRD); po hydratacji Shiki ładuje się dynamicznie tylko
// wtedy, gdy dokument w ogóle ma blok kodu. Motyw podświetlania podąża za motywem
// apki (useTheme → highlightCode), przełączenie motywu re-renderuje kolory.
import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { highlightCode, isShikiLang } from "@/docs/highlight";

interface CodeBlockProps {
	code: string;
	lang: string;
}

export function CodeBlock({ code, lang }: CodeBlockProps) {
	const { resolvedTheme } = useTheme();
	const [html, setHtml] = useState<string | null>(null);

	useEffect(() => {
		if (!isShikiLang(lang)) return undefined;
		let cancelled = false;
		highlightCode(code, lang, resolvedTheme === "dark" ? "dark" : "light")
			.then((result) => {
				if (!cancelled) setHtml(result);
			})
			.catch(() => {
				// Błąd podświetlania nie może wywalić strony — zostaje prosty <pre>.
			});
		return () => {
			cancelled = true;
		};
	}, [code, lang, resolvedTheme]);

	return (
		<div className="overflow-x-auto rounded-lg border border-border bg-muted/50">
			{html ? (
				<div
					className="text-sm [&_pre]:m-0 [&_pre]:bg-transparent [&_pre]:p-4 [&_pre]:font-mono [&_pre]:leading-relaxed"
					// Shiki zwraca wygenerowany HTML podświetlania (nie user input) — React
					// wymaga tu raw ustawienia.
					// biome-ignore lint/security/noDangerouslySetInnerHtml: wyjście biblioteki Shiki
					dangerouslySetInnerHTML={{ __html: html }}
				/>
			) : (
				<pre className="p-4 font-mono text-sm leading-relaxed text-foreground">
					<code>{code}</code>
				</pre>
			)}
		</div>
	);
}
