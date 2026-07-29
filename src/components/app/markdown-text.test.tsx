// SPDX-License-Identifier: AGPL-3.0-or-later
import { cleanup, render } from "@testing-library/react";
import { MarkdownText } from "./markdown-text";

afterEach(() => {
	cleanup();
});

describe("MarkdownText", () => {
	it("renders plain text inside a paragraph", () => {
		const { container } = render(<MarkdownText text="Witaj" />);
		expect(container.querySelector("p")?.textContent).toBe("Witaj");
	});

	it("renders **bold** as <strong>", () => {
		const { container } = render(<MarkdownText text="**ważne**" />);
		expect(container.querySelector("strong")?.textContent).toBe("ważne");
	});

	it("renders *italic* as <em>", () => {
		const { container } = render(<MarkdownText text="*pochyłe*" />);
		expect(container.querySelector("em")?.textContent).toBe("pochyłe");
	});

	it("renders ~~strike~~ as <del> via remark-gfm", () => {
		const { container } = render(<MarkdownText text="~~skreślone~~" />);
		expect(container.querySelector("del")?.textContent).toBe("skreślone");
	});

	it("renders # heading as <h1>", () => {
		const { container } = render(<MarkdownText text="# Tytuł" />);
		expect(container.querySelector("h1")?.textContent).toBe("Tytuł");
	});

	it("styles # heading so it is visually distinct (the largest, bold)", () => {
		const { container } = render(<MarkdownText text="# Tytuł" />);
		expect(container.querySelector("h1")?.getAttribute("class")).toContain("font-bold");
	});

	it("renders ## heading as <h2>", () => {
		const { container } = render(<MarkdownText text="## Tytuł" />);
		expect(container.querySelector("h2")?.textContent).toBe("Tytuł");
	});

	it("renders ### heading as <h3>", () => {
		const { container } = render(<MarkdownText text="### Podtytuł" />);
		expect(container.querySelector("h3")?.textContent).toBe("Podtytuł");
	});

	it("styles ## heading so it is visually distinct (not flattened by Tailwind preflight)", () => {
		const { container } = render(<MarkdownText text="## Tytuł" />);
		expect(container.querySelector("h2")?.getAttribute("class")).toContain("font-semibold");
	});

	it("styles ### heading so it is visually distinct", () => {
		const { container } = render(<MarkdownText text="### Podtytuł" />);
		expect(container.querySelector("h3")?.getAttribute("class")).toContain("font-semibold");
	});

	it("renders a bullet list as <ul> with <li> items", () => {
		const { container } = render(<MarkdownText text={"- jabłko\n- gruszka"} />);
		expect(container.querySelectorAll("ul li")).toHaveLength(2);
	});

	it("renders a numbered list as <ol> with <li> items", () => {
		const { container } = render(<MarkdownText text={"1. raz\n2. dwa"} />);
		expect(container.querySelectorAll("ol li")).toHaveLength(2);
	});

	it("shows bullet markers on a list (list-disc, not reset by preflight)", () => {
		const { container } = render(<MarkdownText text={"- jabłko\n- gruszka"} />);
		expect(container.querySelector("ul")?.getAttribute("class")).toContain("list-disc");
	});

	it("shows number markers on an ordered list (list-decimal)", () => {
		const { container } = render(<MarkdownText text={"1. raz\n2. dwa"} />);
		expect(container.querySelector("ol")?.getAttribute("class")).toContain("list-decimal");
	});

	it("renders links with target=_blank and a safe rel (noopener noreferrer)", () => {
		const { container } = render(<MarkdownText text="[link](https://example.com)" />);
		const anchor = container.querySelector("a");
		expect(anchor?.getAttribute("href")?.startsWith("https://example.com")).toBe(true);
		expect(anchor?.getAttribute("target")).toBe("_blank");
		expect(anchor?.getAttribute("rel")).toContain("noopener");
		expect(anchor?.getAttribute("rel")).toContain("noreferrer");
	});

	it("renders links in the brand primary color so they read as links", () => {
		const { container } = render(<MarkdownText text="[link](https://example.com)" />);
		const anchor = container.querySelector("a");
		expect(anchor?.getAttribute("class")).toContain("text-primary");
	});

	it("does not render or execute raw HTML (no <script> element)", () => {
		const { container } = render(<MarkdownText text={"<script>alert(1)</script>"} />);
		expect(container.querySelector("script")).toBeNull();
	});

	it("neutralises a javascript: link (not a clickable script URL)", () => {
		const { container } = render(<MarkdownText text="[x](javascript:alert(1))" />);
		const anchor = container.querySelector("a");
		expect(anchor?.getAttribute("href")?.toLowerCase()).not.toContain("javascript:");
	});

	it("renders a single newline as a <br> (breaks: true)", () => {
		const { container } = render(<MarkdownText text={"linia1\nlinia2"} />);
		expect(container.querySelector("br")).not.toBeNull();
	});

	it("highlights @mentions with a styled span inside Markdown", () => {
		const { container } = render(<MarkdownText text="Cześć @Ania" />);
		const mention = container.querySelector("span.text-primary");
		expect(mention?.textContent).toBe("@Ania");
	});

	it("renders nothing for an empty string without error", () => {
		const { container } = render(<MarkdownText text="" />);
		expect(container.textContent).toBe("");
	});

	it("renders nothing for null without error", () => {
		const { container } = render(<MarkdownText text={null} />);
		expect(container.textContent).toBe("");
	});
});
