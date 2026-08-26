# Plan: Wspólniak Albums

> Source PRD: `plans/albums-prd.md` (GitHub umbrella issue #169). All 27 PRD user stories are
> distributed across Phases 1–7; Phase 8 is whole-feature verification and production rollout.
> UI copy stays Polish; docs in English per repo convention.

## Architectural decisions

Durable decisions that apply across all phases:

- **Architecture style**: existing app skeleton only — TanStack Start SSR frontend + Hono API on
  Cloudflare Workers + Neon PostgreSQL via Drizzle. No new services, no new workers.
- **Data model**: `albums` (id, creator, title ≤100 chars, nullable cover item ref, timestamps) +
  one polymorphic `album_items` table (kind ∈ {own image, post photo, video}, item reference,
  created_at). **No foreign keys** (repo convention) — all cascades live in application code.
  Ordering = `created_at` (order of adding; no position column). Unique (album, kind, reference)
  blocks duplicates. Hard cap: 500 items per album, enforced in the domain layer.
- **Key entities**: Album (shared instance-wide, creator-owned), AlbumItem (polymorphic), borrowed
  sources are existing entities (post photos, videos) — never copied, only referenced.
- **Authorization**: existing session middleware; every album mutation requires creator-or-admin;
  admin may mutate all albums. Read access: all signed-in members.
- **Integrations**: own photos via the existing Cloudflare Images pipeline (referenced by CF image
  id; ZIP export uses the largest JPEG variant); videos stay on YouTube (referenced by video row
  id; export is a links file only). New dependency: `client-zip` (streamed ZIP, store method).
- **Feature flag**: `albums_enabled` in instance settings, default true. OFF hides the menu item
  and every "Dodaj do albumu" button; album routes stay reachable by URL.
- **Naming**: UI label "Albumy", URL `/app/albums` — intentional label/path mismatch (same as
  Biblioteka/`/app/lib`); do not "fix" later.

---

## Phase 1: Core album — create, list, view

**User stories**: 1, 2, 3, 11, 12, 13

### What to build

The tracer bullet: a member creates an album (title + at least one photo of their own, uploaded
through the same multi-select + HEIC pipeline as the post composer), and immediately sees it as a
tile in the new "Albumy" section. Tiles show cover (first photo by default), title and photo count,
newest first. Opening an album shows its photos as a grid in order of adding; tapping a photo opens
the existing lightbox (zoom, swipe). The menu gains an "Albumy" entry. Album creation never touches
the feed. Includes the DB domain, dev migration, and Hono API for create/list/get.

### Assumptions carried in

- Existing auth/session guards on `/app/*` routes and API; no changes to login flow.
- The existing Cloudflare Images upload pipeline is reusable as-is for album uploads.
- Existing feed queries are untouched — an album simply is not a post.

### Out of scope for this phase

- Borrowing photos/videos from posts (Phase 2/3); management menu (Phase 4); downloads (Phase 6);
  the "new" dot and the feature flag (Phase 7 — nav always visible in this phase).

### Acceptance criteria

- [ ] Album is created with title + ≥1 own photo; empty title, >100-char title, or zero photos are
      rejected — [test: domain + API validation tests]
- [ ] A created album never appears in feed queries — [test: feed boundary test asserting exclusion]
- [ ] List returns tiles newest-first with cover, title and photo count — [test: domain list query]
- [ ] Detail grid renders items in add-order; tapping a photo opens the existing lightbox —
      [test: component interaction tests]
- [ ] "Albumy" nav entry renders for signed-in members — [test: nav component test]
- [ ] Dev migration applies cleanly — [command: `pnpm db:dev:migrate` exits 0]
- [ ] Quality gates green — [command: `pnpm types && pnpm test && pnpm lint`]

---

## Phase 2: Borrowing photos from posts

**User stories**: 4, 5, 7, 8, 9

### What to build

The shared "Add to album" component: a button + dialog reused across mount points. The dialog lists
the member's own albums (admins see all), and adding puts the photo into the chosen album. With no
owned album it shows "Nie masz albumów, musisz najpierw stworzyć" with a shortcut into the Phase 1
creation flow. Mount points: next to the download button in the lightbox (mobile and desktop) and
in the corner of each photo in the post view (desktop only — mobile uses the lightbox). Also the
"Dodaj zdjęcia" action in the album view to append more of the member's own photos to an existing
album. Duplicate (album, photo) adds are silently prevented.

### Assumptions carried in

- Phase 1 albums, creation dialog and domain exist; this phase only adds items to them.
- The lightbox and post view already render download buttons to anchor next to (verified in code).
- Authorization here is implicit (you add to *your* albums); explicit creator-or-admin enforcement
  on other mutations arrives in Phase 4.

### Out of scope for this phase

- Videos (Phase 3); renaming/covers/deletion (Phase 4); flag-gating the buttons (Phase 7).

### Acceptance criteria

- [ ] Button renders next to download controls in the lightbox on all platforms and in the
      post-view photo corner on desktop; it is absent from the mobile post view —
      [test: component tests per mount point]
- [ ] Dialog lists only the member's own albums; admin sees all — [test: component test]
- [ ] Empty state renders the "no albums" dialog with a working create shortcut —
      [test: component test]
- [ ] Adding the same post photo twice to one album is a silent no-op —
      [test: domain unique-constraint test]
- [ ] "Dodaj zdjęcia" appends own photos to an existing album — [test: domain + component test]
- [ ] Quality gates green — [command: `pnpm types && pnpm test && pnpm lint`]

---

## Phase 3: Videos in albums

**User stories**: 6, 14

### What to build

Albums accept video items borrowed from the video library and from posts: the "Add to album"
component gains the video kind, mounted on the video detail page and next to videos in the post
view. In the album grid a video renders as its thumbnail with a play affordance and links to the
video page (playback stays on YouTube). Album tiles and detail now show per-kind counts:
"X zdjęć · Y wideo" (video part hidden when zero).

### Assumptions carried in

- Phase 2's Add-to-album component is generic over item kind; videos domain already exposes id and
  thumbnail URL.

### Out of scope for this phase

- Video covers (rejected in PRD — covers are photos only); video files in downloads (Phase 6
  exports links only).

### Acceptance criteria

- [ ] A video can be added from the video detail page and from a post's video —
      [test: component tests per mount point]
- [ ] Video tile in the album grid links to the video page — [test: component test]
- [ ] Tiles show both counts; video part hidden at zero — [test: list query + component test]
- [ ] Duplicate video add is a no-op (same unique rule) — [test: domain test]
- [ ] Quality gates green — [command: `pnpm types && pnpm test && pnpm lint`]

---

## Phase 4: Management & permissions

**User stories**: 15, 16, 17, 18, 19, 20, 22, 23, 27

### What to build

The "⋯" menu on tiles and in the album view: rename, set cover (any photo in the album; videos
excluded), delete album. Item removal (creator/admin) takes an item out of the album without
touching the source post. Every mutation enforces creator-or-admin (admin passes everywhere).
Deleting an album deletes its own uploaded photos from Cloudflare Images and leaves borrowed items
untouched. The 500-item cap is enforced with a clear error.

### Assumptions carried in

- Phases 1–3 flows exist; the Cloudflare Images deletion helper from post deletion is reusable for
  album-owned photo cleanup.

### Out of scope for this phase

- Cascades triggered by *external* deletions (post/video removal — Phase 5); item reordering (out
  of scope per PRD).

### Acceptance criteria

- [ ] Rename / set cover / delete album / remove item by a non-creator non-admin is rejected —
      [test: API authorization tests]
- [ ] Admin succeeds on all mutations on any album — [test: API tests]
- [ ] Cover must reference a photo in that album; video covers rejected — [test: API validation]
- [ ] Album deletion returns exactly the own-upload image ids, they are removed from Cloudflare
      Images, and borrowed post photos are untouched — [test: domain test; observable: images gone
      from CF dashboard after HITL delete]
- [ ] Item removal leaves the source post intact — [test: domain test]
- [ ] The 501st item is rejected with a clear error — [test: domain test]
- [ ] Quality gates green — [command: `pnpm types && pnpm test && pnpm lint`]

---

## Phase 5: External cascades

**User stories**: 21

### What to build

Hooks into the existing post-deletion and video-deletion flows: when a post (or video) is deleted,
its borrowed items are removed from every album in the same operation. An album emptied by a
cascade persists and renders an empty state (no auto-delete of albums).

### Assumptions carried in

- Phase 4 item semantics; existing post/video delete endpoints are the only integration points.

### Out of scope for this phase

- Auto-deleting emptied albums; notifications (silent feature per PRD).

### Acceptance criteria

- [ ] Deleting a post removes its borrowed items from all albums while other items stay —
      [test: domain test driven through the post delete flow]
- [ ] Deleting a video does the same — [test: domain test]
- [ ] An album emptied by cascade still renders with an empty state — [test: component test]
- [ ] Quality gates green — [command: `pnpm types && pnpm test && pnpm lint`]

---

## Phase 6: Downloads

**User stories**: 24, 25

### What to build

Two download actions in the album view. "Pobierz zdjęcia (ZIP)": the Worker streams a ZIP built
from the largest JPEG variant of each photo (store method — JPEGs are already compressed, CPU stays
minimal). "Pobierz wideo": an HTML file with a Polish header and one clickable YouTube link per
video. Each button hides when there is nothing to download. File names derive from the album title.

### Assumptions carried in

- This phase is the designated verification of the PRD assumption that `client-zip` streams
  correctly inside a Worker for large albums (500 × ~3 MB). If Worker limits bite, the item cap or
  chunking changes first — nothing upstream.
- Cloudflare Images delivery URLs are server-fetchable with existing credentials.

### Out of scope for this phase

- Video files (impossible via API; R2 copies rejected in PRD); originals/HEIC; resumable downloads.

### Acceptance criteria

- [ ] ZIP endpoint returns a valid ZIP with one entry per photo and proper headers —
      [test: API test with fixture image URLs; observable: HITL unzip of a real album]
- [ ] Videos HTML contains a title + clickable link per video with a Polish header; button hidden
      when the album has no videos — [test: unit + component tests]
- [ ] Photos button hidden when the album has no photos — [test: component test]
- [ ] A large album streams within Worker CPU/duration limits — [observable: HITL download of a
      large fixture album on dev deploy]
- [ ] Quality gates green — [command: `pnpm types && pnpm test && pnpm lint`]

---

## Phase 7: Feature flag + "new" dot

**User stories**: 10, 26

### What to build

`albums_enabled` joins the instance feature flags (default true) with a switch in the admin panel's
"Funkcje" section. When off: the "Albumy" nav item disappears and every "Dodaj do albumu" button
vanishes; the `/app/albums` URL keeps working for anyone who has it. The nav dot: a per-device
localStorage timestamp marks albums as seen; the dot renders while any album is newer than the
stored timestamp and clears when the member enters the Albums section.

### Assumptions carried in

- The existing feature-flags read/caching pattern is extended with one column; Phase 2/3 mount
  points are the places to gate.

### Out of scope for this phase

- Account-wide "seen" state (rejected — per-device accepted); blocking routes (rejected by client).

### Acceptance criteria

- [ ] Flag off: nav item and Add-to-album buttons absent, `/app/albums` URL still renders —
      [test: flag wiring + component tests]
- [ ] Admin switch persists and takes effect without deploy — [test: admin panel + flags API tests]
- [ ] Dot renders when a newer album exists vs the stored timestamp; cleared on section entry —
      [test: component test with mocked localStorage]
- [ ] Quality gates green — [command: `pnpm types && pnpm test && pnpm lint`]

---

## Phase 8: HITL + production rollout

**User stories**: whole-PRD verification (no new stories)

### What to build

A manual test checklist walking every user story end-to-end on dev (creation, borrowing, videos,
management, cascades, downloads on a large album, flag, dot — on desktop and mobile). Then the
production rollout: production migration and deploy are executed **by the user** (never by the
agent), followed by a smoke test on production.

### Assumptions carried in

- Phases 1–7 are on main with all dev migrations applied; the user holds production credentials
  and deploy permission.

### Out of scope for this phase

- New functionality — only bugfixes arising from the checklist.

### Acceptance criteria

- [ ] Manual checklist executed by the user on dev with all items checked — [observable: completed
      checklist in the issue]
- [ ] Production migration and deploy run by the user — [command: `pnpm db:production:migrate` and
      `pnpm deploy:production`, executed by the user]
- [ ] Production smoke: an album created in production is visible to a second family member —
      [observable: on wspolniak.com]
