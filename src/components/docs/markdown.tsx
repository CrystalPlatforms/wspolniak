// SPDX-License-Identifier: AGPL-3.0-or-later
// Współdzielony renderer Markdown docsów (F2 #205): nagłówki ze stabilnymi anchor
// id i klikalnymi kotwicami, callouty (blockquote w języku wizualnym big-photo),
// tabele GFM, listy, linki (wewnętrzne przez router Link), obrazy. Content-agnostic.
import { Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import type * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";

/** Slug z nagłówka: PL diakrytyki → ASCII (ą→a, ł→l), spacje → myślniki. */
export function slugifyHeading(text: string): string {
	const withoutDiacritics = text
		.toLowerCase()
		.replace(/ł/g, "l")
		.normalize("NFD")
		.replace(/\p{M}/gu, "");
	return (
		withoutDiacritics
			.replace(/[^a-z0-9\s-]/g, "")
			.trim()
			.replace(/\s+/g, "-") || "sekcja"
	);
}

/** Płaski tekst z ReactNode (nagłówki mają zwykle sam tekst + ewentualny inline code). */
function extractText(node: React.ReactNode): string {
	if (typeof node === "string") return node;
	if (typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(extractText).join("");
	if (node && typeof node === "object" && "props" in node) {
		const element = node as React.ReactElement<{ children?: React.ReactNode }>;
		return extractText(element.props.children);
	}
	return "";
}

function isInternalHref(href: string): boolean {
	return href.startsWith("/") && !href.startsWith("//");
}

/** Stabilny id nagłówka z deduplikacją duplikatów (foo, foo-1, foo-2). */
function allocateId(usedIds: Map<string, number>, children: React.ReactNode): string {
	const base = slugifyHeading(extractText(children));
	const seen = usedIds.get(base) ?? 0;
	usedIds.set(base, seen + 1);
	return seen === 0 ? base : `${base}-${seen}`;
}

/** Język wizualny big-photo: callout = aside z ikoną Info i tekstem muted. */
function Callout({ children }: { children: React.ReactNode }) {
	return (
		<aside className="flex gap-3 rounded-lg border border-border bg-muted/50 p-4">
			<Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
			<div className="min-w-0 space-y-1 text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground">
				{children}
			</div>
		</aside>
	);
}

const HEADING_CLASSES: Record<1 | 2 | 3 | 4, string> = {
	1: "mt-10 border-b border-border pb-2 text-lg font-semibold",
	2: "mt-10 border-b border-border pb-2 text-lg font-semibold",
	3: "mt-8 font-medium",
	4: "mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground",
};

interface HeadingLinkProps {
	id: string;
	level: 1 | 2 | 3 | 4;
	children: React.ReactNode;
}

function HeadingLink({ id, level, children }: HeadingLinkProps) {
	const Tag = `h${level}` as "h2";
	return (
		<Tag id={id} className={HEADING_CLASSES[level]}>
			<a
				href={`#${id}`}
				className="-mx-1 -my-0.5 rounded px-1 py-0.5 transition-colors hover:text-primary"
			>
				<span
					aria-hidden
					className="mr-2 font-mono text-sm text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
				>
					#
				</span>
				{children}
			</a>
		</Tag>
	);
}

function heading(level: 1 | 2 | 3 | 4, usedIds: Map<string, number>): Components["h2"] {
	return function Heading({ children }) {
		return (
			<HeadingLink id={allocateId(usedIds, children)} level={level}>
				{children}
			</HeadingLink>
		);
	};
}

function createComponents(usedIds: Map<string, number>): Components {
	return {
		h1: heading(1, usedIds),
		h2: heading(2, usedIds),
		h3: heading(3, usedIds),
		h4: heading(4, usedIds),
		p: ({ children }) => <p className="leading-relaxed text-muted-foreground">{children}</p>,
		strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
		a: ({ href, children }) => {
			const target = href ?? "";
			const linkClasses = "font-medium text-primary underline-offset-4 hover:underline";
			if (isInternalHref(target)) {
				return (
					<Link to={target as never} className={linkClasses}>
						{children}
					</Link>
				);
			}
			return (
				<a href={target} target="_blank" rel="noopener noreferrer" className={linkClasses}>
					{children}
				</a>
			);
		},
		ul: ({ children }) => (
			<ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-muted-foreground">
				{children}
			</ul>
		),
		ol: ({ children }) => (
			<ol className="list-decimal space-y-1.5 pl-5 leading-relaxed text-muted-foreground">
				{children}
			</ol>
		),
		li: ({ children }) => <li className="[&>p]:my-0.5 [&_ul]:mt-1.5">{children}</li>,
		blockquote: ({ children }) => <Callout>{children}</Callout>,
		code: ({ children }) => {
			// Inline code (bloki kodu obsługuje `pre`, które wyciąga surowy tekst).
			const text = String(children ?? "").replace(/\n$/, "");
			return (
				<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
					{text}
				</code>
			);
		},
		pre: ({ children }) => {
			const { code, lang } = extractCodeBlock(children);
			return <CodeBlock code={code} lang={lang} />;
		},
		table: ({ children }) => (
			<div className="overflow-x-auto rounded-lg border border-border">
				<table className="w-full caption-bottom text-sm">{children}</table>
			</div>
		),
		thead: ({ children }) => <thead className="[&_tr]:border-b">{children}</thead>,
		th: ({ children }) => (
			<th className="h-10 px-3 text-left align-middle font-semibold text-foreground">{children}</th>
		),
		tr: ({ children }) => (
			<tr className="border-b border-border transition-colors last:border-0 hover:bg-muted/30">
				{children}
			</tr>
		),
		td: ({ children }) => (
			<td className="p-3 align-middle leading-relaxed text-muted-foreground">{children}</td>
		),
		img: ({ src, alt }) => (
			<img
				src={typeof src === "string" ? src : undefined}
				alt={alt ?? ""}
				loading="lazy"
				className="rounded-lg border border-border"
			/>
		),
		hr: () => <hr className="border-border" />,
	};
}

/** Wyciąga surowy kod i język z dziecka <code> elementu `pre`. */
function extractCodeBlock(children: React.ReactNode): { code: string; lang: string } {
	const candidates = Array.isArray(children) ? children : [children];
	const codeEl = candidates.find(
		(child): child is React.ReactElement<{ className?: string; children?: React.ReactNode }> =>
			!!child && typeof child === "object" && "props" in child,
	);
	const props = codeEl?.props ?? {};
	const lang = /language-([\w-]+)/.exec(props.className ?? "")?.[1] ?? "";
	const code = extractText(props.children).replace(/\n$/, "");
	return { code, lang };
}

interface DocsMarkdownProps {
	content: string;
}

export function DocsMarkdown({ content }: DocsMarkdownProps) {
	// Świeża Mapa na każdy render — id nagłówków są stabilne między renderami.
	const usedIds = new Map<string, number>();
	return (
		<div className="space-y-4">
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={createComponents(usedIds)}>
				{content}
			</ReactMarkdown>
		</div>
	);
}
