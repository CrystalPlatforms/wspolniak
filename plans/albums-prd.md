# PRD: Wspólniak Albums

> Written after the `/ask` discovery session (2026-08-26). All decisions were signed off by the client
> across four interview rounds. UI copy stays Polish; this document is English per repo convention.

## Overview

Albums are curated collections of photos and videos inside Wspólniak. They live **beside the feed**:
uploading to an album does not create a post. An album can mix the family's own uploads with photos
and videos borrowed from existing posts and the video library, giving the family a way to organize
memories around events ("Wakacje 2026") without polluting the chronological feed.

## Problem Statement

Today photos live only inside feed posts. When the family wants to return to a set of photos — one
holiday, one celebration — they must scroll the feed and remember which posts held which photos.
Feed posts are chronological, not thematic; there is no way to gather photos from different days or
authors into one place, and no way to upload a batch of photos without making a post.

## Users

| User type | Description | Volume |
|-----------|-------------|--------|
| Family member | Any signed-in member of the instance | Everyone |
| Album creator | The member who created an album (plus the admin) | Any member can become one |
| Admin | The single instance administrator | 1 |

## Solution

A new "Albumy" section (`/app/albums`) where every member can create albums, upload photos directly
into them, and borrow photos/videos from posts and the video library. Albums are viewed as a grid of
tiles; opening one shows photos and videos in order of adding, with the existing lightbox for zoom
and swipe. Photos can be downloaded as one streamed ZIP; videos are exported as a file of YouTube
links (the API cannot serve video files). Only the creator (or admin) can modify an album. The
feature ships behind an `albums_enabled` flag, defaults on.

## User Stories

**Creation**

1. As a family member, I want to create an album by entering a title and uploading at least one
   photo, so that a new album never starts empty.
2. As a family member, I want to select and upload multiple photos at once into a new album (with
   automatic HEIC conversion), so that creating an album feels like the post composer I already know.
3. As a family member, I want album uploads to **not** appear in the feed, so that the feed stays a
   clean chronological stream of posts.

**Borrowing content**

4. As a family member, I want an "Dodaj do albumu" button next to the download button in the
   lightbox (mobile and desktop), so that I can add the photo I am viewing to my album.
5. As a desktop user, I want an "Dodaj do albumu" button in the corner of each photo in the post
   view, so that I can add a photo without opening the lightbox first.
6. As a family member, I want to add a video to my album from the video page and from a post's
   attached video, so that albums can mix photos and videos.
7. As a family member who has no album yet, I want the "Dodaj do albumu" action to open a dialog
   explaining I need an album first, with a shortcut to create one, so that I am never stuck.
8. As an album creator, I want to add more of my own photos to an existing album at any time, so
   that an album can grow after creation.
9. As a family member, I want the same photo or video added twice to an album to be silently
   prevented, so that an album never shows duplicates.

**Viewing**

10. As a family member, I want an "Albumy" item in the menu with a "new" dot when albums I have not
    seen exist, so that I can discover new albums (the dot clears per device when I open Albums).
11. As a family member, I want the albums list as a grid of tiles — cover photo, title, photo and
    video counts — sorted newest first, so that I can pick an album at a glance.
12. As a family member, I want to open an album and see its photos and videos as a grid in order of
    adding, so the album reads like a story.
13. As a family member, I want to tap an album photo to open the existing lightbox (zoom, swipe), so
    that viewing works exactly like everywhere else in the app.
14. As a family member, I want to tap a video thumbnail in an album to go to the video page, so that
    playback stays on YouTube.

**Ownership & permissions**

15. As an album creator, I want to rename my album, so that typos can be fixed.
16. As an album creator, I want to pick any photo in the album as the cover, so that the tile looks
    right (videos cannot be covers; default is the first photo).
17. As an album creator or admin, I want to remove an item from my album without affecting the
    source post, so that mistakes are reversible.
18. As an album creator or admin, I want to delete an entire album, so that clutter can be cleaned.
19. As a family member, I want only the album's creator (or admin) to add/remove items and edit the
    album, so that nobody reorganizes someone else's album.
20. As an admin, I want to manage every album in the instance, so that I can help when asked.

**Lifecycle & cascades**

21. As a family member, I want items whose source post or video was deleted to disappear from
    albums automatically, so albums never contain dead items.
