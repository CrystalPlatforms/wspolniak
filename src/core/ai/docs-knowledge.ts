// SPDX-License-Identifier: AGPL-3.0-or-later

import { DOC_DEPARTMENT_META } from "@/docs/departments";
import { docsOrigin, docsPromptHref } from "@/docs/host";
import { DOC_DEPARTMENTS, listDocs, searchDocs } from "@/docs/registry";

/**
 * RAG-lite dla docsów (F7 #210): przed każdym wywołaniem Groqa szukamy w
 * registry docsów (keyword/substring scoring po tytułach i treści, PL i EN)
 * i doklejamy najtrafniejsze fragmenty do system promptu AL, z tytułem oraz
 * URL-em dokumentu, żeby AL mógł cytować i linkować dokumentację. Bez
 * embeddings i tool-callingu (odrzucone w PRD #202). Kuratorowana wiedza
 * (knowledge.ts) zostaje bez zmian; blok wchodzi między wiedzę a posty.
 */

/** Limity RAG-lite: top 3 dokumenty, próg trafności, fragment ≤ 500 znaków. */
const DOCS_SEARCH_LIMIT = 3;
const DOCS_MIN_TOP_SCORE = 6;
const DOCS_FRAGMENT_MAX_LENGTH = 700;

/**
 * Stopwords PL/EN — wygwazdane wyrazy, które substring-matching robiłby
 * fałszywymi trafieniami w każdej dokumentacji. Dochodzą słowa-aplikacyjne
 * (nazwa apki, "aplikacji"), które pasowałyby wszędzie i nic nie wnosiły.
 * Tokeny krótsze niż 3 znaki odsiewa filtr długości, więc w zbiorze są tylko >= 3.
 */
/** Formy żródłowe stopwords (mieszane zapisy z/bez diakrytyków); zbiór
 * budujemy po stripowaniu diakrytyków, żeby "wspólniak" i "wspolniak"
 * filtrowały się tak samo. */
function stripDiacritics(word: string): string {
	return word.normalize("NFD").replace(/\p{M}/gu, "");
}

const DOCS_STOP_WORD_SOURCE: readonly string[] = [
	"aby",
	"ale",
	"albo",
	"ani",
	"czy",
	"czyli",
	"dla",
	"gdy",
	"gdzie",
	"jego",
	"jej",
	"jak",
	"jaka",
	"jaki",
	"jakie",
	"jako",
	"jest",
	"jestem",
	"jeszcze",
	"jeśli",
	"już",
	"kiedy",
	"kto",
	"ktora",
	"ktore",
	"ktory",
	"ktorzy",
	"lub",
	"mam",
	"mniej",
	"mnie",
	"mozna",
	"nam",
	"nasz",
	"nawet",
	"nic",
	"nie",
	"nim",
	"niz",
	"oraz",
	"oto",
	"pod",
	"ponad",
	"poniewaz",
	"poza",
	"przed",
	"przez",
	"przy",
	"raz",
	"siedem",
	"sie",
	"sobie",
	"tak",
	"takie",
	"tam",
	"tego",
	"tej",
	"ten",
	"teraz",
	"tez",
	"tym",
	"tych",
	"tylko",
	"wszystko",
	"zeby",
	"the",
	"and",
	"was",
	"were",
	"been",
	"how",
	"what",
	"why",
	"when",
	"where",
	"who",
	"can",
	"could",
	"should",
	"would",
	"does",
	"did",
	"you",
	"our",
	"this",
	"that",
	"these",
	"those",
	"please",
	"help",
	"with",
	"not",
	"aplikacja",
	"aplikacji",
	"aplikacje",
	"wspolniak",
	"wspólniak",
	"ile",
	"moge",
	"mozesz",
	"chce",
	"bedzie",
];

const DOCS_STOP_WORDS = new Set(DOCS_STOP_WORD_SOURCE.map((word) => stripDiacritics(word)));

/** Tokeny zapytania do szukania docsów: małe litery, bez interpunkcji,
 * bez stopwords (także bez diakrytykow — "wspolniak" filtruje tak samo),
 * minimum 3 znaki, z lekkim stemowaniem koncowek. */
function docsSearchTokens(query: string): string[] {
	return query
		.toLowerCase()
		.split(/\s+/)
		.map((token) => stripDiacritics(token.replace(/[^\p{L}\p{N}]/gu, "")))
		.filter((token) => token.length >= 3 && !DOCS_STOP_WORDS.has(token))
		.map((token) => stemDocToken(token));
}

/** Lekki stem dla polskiej/angielskiej fleksji: obciecie 1-2 koncowych znakow
 * (dluzsze niz 5 znakow: 2, piecioznakowe: 1, krotsze bez zmian). Reszte robi
 * substring-matching: "zdjecie"->"zdjec" trafia w "zdjec" i "zdjecia",
 * "dodac"->"doda" w "dodasz", "posta"->"post" w "postow". */
function stemDocToken(token: string): string {
	if (token.length > 5) return token.slice(0, -2);
	if (token.length === 5) return token.slice(0, -1);
	return token;
}

