# PRD: Markdown Formatting in Posts

## Overview

Family members can format the text of a post — bold, italic, headings, lists, links, strikethrough — using a toolbar of buttons above the description field, with a live "Preview" toggle. The description is stored as raw Markdown (`.md`) source and rendered to formatted HTML when displayed. The feature is scoped to posts only; comments remain plain text.

## Problem Statement

Today a post's description is plain text. The family cannot emphasize what matters — e.g. bold "**NEW DATE**", add a heading, or turn a packing list into bullets. Important information gets lost in a wall of uniform text. Family members are not technical and do not know Markdown syntax, so the formatting must be achievable with clickable buttons, not by typing symbols.

## Users

| User type | Description | Volume |
|-----------|-------------|--------|
| Family member | Writes and reads formatted posts | all instance users |
| Admin / owner | Same as above; also trusts that the public shared-post view is safe from HTML/script injection | 1 per instance |

## Goals & Success Criteria

- [ ] A family member can format text (bold, italic, H2/H3, bullet list, numbered list, link, strikethrough) using toolbar buttons, without typing Markdown
- [ ] A "Preview" toggle shows the rendered post before publishing, and the user can switch back to editing
- [ ] A formatted post renders identically in the feed, the post detail page, the edit screen, and the public shared-post view
- [ ] `@mentions` remain highlighted inside formatted text
- [ ] Existing plain-text posts render unchanged (no visual regression)
- [ ] Public/shared posts cannot inject HTML or scripts (safe by default)
- [ ] Links inside posts open in a new tab with safe `rel` attributes
- [ ] The toolbar is usable on a phone (mobile-first)
- [ ] No database migration is required

## User Stories

1. As a family member writing a post, I want to bold important words so they stand out (e.g. "**ATTENTION: new date**").
2. As a family member, I want to italicize words for emphasis.
3. As a family member, I want to add a heading so the post has a clear title.
4. As a family member, I want to make a bulleted list (e.g. a packing list or agenda).
5. As a family member, I want to make a numbered list (e.g. steps or a ranking).
6. As a family member, I want to add a clickable link (e.g. to an external album or a map).
7. As a family member, I want to strikethrough text (e.g. corrected information).
8. As a family member who does not know Markdown, I want formatting buttons so I never have to type symbols.
9. As a family member, I want to select a word, click **B**, and have it wrapped in bold automatically.
10. As a family member, I want a "Preview" button so I can see how the post will look before publishing.
11. As a family member, I want to toggle back to editing after previewing, to fix mistakes.
12. As a family member, I want my formatted post to look the same in the feed, on the detail page, and on the shared link.
13. As a post author, I want to edit a formatted post and keep all formatting — the editor shows my Markdown source.
14. As a family member, I want my old (plain-text) posts to look the same after this feature ships.
15. As a family member, I want `@mentions` to still be highlighted inside a formatted post.
16. As a family member on mobile, I want the formatting toolbar to be usable and not cut off on my phone.
17. As a family member, I want a single Enter press to produce a new line, the way I naturally type.
18. As an admin/owner, I want shared (public) posts to be safe — no malicious HTML or scripts can be injected through Markdown.
19. As a family member, I want links in posts to open safely in a new tab.
20. As a family member, I want clicking a formatting button again on already-formatted text to remove the formatting (toggle).

## Scope

### In scope

- A formatting toolbar above the post description field with buttons: **Bold**, *Italic*, H2, H3, Bullet list, Numbered list, Link, Strikethrough
- Buttons operate on the current selection in the textarea (wrap / prefix / toggle)
- A "Preview" toggle that switches the composer between raw edit and rendered preview
- A Markdown renderer component used wherever a post description is displayed (feed, detail, edit preview, public shared post)
- Storage of the description as raw Markdown source in the existing `description` column
- `@mention` highlighting preserved inside rendered Markdown
- Safe rendering: no raw HTML, neutralized dangerous URL schemes, links open in a new tab
- Backward compatibility: existing plain-text posts render unchanged
- Mobile-friendly toolbar layout