22. As a family member, I want deleting an album to leave borrowed post photos untouched, so that
    album management can never damage the feed.
23. As an admin, I want photos uploaded directly into a deleted album to be removed from Cloudflare
    Images as well, so that storage does not leak.

**Download**

24. As a family member, I want to download all of an album's photos as a single ZIP served by the
    Worker, so that I can archive or print them without clicking photo by photo.
25. As a family member, I want to download a file containing clickable links to the album's videos,
    so that I can reach them on YouTube even though video files cannot be exported.

**Admin & limits**

26. As an admin, I want an `albums_enabled` switch in the admin panel, so that the feature can be
    hidden (menu and buttons) without a deploy; direct routes keep working.
27. As a family member, I want a hard cap of 500 items per album, so that pathological albums cannot
    degrade the app or the ZIP download.

## Implementation Decisions

- **Data model (no FK, per repo convention; cascades in application code):**
  - `albums`: id, creator, title (≤100 chars, duplicates allowed), cover item reference (nullable),
    timestamps.
  - `album_items`: id, album, `kind` ∈ {own image, post photo, video}, reference to the item,
    timestamps. **One polymorphic table** so photos and videos share a single ordering.
  - Ordering = `created_at` of the item row (order of adding); no position column, no reordering UI.
  - Unique constraint (album, kind, reference) blocks duplicates at the DB level.
  - Limit of 500 items per album enforced in the domain layer.
- **Deep modules:**
  - DB domain `albums` — the only place that knows the tables; exposes create/list (with cover and
    per-kind counts)/get with items/add items/remove item/rename/set cover/delete (returns own
    image ids for cleanup)/cascade helpers for deleted posts and videos.
  - Shared `AddToAlbum` component (button + dialog) reused by: lightbox (all platforms), post view
    photo corner (desktop), post view video, video detail page. Dialog lists the user's own albums
    (admin: all); empty state links to creation.
  - Download module — streams a ZIP of the largest JPEG variant of each photo (store method, no
    compression — JPEGs are already compressed, so CPU stays minimal), and renders an HTML file of
    video links (title + clickable YouTube URL, Polish header).
- **API:** thin Hono wrappers over the domain — album CRUD, item add/remove, two download endpoints
  (photos ZIP stream, videos HTML). Same auth as other app routes.
- **Upload:** reuses the existing Cloudflare Images pipeline from the post composer (multi-select,
  automatic HEIC conversion). Album-owned photos are referenced by their Cloudflare image id.
- **Navigation:** menu item "Albumy" (URL `/app/albums` — Polish label with a short English path,
  same intentional mismatch as Biblioteka/`/app/lib`). A "new" dot driven by a per-device
  `localStorage` timestamp of the newest album; cleared on entering the Albums section.
- **Feature flag:** `albums_enabled` in the instance settings, default true. OFF hides the menu item
  and all "Dodaj do albumu" buttons; album routes remain reachable by URL.
- **New dependency:** `client-zip` for streaming ZIP generation inside the Worker.
- **Creation flow:** a dialog with title + photo upload; at least one **own** photo required.
  Borrowing from posts/videos is available only after the album exists.
- **Cascades:** post deletion removes its items from all albums; video deletion likewise; album
  deletion deletes its own photos from Cloudflare Images and leaves borrowed items untouched.

## Assumptions

- `client-zip` streams correctly inside a Cloudflare Worker for responses of the expected size
  (500 photos × ~3 MB ≈ 1.5 GB) — store-method CPU use is negligible; must be verified in the first
  vertical slice. If Worker limits bite, the cap or chunked download changes first.
- The largest JPEG variant of each Cloudflare Image is good enough for family archive/print use;
  originals (possibly HEIC) are not what families expect in a ZIP.
- Cloudflare Images delivery URLs are fetchable server-side from the Worker with the existing
  credentials.
- A per-device "new" dot (localStorage) is acceptable — the dot may reappear on a second device;
  the client explicitly chose this over an account-wide marker.
- YouTube unlisted links remain accessible to signed-in family members (they already are today via
  the video section); link stability is YouTube's, not ours.
- Family scale (≤ ~30 members) means no rate limits on album creation are needed.
- Production migration and deploy are executed manually by the client (dev DB migrations follow the
  standard dev pipeline).

## Tradeoffs Considered

