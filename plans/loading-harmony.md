# Loading Harmony & Fast Boot — Discovery Notes

> Status: discovery IN PROGRESS (`/ask` interview, series 1 answered on 2026-08-17; series 2 = open questions below).
> Follow-up to #138 (TailChase loader + route-level `defaultPendingComponent`).
> Target process after discovery: `/blueprint` → `/carve` → `/dispatch` → `/tdd` (decided, Q15).

## Problem

The user (family admin) experiences the app as too slow, primarily on phones via PWA:

- Cold entry (app icon / link) takes **over 5 seconds** before posts are visible (Q3).
- During subpage navigation the pending spinner covers the whole screen, including navigation (desktop sidebar / mobile bottom bar).
- Desired: an orchestrated, staged boot sequence — "perfect harmony" — where nothing appears all at once, but everything appears in a deliberate order.

Primary platform: **phones via PWA** (Q2).

## Current boot architecture (findings from code)

1. **Cold entry (SSR):** the Cloudflare Worker renders HTML and waits server-side for:
   session → maintenance state → feature flags → first feed page (all sequential server calls).
   The browser shows **nothing** until the full HTML arrives — this is the perceived slowness.
   Feed SSR loader: `src/routes/app/index.tsx` (`ensureInfiniteQueryData` before render).
2. **Layout `beforeLoad` re-pending:** `src/routes/app.tsx` runs `getSession` + `getMaintenanceState` +
   `getFeatureFlagsState` on **every navigation** under `/app`, which makes the whole route tree
   (including sidebar/bottom bar) go pending. The fullscreen `defaultPendingComponent` added in #138
   therefore covers navigation menus on every subpage change.
3. **Posts:** feed page arrives as one SSR payload; images load separately in the browser
   from Cloudflare Images variants.

## Decisions made (interview series 1)

| # | Topic | Decision |
|---|-------|----------|
| Q2 | Platform | Phones via PWA are the primary target |
| Q3 | Cold start pain | > 5 s to content today |
| Q5 | "Frames" meaning | Skeleton card frames: post cards visible **without text and photos** first (all visible cards at once), then filled in stages |
| Q6 | Instant splash | **Yes** — static splash baked into HTML (zero JS), appears immediately, before the server responds |
| Q7 | SSR strategy | **Keep SSR**; splash covers the blank period, hides when content is ready, then staged reveal |
| Q8 | Boot sequence | Full choreography **only on cold start**; warm return (PWA from background) = content immediately. Mobile bottom bar **slides up** when it appears |
| Q9 | Desktop pending | Sidebar always visible (black), pending only in the content area — never covers the menu. **Same for mobile: bottom bar also stays visible during subpage pending** |
| Q10 | Desktop cold start | Fullscreen splash first → sidebar slides in → content (full harmony, same as mobile) |
| Q12 | Post view stage order | Custom: **comments → author+description → photos** (unusual — confirmed/adjusted in Q19, open) |
| Q13 | Skeleton look | Dark gray blocks with subtle shimmer |
| Q14 | Layout stability | Fixed reserved space for images — zero layout shift |
| Q15 | Process | Full flow: `/blueprint` → `/carve` → `/dispatch` → `/tdd` |
| Q16 | Architecture consent | Yes: move session/maintenance/feature flags out of layout `beforeLoad` (cache + background refresh) so subpage pending never covers navigation |

### Proposed core concept (pending Q17 confirmation)

**Parallel fetching + sequential reveal** ("staged reveal"): data downloads in parallel (fastest
total time), while the screen reveals elements in the user's chosen order. A comparison table
was presented: staged reveal reaches full content ~30–40% faster than strict sequential
fetching with an identical visual order. The user's original idea was strict sequential
fetching (waterfall) — decision pending.

### Intended mobile cold-start sequence (pending Q23 confirmation)

1. Immediately: black screen + green TailChase loader (static splash, no JS)
2. When everything is downloaded: splash hides, **bottom bar slides up**
3. Then: **skeleton post cards** (author header, description lines, image slot, reaction bar — dark gray, shimmer)
4. Cards fill in order: **header + description → reactions & comment count → photos** (fade-in, reserved space)

## Open questions (interview series 2 — to answer before `/blueprint`)

- **Q17.** Sequential fetching vs staged reveal (recommendation: staged reveal) — see table above.
- **Q18.** Where does it hurt most (cold open / menu clicks / images / everything)?
- **Q19.** Post view order confirmation: really comments first? (`comments → author+desc → photos`)
- **Q20.** Scope split: full choreography (feed, post view, video, library) + simple pending
  (calendar, admin, settings, composers) — agree?
- **Q21.** Pending never covers navigation on either platform; fullscreen splash only on cold start — confirm.
- **Q22.** Splash contents (loader only vs + "Wspólniak" title) and minimum display time (none vs ~600 ms).
- **Q23.** Confirm the full mobile cold-start sequence above.
- **Q24.** Images: lazy-load viewport-only + fade-in from gray block — confirm.
- **Q25.** Offline: show cached feed immediately with offline banner (skip choreography)?
- **Q26.** Stage transition gaps: subtle ~200 ms harmony vs zero artificial delay.

## Technical notes for the PRD

- Static splash: inline-CSS div in the SSR HTML shell, removed on hydration (no JS dependency).
- `app.tsx` refactor: session/maintenance/flags via query cache with `staleTime` + background
  refetch instead of per-navigation `beforeLoad` awaits. Auth redirect must stay safe.
- Pending scoping: child-route pending inside the layout content area (`Outlet`), not router-wide
  fullscreen; keep fullscreen only for the cold-start splash.
- Skeletons: one `PostCardSkeleton` deep module reused in feed/post view; shimmer via CSS.
- Image slots: fixed aspect-ratio boxes (Q14); CF Images variants already support resizing.
- Staged reveal: CSS-driven (animation-delay classes / state steps), data fetched in parallel.
