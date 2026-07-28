# Plan: Markdown Formatting in Posts

> Source PRD: [`plans/markdown-posts-prd.md`](./markdown-posts-prd.md) (issue #109)

## Architectural decisions

Durable decisions that apply across all phases:

- **Architecture style**: Frontend-only feature. No API, schema, or database-migration changes. The existing TanStack Start (SSR) + Hono backend is untouched; `posts.description` continues to flow through the existing endpoints unchanged.
- **Data model**: The existing `posts.description` column (`text`, max 2000 chars) now stores raw Markdown (`.md`) source. No new tables, columns, or entities. Plain text is valid Markdown, so historical posts keep rendering unchanged.
- **Rendering stack**: `react-markdown` + `remark-gfm`. Safe by default — no raw HTML is rendered (no `rehype-raw`), the default URL transform neutralizes dangerous schemes (`javascript:` etc.), links open in a new tab with `rel="noopener noreferrer"`, and `breaks: true` makes a single Enter a line break.
- **Deep modules**: `MarkdownText` (a post-only renderer) and `applyMarkdown` (pure, DOM-free formatting logic). Comments keep the existing plain-text renderer.
- **Scope boundary**: The formatting toolbar and preview are post-only (live in the create and edit post composers). The shared comment input stays plain text — the toolbar is opt-in for posts, never added to the comment path.
- **Validation**: TDD unit tests for `MarkdownText` and `applyMarkdown` (the two deep modules). The preview toggle and screen-by-screen integration are verified manually on production by the owner.

---

## Phase 1: Safe Markdown rendering (read path)

**User stories**: 12, 14, 15, 17, 18, 19 (and the display side of 1–7).

### What to build

A post-only Markdown renderer that turns the raw `.md` stored in a post's description into formatted, safe HTML, wired into every place a post description is displayed — the feed card, the post detail page, and the public shared-post view. The renderer is configured for safety (no raw HTML, dangerous URL schemes neutralized, links open in a new tab) and for continuity (a single Enter becomes a line break, so old posts look the same). `@mentions` stay highlighted inside the rendered text. Add the markdown rendering dependencies. No editor yet — Markdown typed by hand into the existing description field already renders after this phase.

### Acceptance criteria

- [ ] A post whose description contains Markdown (e.g. manually typed `**bold**`) renders formatted in the feed and on the detail page
- [ ] The public shared-post view renders the same Markdown
- [ ] Raw HTML in a description (`<script>`, `<img onerror>`, …) is **not** rendered or executed
- [ ] A `javascript:` link is neutralized (not a clickable script)
- [ ] Rendered links open in a new tab with `rel="noopener noreferrer"`
- [ ] A single Enter in the source renders as a line break (`breaks: true`)
- [ ] `@mentions` are highlighted inside rendered Markdown
- [ ] Existing plain-text posts render unchanged (no visual regression)
- [ ] An empty / null description renders nothing and throws no error
- [ ] Unit tests cover renderer output for bold / italic / strikethrough / headings / lists / links / breaks / mentions, plus the raw-HTML and `javascript:` safety cases

---

## Phase 2: Inline formatting toolbar (bold / italic / strikethrough)

**User stories**: 1, 2, 7, 8, 9, 20.

### What to build

The write path begins. A pure formatting module transforms editor state (current text + selection + an action) into new text + selection, with **no DOM access**. The first actions are the inline toggles — bold, italic, strikethrough — which wrap a selection in the right markers, insert empty markers at the cursor when nothing is selected, and unwrap when the selection is already wrapped. A formatting toolbar with **B / I / S** buttons is added to the post composer (create); each button applies its action to the textarea selection and writes the result back. Because the Phase 1 renderer already displays Markdown, the user can now format text with buttons and see the result after publishing. The toolbar is post-only — the shared comment input is unaffected and stays plain text.

### Acceptance criteria

- [ ] Selecting a word and clicking **B** wraps it in `**` and leaves the selection inside the markers
- [ ] Clicking **B** with no selection inserts `**` and places the cursor between them
- [ ] Clicking **B** on already-bold text removes the `**` (toggle off)
- [ ] **I** and **S** (italic, strikethrough) follow the same wrap / insert / unwrap toggle rules with their markers
- [ ] The formatted description is saved as raw `.md` and renders correctly in the feed after publishing
- [ ] The comment input has no formatting toolbar (comments stay plain text)
- [ ] Unit tests cover each inline action (wrap / insert / unwrap) as pure functions

---

## Phase 3: Block formatting + links (headings / lists / link)

**User stories**: 3, 4, 5, 6 (and the block-toggle half of 20).

### What to build

Extend the formatting module with block actions — **H2**, **H3**, bullet list, numbered list — that prefix each selected line and toggle off when already prefixed, plus a **link** action that wraps a selection as `[selection](https://)` and selects the URL placeholder. Add the corresponding toolbar buttons. The Phase 1 renderer already displays all of these, so this phase is about creation; verify headings, lists, and links render correctly and that links remain safe (new tab, sanitized URL).

### Acceptance criteria

- [ ] **H2** prefixes the selected line(s) with `## `; applying again removes it (toggle)
- [ ] **H3** prefixes with `### ` (toggle)
- [ ] Bullet list prefixes each selected line with `- ` (toggle)
- [ ] Numbered list prefixes each selected line (toggle)
- [ ] Link wraps the selection as `[selection](https://)` and selects the URL placeholder
- [ ] Headings, lists, and links created via buttons render correctly after publishing
- [ ] Links created via the button still open in a new tab with safe `rel`
- [ ] Unit tests cover each block action and the link action as pure functions

---

## Phase 4: Preview + edit-post integration + mobile

**User stories**: 10, 11, 13, 16.

### What to build

A **"Podgląd"** toggle in the composer switches between the raw editor and a rendered preview (reusing the Phase 1 renderer), so the author can check formatting before publishing and switch back to edit. The toolbar + preview are wired into the edit-post composer, so editing a formatted post shows its Markdown source and preserves all formatting. The toolbar layout is made mobile-friendly (usable and not cut off on a phone).

### Acceptance criteria

- [ ] A "Podgląd" toggle switches the composer between editor and rendered preview, and back
- [ ] The preview accurately reflects the current unsaved Markdown
- [ ] Editing a formatted post preserves all formatting; the editor shows the Markdown source
- [ ] The formatting toolbar is usable on a phone-width screen (no cut-off buttons)
- [ ] (Manual) end-to-end check on production: create → preview → publish → edit → view shared link — formatting holds across all views

---

## Open implementation details

Non-durable choices left to `/dispatch` / `/tdd`:

- **Post-only toolbar mechanism**: opt-in prop on the shared input vs. a post-specific wrapper component. Either way, the comment path must remain toolbar-free.
- **Numbered-list emission**: literal `1. 2. 3.` vs. all `1.` (Markdown renders both as ordered).
- **Mobile toolbar layout**: wrap vs. horizontal scroll on narrow viewports.
- **`@mention` highlight inside Markdown**: exact mechanism (a custom remark/rehype step) — implementation detail of the `MarkdownText` deep module.

## Phase dependencies

Phase 1 is the foundation (the renderer); Phases 2–4 build the write path on top of it and depend on Phase 1 being merged. Phases 2 → 3 → 4 are sequential (each extends the same toolbar / composer).