- **Separate junction tables per source (own images / post photos / videos)** — rejected: a single
  mixed grid with one ordering would need a fourth sequencing table; counts, dedup and cascades
  would all triplicate.
- **Position column with drag-and-drop reordering** — rejected: client chose order-of-adding only;
  `created_at` ordering makes the column dead weight.
- **R2 copies of videos at upload time (real video ZIP)** — rejected by client: new infrastructure
  and storage costs; YouTube provides no file-download API (researched and confirmed).
- **yt-dlp or third-party downloader APIs for videos** — rejected: violate YouTube ToS, cannot run
  on Workers, and route family videos through external services.
- **Album as a feed post variant (Facebook-style)** — rejected by client: albums live beside the
  feed; uploads must not create posts.
- **Account-wide "seen" marker in the DB** — rejected: client chose the simpler per-device dot.
- **Push notifications for new albums / new items** — rejected by client: albums are silent.
- **Reactions and comments on albums** — rejected for v1: albums are for browsing.
- **Blocking `/app/albums` when the flag is OFF** — rejected by client: hide entry points only.
- **Empty albums at creation** — rejected by client: at least one photo required up front.
- **Video thumbnails as album covers** — rejected: covers are photos only.

## Validation Strategy

Every user story maps to at least one mechanism below. House gates: `pnpm types && pnpm test &&
pnpm lint` all green; all new code lands test-first (TDD).

| Stories | Verification |
|---------|--------------|
| 1, 2, 3 | Domain + API tests: album creation rejects empty title/zero photos; created album is absent from the feed queries; multi-image creation persists items in order |
| 4, 5, 6 | Component tests: `AddToAlbum` renders next to download controls in lightbox, post view (desktop corner), post video and video page; triggers the add-item mutation with correct kind/reference |
| 7 | Component test: dialog with zero owned albums renders the empty state with a create shortcut |
| 8 | Domain test: adding own photos to an existing album appends items and enforces the 500 cap |
| 9 | Domain test: unique constraint makes duplicate (album, kind, ref) a no-op or clean rejection |
| 10 | Component test: dot renders when a newer album exists vs stored timestamp, clears on section open |
| 11 | API/component test: list returns tiles newest-first with cover, photo count and video count (video part hidden when zero) |
| 12, 13, 14 | Component test: album grid renders mixed items in add-order; photo tap opens lightbox; video tile links to the video page |
| 15, 16 | API tests: rename and set-cover restricted to creator/admin; cover must reference a photo in the album |
| 17, 18 | Domain + API tests: item removal leaves the source post intact; album deletion returns own image ids for Cloudflare cleanup |
| 19, 20 | API tests: mutations by a non-creator non-admin are rejected; admin succeeds everywhere |
| 21 | Domain tests: post/video cascade helpers remove the right items across albums |
| 22, 23 | Domain test: delete-album leaves post photos untouched and returns exactly the own-upload ids |
| 24 | API test: photos endpoint streams a valid ZIP (headers + readable entries) from fixture image URLs; manual HITL on a real album |
| 25 | Unit test: videos HTML contains title + clickable link per video, Polish header; empty-videos album hides the button |
| 26 | Component/API tests: flag OFF hides menu item and `AddToAlbum` buttons; direct route still renders |
| 27 | Domain test: 501st item rejected with a clear error |

**Done per component:** DB domain (all queries tested at the module boundary), API (happy path +
authz + validation errors), frontend (user-interaction tests, Polish copy), download (ZIP + HTML
artifact tests), flag (admin panel + hiding), cascades (post/video/album deletion), docs (this PRD
updated with any deviations).

## Out of Scope

- Drag-and-drop reordering of items
- Album descriptions or event dates
- Reactions, comments, or push notifications on albums
- Video files in the ZIP (YouTube API limitation; R2 backup copies explicitly rejected)
- Sharing albums outside the instance; per-user private albums (all albums are instance-wide)
- Collaborative adding by non-creators
- Bulk operations across albums

## Further Notes

- UI label is "Albumy"; the URL is `/app/albums` — an intentional label/path mismatch, same as
  Biblioteka (`/app/lib`). Do not "fix" it later.
- Polish UI copy throughout; docs in English per repo convention.
- Dev migration follows the standard dev pipeline; production migration and deploy are executed by
  the client (MrCrystal2), never by the agent.