### Out of scope

- Markdown in comments (comments stay plain text)
- A "smaller text" / arbitrary font-size feature (no standard Markdown for it; raw HTML rejected)
- Image markdown (`![]()`) — images are handled separately via Cloudflare Images
- Tables, task lists, code blocks, and other Markdown features beyond the chosen set
- A split live-preview pane (edit and preview side by side)
- Migration of historical post content (none needed)
- Any database schema change

## System Components

```
[Browser — composer]
    │
    ├─► <FormattingToolbar>  ──uses──►  applyMarkdown(text, selection, action)
    │       Buttons call pure formatting functions                (pure, tested)
    │       Result written back into the textarea + selection
    │
    ├─► "Podgląd" toggle  ──renders──►  <MarkdownText text={description} />
    │
    └─► Submit  ──► posts.description = raw .md source  (unchanged API/validation)

[Storage]
    posts.description (text, max 2000 chars)
    Now holds raw Markdown source instead of plain text.
    Plain text is valid Markdown → existing rows stay valid. NO migration.

[Browser — post views]
    PostView, post detail, edit preview, shared-post
        └─► <MarkdownText text={post.description} />
                react-markdown + remark-gfm
                breaks: true        (single Enter = <br>)
                no raw HTML         (no rehype-raw)        → zero XSS surface
                default urlTransform (strips javascript: etc.)
                links: target=_blank, rel=noopener noreferrer
                custom remark step  → highlights @mentions
```

## Functional Components

Deep modules — small interfaces hiding large implementations. The risk-heavy logic lives behind two narrow boundaries; everything else is thin glue.

### `MarkdownText` — the renderer (deepest module)
Renders raw Markdown to formatted, safe React elements.
- Interface: `<MarkdownText text={string} className? />` (one string in, formatted output out)
- Hides: `react-markdown` configuration, `remark-gfm` (strikethrough, robust lists), the `breaks: true` option, the `@mention` highlighting step, the link-safety overrides, and the deliberate absence of raw-HTML support
- Used by: the post feed, post detail, the edit-screen preview, and the public shared-post view

### `applyMarkdown` — the formatting logic
Pure functions that transform the editor state.
- Interface: given `{ value, selectionStart, selectionEnd }` and an action, return the new `{ value, selectionStart, selectionEnd }`
- Actions: bold, italic, strikethrough (inline toggle), H2, H3, bullet list, numbered list (block prefix/toggle), link (wrap)
- Hides: all wrapping/prefixing/toggling rules, multi-line handling, cursor placement
- Pure (no DOM access) → fully unit-testable in isolation

### `<FormattingToolbar>` — thin UI
A row of buttons. Each button reads the textarea's current selection, calls `applyMarkdown`, and writes the result back. No business logic of its own.

### Composer preview mode
A `mode: 'edit' | 'preview'` state in the composer. In preview mode the textarea is replaced by `<MarkdownText text={description} />`. Thin wrapper over the renderer.

### Validation / schema
The existing Zod schema for `description` (`string().max(2000)`) is unchanged — it already accepts any string, and raw Markdown is just a string. Documented (not modified) as accepting `.md` source.

## Implementation Decisions

