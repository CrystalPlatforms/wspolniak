# Plan: Loading Harmony & Fast Boot

> Source PRD: `plans/loading-harmony-prd.md` (GitHub umbrella issue: #142)

## Architectural decisions

Durable decisions that apply across all phases:

- **Architecture style**: SSR stays; the cold-start splash is static markup inside the HTML shell
  (renders before any JavaScript). Reveal choreography runs client-side after hydration.
- **Data model**: no database changes; zero migrations. Existing feed/post/video/bookmark queries
  are reused as-is.
- **Sequencer semantics**: all data fetches in parallel; the screen reveals stages strictly in
  order; zero artificial delays (a stage whose prerequisites are met shows immediately).
- **Key entities (deep modules)**: boot splash, boot sequencer hook, post card skeleton,
  app bootstrap hook (session/maintenance/flags from query cache), fade-in image behavior.
- **Auth**: session remains server-verified; the bootstrap refactor must preserve the
  logged-out redirect.
- **Router**: fullscreen splash only on cold start; subpage pending is always scoped to the
  content area — navigation menus never disappear mid-session.
- **Integrations**: Cloudflare Images variants unchanged; service worker offline cache and
  banner unchanged.

---

## Phase 1: Non-blocking navigation

**User stories**: 11, 16, 17

### What to build

Refactor the app layout so session, maintenance state and feature flags resolve from the query
cache (background refresh) instead of blocking every navigation in `beforeLoad`. Subpage pending
moves from the router-wide fullscreen replacement to the content area: the desktop sidebar and
the mobile bottom bar stay mounted and interactive while the loader spins only inside the
content region. Simple screens (calendar, admin, settings, composers) show the centered loader
in the content area — no skeletons.

### Acceptance criteria

- [ ] Navigating between any subpages never unmounts or covers the sidebar (desktop) or bottom bar (mobile)
- [ ] Session/maintenance/flags resolve from cache; background refresh updates stale values without a pending flash
- [ ] Logged-out users are still redirected away from `/app` (auth safety preserved)
- [ ] Unit tests: bootstrap resolves from cache, no per-navigation blocking, redirect preserved
- [ ] Manual: rapid clicking through menu keeps navigation usable at all times

---

## Phase 2: Instant cold-start splash

**User stories**: 1, 2, 3, 10, 12 (desktop part)

### What to build

Static splash markup inside the HTML shell: black background, green TailChase loader and the
"Wspólniak" title — visible in milliseconds, before the server responds, no JavaScript needed.
It stays at least ~600 ms (no flash on fast loads) and is removed once the app is hydrated and
ready. Cold vs warm start detection: the full choreography (splash → navigation bars slide in)
runs only on cold start; returning from the background shows content immediately. After the
splash hides, the mobile bottom bar slides up and the desktop sidebar slides in.

### Acceptance criteria

- [ ] Splash paints without waiting for JS or server data (static HTML/CSS only)
- [ ] Splash never displays shorter than ~600 ms
- [ ] Splash removal happens at hydration without a blank flash between splash and app
- [ ] Cold start: bars slide in after splash; warm start (app resumed): content immediately, no choreography
- [ ] Manual on phone via PWA: tap icon → splash instantly visible

---

## Phase 3: Feed choreography

**User stories**: 4, 5, 6, 14, 15

### What to build

The boot sequencer hook and the post card skeleton, integrated into the feed end-to-end.
On cold start the feed area shows skeleton frames of all visible cards (author header,
description lines, fixed-proportion image slot, reaction bar — dark gray with subtle shimmer).
Cards then fill strictly in order: header + description → reactions & comment count → photos.
Data fetching stays parallel (a hanging resource never blocks other stages); the sequencer
enforces reveal order with zero artificial delays between stages.

### Acceptance criteria

- [ ] Skeletons mirror real card layout; no layout shift when content arrives
- [ ] Reveal order enforced: header+description before reactions/comment count before photos
- [ ] Zero artificial delay: a stage shows in the same tick its prerequisites are met (unit-tested)
- [ ] A hanging resource (e.g. photos) does not block text stages from revealing (unit-tested)
- [ ] Shimmer respects reduced-motion (no animation)
- [ ] Manual: cold start shows the full ordered sequence on the feed

---

## Phase 4: Lazy fade-in images

**User stories**: 7, 8

### What to build

Image behavior for feed and post view: only images near/at the viewport load (lazy); each image
slot reserves its fixed proportions; the photo fades in from the gray placeholder when ready.
Works together with the staged reveal from Phase 3 (fade-in is the final stage of a card).

### Acceptance criteria

- [ ] Off-screen images do not load until scrolled near
- [ ] Image slots have fixed reserved proportions — zero layout shift at any point
- [ ] Photos appear with a smooth fade from placeholder; reduced-motion shows them without fade
- [ ] Manual: scrolling the feed loads images progressively, nothing jumps

---

## Phase 5: Choreography of remaining screens

**User stories**: 9 (+ video & library staging per PRD decisions)

### What to build

Extend the sequencer to the post view with its own order — photos → comments → the rest
(author, description, reactions) — plus the video feed and the library list, which stage like
the feed (skeleton list → ordered fill). Simple screens keep the Phase 1 centered loader.

### Acceptance criteria

- [ ] Post view reveals photos first, then comments, then the rest — in that strict order
- [ ] Video feed and library list show skeletons and fill in feed-like stages
- [ ] Calendar/admin/settings/composers unchanged (centered loader, no skeletons)
- [ ] Manual: opening a post, the video tab and the library follow their choreographies

---

## Phase 6: Offline fast-path

**User stories**: 13

### What to build

During the splash, the app detects offline status in the background. When offline, the cached
feed is shown immediately — the splash is not prolonged, the choreography does not replay —
and the existing offline banner communicates the state.

### Acceptance criteria

- [ ] Offline detected during splash → cached feed renders immediately, no extra waiting
- [ ] Offline banner still shown; no error state instead of cache
- [ ] Online recovery behaves as today (pull-to-refresh/next loads refetch)
- [ ] Manual: airplane mode + cold start → cached feed instantly

---

## Phase 7: HITL — full manual validation

**User stories**: 12, 18 + full-PRD pass

### What to build

Complete manual validation on real devices against the PRD checklist: phone via PWA
(cold start, warm return, subpage navigation, airplane mode), desktop (cold start sequence,
sidebar persistence), reduced-motion behavior, and the unit-test suites for the sequencer and
bootstrap modules. Fixes for anything found land here before closing the umbrella issue.

### Acceptance criteria

- [ ] Phone PWA cold start: splash ≤ 100 ms visible, ordered reveal, no jumps
- [ ] Phone PWA warm return: content immediately
- [ ] Subpage clicks: navigation always visible; loader confined to content area
- [ ] Desktop cold start: splash → sidebar → content
- [ ] Airplane mode: cached feed immediately
- [ ] Reduced-motion: no spin/slide/fade/shimmer animations
- [ ] `pnpm types && pnpm test && pnpm lint` green