interface DocsSection {
	heading: string;
	body: string;
}

/** Sekcje dokumentu: naglowek ## + tresc; czesc przed pierwszym naglowkiem
 * to wstep (heading ""). */
function docSections(content: string): DocsSection[] {
	return content.split(/\n(?=## )/).map((part) => {
		const [firstLine, ...rest] = part.split("\n");
		const heading = (firstLine ?? "").replace(/^#+\s*/, "").trim();
		return { heading, body: rest.join("\n").trim() };
	});
}

/** Najtrafniejsza sekcja dokumentu (albo poczatek dokumentu, gdy zadna sekcja
 * nie pasuje), przycieta do DOCS_FRAGMENT_MAX_LENGTH. */
function docFragment(content: string, tokens: string[]): string {
	// Sekcje punktowane jak dokumenty w searchDocs: trafienie w naglowek +10 —
	// sekcja "Zdjecia — limity" musi wygrywac ze wstepem, ktory powtarza slowa
	// z pytania, ale nie ma zadnych liczb. W tresci punkty jak w registry: +1.
	const scored = docSections(content)
		.map((section) => {
			const heading = stripDiacritics(section.heading.toLowerCase());
			const body = stripDiacritics(section.body.toLowerCase());
			let score = 0;
			for (const token of tokens) {
				if (heading.includes(token)) score += 10;
				if (body.includes(token)) score += 1;
			}
			return { section, score };
		})
		.sort((a, b) => b.score - a.score);
	const top = scored.filter((entry) => entry.score > 0).slice(0, 2);
	if (top.length === 0) {
		return capFragment(content);
	}
	const text = top
		.map((entry) =>
			entry.section.heading
				? `${entry.section.heading} — ${entry.section.body}`
				: entry.section.body,
		)
		.join("\n");
	return capFragment(text);
}

function capFragment(text: string): string {
	return text.length > DOCS_FRAGMENT_MAX_LENGTH
		? `${text.slice(0, DOCS_FRAGMENT_MAX_LENGTH)}...`
		: text;
}

/**
 * Blok dokumentacji do system promptu (F7 #210) — pusty string, gdy zapytanie
 * nie pasuje do zadnego dokumentu albo najlepiej punktujacy dokument jest
 * ponizej progu trafnosci (ochrona przed doklejaniem przypadkowych tresci).
 */
export function docsKnowledgeBlock(query: string, appOrigin: string): string {
	const tokens = docsSearchTokens(query);
	if (tokens.length === 0) return "";
	const results = searchDocs(tokens.join(" "), DOCS_SEARCH_LIMIT);
	if (results.length === 0 || (results[0]?.score ?? 0) < DOCS_MIN_TOP_SCORE) {
		return "";
	}
	const entries = results.map((result) => {
		const url = docsPromptHref(appOrigin, `/${result.doc.department}/${result.doc.slug}`);
		return `- **${result.doc.title}** (${url}): "${docFragment(result.doc.content, tokens)}"`;
	});
	return [
		"",
		"",
		"## Dokumentacja Wspólniaka",
		"Pytanie dotyczy funkcji aplikacji — poniżej najtrafniejsze fragmenty dokumentacji. Cytuj je i podawaj link do pełnego dokumentu jako klikalny Markdown [tytuł](pełny URL), gdy user może chcieć przeczytać więcej:",
		...entries,
	].join("\n");
}

/**
 * Sekcja "brak trafien" (HITL #210): gdy zapytanie nie pasuje do zadnego
 * dokumentu, AL i tak dostaje sekcje docsow — z instrukcja, by NIGDY nie
 * mowil, ze "nie ma dostepu" do dokumentacji, tylko uczciwie "nie znalazlem"
 * + klikalny link do calej dokumentacji (absolutny na subdomenie docs.*).
 */
export function docsNoMatchBlock(appOrigin: string): string {
	const landing = `${docsOrigin(appOrigin)}/`;
	const index = DOC_DEPARTMENTS.map((department) => {
		const label = DOC_DEPARTMENT_META.find((meta) => meta.key === department)?.label ?? department;
		const lines = listDocs(department).map(
			(doc) => `- [${doc.title}](${docsPromptHref(appOrigin, `/${doc.department}/${doc.slug}`)})`,
		);
		return `${label}:\n${lines.join("\n")}`;
	});
	return [
		"",
		"",
		"## Dokumentacja Wspólniaka",
		`Nie znalazłeś w tym zapytaniu pasującego fragmentu, ale masz pełną listę artykułów dokumentacji. Jeśli user pyta o funkcje aplikacji albo prosi o dokumentację lub artykuł, wskaż najbliższy tematowi artykuł z listy i podaj jego link jako klikalny Markdown. NIGDY nie mów, że „nie masz dostępu" do dokumentacji — dostęp masz, tylko teraz nie było trafienia w treść. Gdy rozmowa dotyczy postów albo jest luźną pogaduchą, pomijaj ten temat. Cała dokumentacja: [Dokumentacja Wspólniaka](${landing}).`,
		"",
		...index,
	].join("\n");
}
