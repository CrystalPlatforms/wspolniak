# PRD — Loading Harmony & Fast Boot

> Status: PRD approved (discovery complete, 2026-08-17). Process: `/carve` → `/dispatch` → `/tdd`.
> Follow-up to #138 (TailChase loader + router-level pending).

## Problem Statement

Opening Wspólniak — primarily on phones, via the PWA home-screen icon — feels slow and chaotic.
On a cold start the browser shows nothing for over 5 seconds while the server prepares the page,
then everything appears at once. There is no sense of progress or order. During subpage
navigation the pending spinner covers the entire screen, including navigation menus (desktop
sidebar, mobile bottom bar), so the app appears to "freeze" instead of responding.

The family wants an orchestrated boot: an immediate visual response, a deliberate stage-by-stage
reveal of the interface and content ("perfect harmony"), and navigation that always stays
interactive.

## Solution

A staged boot-and-reveal system ("Loading Harmony"):

1. **Instant static splash** baked into the HTML shell (no JavaScript required): black screen,
   green TailChase loader, "Wspólniak" title — visible in milliseconds, before the server responds.
2. **Choreographed reveal** on cold start: splash → navigation bar slides in → skeleton post
   cards → cards fill in a fixed order (header+description → reactions & comment count → photos).
3. **Parallel fetching with sequential reveal**: all data downloads simultaneously (fastest total
   time, resilient to a single hanging request); the screen reveals elements strictly in the
   defined order, with zero artificial delays between stages.
4. **Non-blocking navigation**: subpage pending is scoped to the content area only — the desktop
   sidebar and mobile bottom bar are never covered. Fullscreen splash appears only on cold start.
5. **Offline-aware boot**: when offline is detected in the background, the cached feed is shown
   immediately, without prolonging the splash.

## User Stories

1. As a family member, I want to see a black screen with the loader and "Wspólniak" title within
   milliseconds of tapping the app icon, so that the app feels responsive immediately.
2. As a family member, I want the splash to remain visible for at least ~600 ms, so it never
   flashes on fast connections.
3. As a family member on a cold start, I want the bottom navigation bar to slide up once the app
   is ready, so the boot feels orchestrated rather than sudden.
4. As a family member, I want to see skeleton frames of all visible post cards right after the
   navigation appears, so I know what is coming and where.
5. As a family member, I want skeletons to mirror the real card layout (author header,
   description lines, image slot, reaction bar) with dark-gray shimmer, so nothing jumps when
   content arrives.
6. As a family member, I want card content to fill in a fixed order — header + description
   first, then reactions and comment count, then photos — so the reveal is harmonious and predictable.
7. As a family member, I want photos to fade in from a gray placeholder into a reserved,
   fixed-proportion slot, so the layout never shifts.
8. As a family member, I want images outside the viewport to load lazily, so the first screen
   loads as fast as possible.
9. As a family member opening a single post, I want photos to appear first, then comments, then
   the rest (author, description, reactions), so the most important content leads.
10. As a family member returning to the app from the background (warm start), I want content
    immediately, without the full choreography replaying.
11. As a family member navigating between subpages, I want the loader to spin only in the content
    area while the sidebar (desktop) or bottom bar (mobile) stays visible and usable.
12. As a family member on desktop, I want the cold start to follow the same harmony: fullscreen
    splash → sidebar slides in → content reveal.
13. As a family member without internet, I want the app to detect offline in the background and
    show my cached feed immediately (with the offline banner), rather than prolonging the splash.
14. As a family member, I want all data to download in parallel, so a single slow resource
    (e.g. photos) never blocks text and comments from appearing.
15. As a family member, I want every element to appear exactly when it is ready within the
    ordered sequence — no artificial pauses — so the app is never slower than it needs to be.
16. As an admin, I want simple screens (calendar, admin panel, settings, post/video composers)
    to show a simple centered loader instead of skeletons, since there is nothing to stage.
17. As an admin, I want session, maintenance state and feature flags loaded from cache with
    background refresh, so subpage navigation is instant.
18. As a user with reduced-motion preferences, I want animations suppressed (loader static,
    no slide/fade), consistent with the accessibility behavior of the loader.