| Decision | Choice | Rationale |
|---------|--------|-----------|
| Markdown library | `react-markdown` + `remark-gfm` | Renders to React elements (no `dangerouslySetInnerHTML`) → no raw HTML rendered → zero XSS surface by default. `remark-gfm` adds strikethrough (`~~`) and robust list parsing |
| Storage | Raw `.md` source in the existing `description` column | Plain text is valid Markdown, so existing posts keep working; the field and its validation already exist → no migration |
| Character limit | 2000, unchanged | Stakeholder decision. Counted on the raw `.md` source; note that Markdown syntax slightly reduces visible-text capacity versus plain text |
| Headings | H2 and H3 only | H1 is too large for a post description in the feed |
| Line breaks | `breaks: true` (single Enter → `<br>`) | Matches the current `whitespace-pre-wrap` feel, so existing posts and natural typing look the same |
| `@mentions` | A custom remark step inside `MarkdownText` highlights `@name` visually | Push-notification userIds are still resolved at post-create time from the existing `mentions` list — the renderer only styles text, unchanged contract |
| Link safety | `target="_blank"`, `rel="noopener noreferrer"`; rely on react-markdown's default `urlTransform` | Defense in depth: `urlTransform` neutralizes `javascript:` and other dangerous schemes; safe-rel on the anchor |
| Raw HTML | Disallowed (no `rehype-raw`) | The only formatting surface is Markdown syntax; this is the primary XSS control on the public shared-post view |
| "Smaller text" | Not supported | No standard Markdown exists; stakeholder chose pure Markdown over allowing `<small>` HTML |
| Scope | Posts only | Comments stay plain text (shared renderer intentionally not reused for comments yet) |
| Database | No migration | Frontend-only feature |

## Validation Strategy

The project owner verifies on production manually, supplemented by automated unit tests for the two deep modules (`MarkdownText` rendering and `applyMarkdown` logic). No formal user testing. Per the stakeholder, formal acceptance criteria cover the renderer and the formatting logic; the preview toggle and screen-by-screen integration are verified informally.

## Validation Criteria

### `MarkdownText` renderer
- [ ] `**bold**` renders as bold (`<strong>`)
- [ ] `*italic*` renders as italic (`<em>`)
- [ ] `~~strike~~` renders as strikethrough (via `remark-gfm`)
- [ ] `## H2` and `### H3` render as headings
- [ ] `- item` renders as a bullet list; `1. item` as an ordered list
- [ ] `[text](url)` renders as a clickable link with `target="_blank"` and `rel="noopener noreferrer"`
- [ ] A single `\n` renders as a line break (`breaks: true`)
- [ ] `@name` is highlighted (styled span) inside Markdown content
- [ ] Raw HTML in the source (e.g. `<script>`, `<img onerror>`) is **not** rendered or executed
- [ ] A `javascript:` URL is neutralized (not usable as a clickable script link)
- [ ] Empty / null description renders nothing and throws no error

### `applyMarkdown` formatting logic
- [ ] Bold on a selection wraps it with `**` and leaves the selection inside the markers
- [ ] Bold with no selection inserts `**` markers and places the cursor between them
- [ ] Bold on already-`**wrapped**` text unwraps it (toggle off)
- [ ] Italic (`*`) and strikethrough (`~~`) follow the same toggle rules
- [ ] H2 prefixes the selected line(s) with `## `; applying again removes it (toggle)
- [ ] H3 prefixes with `### ` (toggle)
- [ ] Bullet list prefixes each selected line with `- ` (toggle)
- [ ] Numbered list prefixes each selected line (toggle)
- [ ] Link wraps the selection as `[selection](https://)` and selects the URL placeholder
- [ ] All functions are pure: identical input → identical output, no DOM access

## Open Questions

None material. Remaining items are implementation details for `/carve`:
- Numbered-list emission: literal `1. 2. 3.` vs. all `1.` (Markdown auto-numbers either way)
- Toolbar layout on narrow viewports: wrap vs. horizontal scroll
- Whether to surface an explicit "remove formatting" affordance beyond per-button toggling

## References

- Discovery summary: `/ask` session (2026-07-28) — resolved editor model (Markdown + toolbar vs. WYSIWYG), feature set, preview mode, and posts-only scope
- `react-markdown`: https://github.com/remarkjs/react-markdown
- `remark-gfm`: https://github.com/remarkjs/remark-gfm
- Existing mention highlighting: `highlightMentions` (shared by post descriptions and comments)
- Repo: https://github.com/CrystalGamesStudio/wspolniak
