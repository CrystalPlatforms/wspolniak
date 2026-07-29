// SPDX-License-Identifier: AGPL-3.0-or-later
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { highlightMentions } from "./mentions-text";

/**
 * Post-only Markdown renderer (deep module).
 *
 * One string in (`text`) → formatted, safe React elements out.
 * Hides all `react-markdown` configuration: GFM, line-break behaviour
 * (`remark-breaks` → a single Enter is a `<br>`), link safety, raw-HTML
 * suppression, and `@mention` highlighting.
 *
 * Safety: no `rehype-raw` is used, so raw HTML in the source is never
 * rendered or executed. The default `urlTransform` neutralises dangerous
 * URL schemes (`javascript:` etc.).
 */

/** Minimal hast node shape this module mutates (kept local to avoid leaking the unified types). */
type HastNode = {
	type: string;
	value?: string;
	tagName?: string;
	properties?: { className?: string[] };
	children?: HastNode[];
};

const MENTION_CLASS = ["font-medium", "text-primary"] as const;

/**
 * Split a text value into text + styled mention spans, reusing the shared
 * mention detector (handles emails, hyphenated names, Polish characters).
 */
function splitMentions(value: string): HastNode[] {
	return highlightMentions(value).map((segment) =>
		segment.isMention
			? {
					type: "element",
					tagName: "span",
					properties: { className: [...MENTION_CLASS] },
					children: [{ type: "text", value: segment.text }],
				}
			: { type: "text", value: segment.text },
	);
}

/** Recursively wrap `@name` occurrences in styled spans. */
function highlightMentionsInTree(children: HastNode[]): void {
	for (let i = 0; i < children.length; i++) {
		const node = children[i];
		if (!node) continue;
		if (node.type === "text" && node.value) {
			const replaced = splitMentions(node.value);
			if (replaced.some((n) => n.type === "element")) {
				children.splice(i, 1, ...replaced);
				i += replaced.length - 1; // skip the inserted nodes — their inner text is the mention itself
			}
		} else if (node.type === "element" && node.children) {
			highlightMentionsInTree(node.children);
		}
	}
}

/** Rehype plugin: highlights `@mentions` as styled `<span>`s. */
function rehypeMentions() {
	return (tree: HastNode) => {
		if (tree.children) highlightMentionsInTree(tree.children);
	};
}

export function MarkdownText({ text, className }: { text: string | null; className?: string }) {
	if (!text) return null;
	return (
		<div className={className}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkBreaks]}
				rehypePlugins={[rehypeMentions]}
				components={{
					// Links open in a new tab with a safe rel (defense in depth on top of urlTransform),
					// styled in the brand primary color (matches @mentions) so they read as links.
					a: ({ node: _node, ...props }) => (
						<a
							{...props}
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
						/>
					),
					// Tailwind preflight flattens headings (inherit size/weight) and strips
					// list markers (list-style:none, padding:0). Restore visual hierarchy so
					// block formatting authored via the toolbar actually reads as such.
					h1: ({ node: _node, ...props }) => (
						<h1 {...props} className="mb-1 mt-3 text-2xl font-bold text-foreground" />
					),
					h2: ({ node: _node, ...props }) => (
						<h2 {...props} className="mb-1 mt-3 text-xl font-semibold text-foreground" />
					),
					h3: ({ node: _node, ...props }) => (
						<h3 {...props} className="mb-1 mt-2 text-lg font-semibold text-foreground" />
					),
					ul: ({ node: _node, ...props }) => (
						<ul {...props} className="my-2 list-disc space-y-1 pl-5" />
					),
					ol: ({ node: _node, ...props }) => (
						<ol {...props} className="my-2 list-decimal space-y-1 pl-5" />
					),
					li: ({ node: _node, ...props }) => (
						<li {...props} className="marker:text-muted-foreground" />
					),
					p: ({ node: _node, ...props }) => <p {...props} className="mb-2 last:mb-0" />,
				}}
			>
				{text}
			</ReactMarkdown>
		</div>
	);
}