## Implementation Decisions

**Core principle (decided):** parallel fetching + sequential reveal. Downloads run concurrently;
the reveal order is enforced by a sequencer; zero artificial delays between stages.

**Deep modules:**

| Module | Interface | Hides |
|---|---|---|
| Boot splash | static markup in the HTML shell (no props) | inline styling, min-600 ms rule, removal at hydration, offline detection hand-off |
| Boot sequencer (`useBootSequence`) | "can stage X be shown now?" — one hook for all screens | data-readiness tracking, ordering rules, cold/warm distinction, offline path |
| Post card skeleton | one skeleton component (feed + post view) | shimmer animation, layout mirroring the real card, fixed image aspect ratios |
| App bootstrap (`useAppBootstrap`) | session / maintenance / feature flags on demand | query-cache with `staleTime`, background refetch, replacing per-navigation `beforeLoad` awaits; auth redirect preserved |
| Fade-in images | extension of the existing image components | lazy loading, reserved space, fade transition from placeholder |

**Architecture decisions:**

- SSR stays (decided): the splash covers the blank period until the server HTML is ready; no
  client-only feed switch.
- The splash is static (inline in the HTML shell) so it renders before any JavaScript executes.
- The `/app` layout stops awaiting session/maintenance/flags on every navigation (`beforeLoad`
  refactor approved); pending becomes scoped to the content area, so navigation menus never
  disappear mid-session.
- Fullscreen splash appears only on cold start; warm starts (app resumed from background) skip
  the choreography entirely.
- Reveal order per screen:
  - Feed: skeletons → header+description → reactions & comment count → photos.
  - Post view: photos → comments → the rest (author, description, reactions).
  - Video & library: staged like feed (skeleton list → fill stages).
  - Calendar, admin, settings, composers: simple centered loader only.
- Offline: detect in the background during splash; when offline, show the cached feed
  immediately (no prolonged splash, no choreography replay); existing offline banner remains.
- Skeletons: dark gray blocks with subtle shimmer; image slots reserve fixed proportions.
- Accessibility: reduced-motion users get no spin/slide/fade animations.

## Validation Strategy

**Boot sequencer (`useBootSequence`)** — the most logic-heavy module; validated by unit tests:
- A stage becomes visible only when its data is ready **and** all earlier stages are visible.
- Zero artificial delay: a stage whose prerequisites are met shows in the same tick (no timers).
- Warm start skips the choreography; cold start runs it.
- Offline path: when offline is detected, cached content is released immediately.
- One hanging resource never blocks unrelated stages from advancing.

**App bootstrap (`useAppBootstrap`)** — validated by unit tests:
- Session/maintenance/flags resolve from cache without blocking navigation.
- Background refresh updates stale values without a pending flash.
- Logged-out users are still redirected (auth safety preserved).

**Whole-feature HITL (manual, on a phone via PWA):**
- Cold start: splash ≤ 100 ms visible; bottom bar slides up; skeletons; ordered fill; no layout jumps.
- Warm return: content immediately.
- Subpage clicks: nav bars stay visible; loader confined to content area.
- Desktop cold start: splash → sidebar → content.
- Airplane mode: cached feed shows immediately after offline detection.
- Sub-screens (calendar/admin/settings): centered loader, no skeletons.

## Out of Scope

- Server-side performance work (Worker cold starts, DB query tuning) — perceived-speed work only.
- New data APIs or payload changes.
- Full offline app support (existing offline cache + banner remain as-is).
- PWA install prompts, push, or service-worker caching strategy changes.
- The video player itself and YouTube embed behavior.

## Further Notes

- Builds directly on the #138 loader (`Loader` component, TailChase, #167c51) — the splash,
  skeletons' loaders and content-area pending reuse it.
- Process agreed with the stakeholder: `/blueprint` (this PRD) → `/carve` (phased plan) →
  `/dispatch` (sub-issues) → `/tdd` (implementation).
- Stakeholder's phrasing of the goal: "nothing loads at once — everything in perfect harmony",
  with the explicit clarification that fetching is parallel and only the **reveal** is sequenced.
