# Plan: Wspólniak Chat

> Source PRD: `plans/chat-prd.md` (updated after /ask discovery, 2026-08-21)

## Architectural decisions

Durable decisions that apply across all phases:

- **Architecture style**: TanStack Start SSR frontend (`/app/chat`) + Hono API (`/api/chat/*`) on the
  existing Cloudflare Worker (`src/server.ts`); domain module `src/db/chat/` following the project's
  domain-based layout; existing session-cookie auth middleware guards everything. No new services.
- **Data model**: `chat_messages` (id, author_id, text ≤ 200, reply_to_id, reply_text snapshot,
  created_at, expires_at = now()+24h) and `chat_reactions` (id, message_id, user_id, reaction
  `heart|laugh|flame`, created_at, UNIQUE(message_id, user_id, reaction)). **No foreign keys** (project
  convention — cascades in queries). Indexes on `expires_at` and `created_at`. Single dev migration
  `0025` covering both tables, applied in Phase 1.
- **Key entities**: `ChatMessage`, `ChatReaction`, `ChatRoom` (Durable Object).
- **Real-time**: one `ChatRoom` DO instance (`idFromName("global")`), WebSocket **Hibernation API**
  (free plan sufficient), sockets tagged with user id. WS is receive-only for messages + typing;
  **sending goes over HTTP POST**; the Worker broadcasts through the DO after the DB write. The DO
  answers "who is currently connected" for push suppression (Phase 7) and holds the rate-limit
  counter (Phase 2). `wrangler.jsonc` gains the `CHAT_ROOM` binding in Phase 2.
- **Integrations**: existing Web Push VAPID fan-out (generic title, 2-min throttle, deep link);
  existing feature-flag system (new `chat` flag); existing cron infrastructure (add hourly
  `7 * * * *` alongside the daily 6:00 — the scheduled handler branches by cron expression).
- **Constraints**: animations use `transform`/`opacity` only (Telegram-iOS benchmark); 200-char
  messages; 10 msg/min/user; 24h hard expiry (read path always filters `expires_at > now()`).
- **Rollout**: dev environment throughout; production deploy + prod migration applied manually
  (HITL) after Phase 8.

---

## Phase 1: Messaging core

**User stories**: 1 (send text message), 6 (open chat from anywhere — via direct URL for now)

### What to build

The thinnest complete path: send a text message and see it persisted. Migration `0025` (both
tables), `src/db/chat` domain (create message, list last-24h messages with author names, expiry
filter), API `GET/POST /api/chat/messages` (auth, Zod: text 1–200 chars), and the `/app/chat` view:
two-sided Telegram-style layout (own right, others left with name on first of a group), grouped
consecutive messages, time in every bubble, optimistic send (instant bubble + thin progress bar,
red + retry on error), empty state, loader + notice when > 50 messages.

### Assumptions carried in

- Existing session auth works unchanged; route reachable by direct URL (nav item arrives in Phase 8).
- TanStack Query patterns as used across the app; Neon DB reachable in dev.

### Out of scope for this phase

- Real-time delivery (reload the page to see others' messages — Phase 2)
- Reactions (Phase 4), reply (Phase 5), typing (Phase 3)
- Rate limiting (needs the DO — Phase 2), push (Phase 7), expiry cron (Phase 7)
- Feature flag, nav item, offline handling (Phase 8)

### Acceptance criteria

- [ ] Sent message survives page reload (persisted, correct author) — [test: domain query test; manual: reload]
- [ ] Optimistic bubble appears instantly with progress bar; API error → red bar + retry — [test: component test with mocked API failure]
- [ ] `GET` returns only messages with `expires_at > now()` — [test: domain test with a seeded expired row]
- [ ] 201+ char text rejected with 400; UI enforces the limit — [test: API validation test]
- [ ] Unauthenticated request → 401 — [test: API test without session]
- [ ] Own messages right/others left, name only on first of a group — [test: component test; manual visual]
- [ ] > 50 messages → loader + notice — [test: component test with 51 messages]
- [ ] Gates green — [command: `pnpm types && pnpm test && pnpm lint`]

---

## Phase 2: Real-time delivery

**User stories**: 6 (live view without refresh)

### What to build

Live message delivery. `ChatRoom` Durable Object (Hibernation API, sockets tagged with user id,
connected-user set, broadcast), `GET /api/chat/ws` WebSocket upgrade authenticated by the session
cookie, `CHAT_ROOM` binding + DO class export, and the client WS hook: incoming messages appear
live with the slide-in-from-bottom animation (~220ms, ease-out), auto-scroll when within ~100px of
the bottom, otherwise a "↓ nowe wiadomości" button; auto-reconnect with backoff and a refetch on
reconnect (no gaps, no duplicates). Rate limit: 10 messages/minute/user — check-and-increment
counter in the DO, enforced before the DB write.

### Assumptions carried in

- Phase 1 API/UI and DB schema; sending stays over HTTP POST (WS never writes messages).

### Out of scope for this phase

- Typing events (Phase 3), reaction/delete broadcasts (Phases 4/6), push (Phase 7)
- Local-dev ergonomics beyond the Vite CF plugin's DO support

### Acceptance criteria

- [ ] Second connected client shows a new message without refresh (< ~1s) — [manual: two browser windows]
- [ ] Incoming messages slide in from the bottom; no layout jump — [manual]
- [ ] Auto-scroll near bottom; "↓ nowe wiadomości" button when scrolled up — [test: scroll-logic unit test; manual]
- [ ] Reconnect after network drop → refetch, no gaps/duplicates — [manual: toggle offline; test: dedupe by message id]
- [ ] 11th message within a minute → rejected as too many — [test: rate-limit unit test]
- [ ] WS upgrade without a valid session rejected — [test: upgrade handler test]
- [ ] Gates green — [command: `pnpm types && pnpm test && pnpm lint`]

---

## Phase 3: Typing indicator

**User stories**: 4 (see that someone is typing)

### What to build

Anonymous "ktoś pisze…" indicator. Client sends a throttled `{type:"typing"}` event over the WS
while typing; the DO broadcasts it to the other connected users; the indicator (three pulsing dots)
shows above the input with fade in/out and expires ~3s after the last event. No names ever.

### Assumptions carried in

- WS plumbing and `ChatRoom` DO from Phase 2.

### Out of scope for this phase

- Named typers, multi-typer lists, typing in push notifications.

### Acceptance criteria

- [ ] Other connected client sees the indicator within ~1s of typing — [manual: two browsers]
- [ ] Indicator disappears ~3s after typing stops — [manual]
- [ ] Broadcast contains no user identity (anonymous) — [test: broadcast payload test]
- [ ] Never shown to the typist themselves — [manual]

---

## Phase 4: Reactions

**User stories**: 2 (react like in the feed, see who reacted)

### What to build

The same 3 reactions as the feed (heart, laugh, flame — lucide icons from `reaction-config`).
`POST /api/chat/messages/:id/reactions` toggles add/remove in one mutation (UNIQUE
message+user+reaction). UI: reaction row under the bubble — one icon per type, **no counters**,
highlighted when I reacted; pop/bounce (0→1.3→1.0, ~200ms) on add, fade-out on remove; tapping a
reaction shows the who-reacted list (names; `ReactionUsers` pattern). Reaction changes broadcast
over the WS so others see them live.

### Assumptions carried in

- `chat_reactions` table exists since Phase 1's migration; WS event plumbing from Phase 2.

### Out of scope for this phase

- Counters, emoji beyond the 3 feed reactions, moderation of reactions.

### Acceptance criteria

- [ ] Same endpoint adds and removes (toggle) — [test: API test, toggle twice → no row]
- [ ] Duplicate same reaction impossible (UNIQUE respected) — [test: constraint test]
- [ ] Unknown reaction type rejected — [test: API validation test]
- [ ] Own reaction highlighted; no counters rendered — [test: component test]
- [ ] Who-reacted list shows names — [test: component test; manual]
- [ ] Reaction appears live for another connected client — [manual: two browsers]
- [ ] Pop animation on add, fade-out on remove — [manual]

---

## Phase 5: Context menu — Reply / Copy / Info

**User stories**: 3 (reply with quote), 8 (copy text, check date & time)

### What to build

Telegram-style context menu on a bubble, opened by **long-press** (mobile) / **right-click**
(desktop), animated scale+fade; a plain tap does nothing. Items: **Odpowiedz** (sets the reply
context above the input; the server snapshots `reply_text` at POST time and rejects replies to
nonexistent/expired originals), **Kopiuj** (clipboard), **Info** (dialog: author + full send
date/time, PL format). Reply rendering: quote (text only, no author name) above the bubble;
clicking the quote scrolls to the original if it is still alive; expired/deleted originals don't
scroll (the snapshot quote stays).

### Assumptions carried in

- `reply_to_id`/`reply_text` columns exist since Phase 1; reply messages travel as normal messages
  over the Phase 2 WS path.

### Out of scope for this phase

- Delete menu item (Phase 6), editing, quote-of-quote special rendering.

### Acceptance criteria

- [ ] Menu opens on long-press/right-click with scale+fade; plain tap does nothing — [test: component test; manual]
- [ ] Copy places the message text in the clipboard — [manual]
- [ ] Info shows author + full date/time — [test: component test; manual]
- [ ] Reply message renders the quote above its bubble — [test: component test]
- [ ] Server snapshots quoted text; quote survives the original's expiry — [test: domain test]
- [ ] Click quote scrolls to a live original; no scroll for an expired one — [manual]
- [ ] Reply to nonexistent/expired message rejected with 400 — [test: API validation test]

---

## Phase 6: Delete for everyone

**User stories**: 7 (author or admin deletes for everyone)

### What to build

`DELETE /api/chat/messages/:id` — allowed for the **author** or an **admin** only; hard delete of
the message **and its reactions in one query**; a delete event broadcast over the WS so every
connected client removes the bubble with a fade/slide-out animation and the list closes the gap
smoothly. Replies to a deleted message keep their snapshot quotes.

### Assumptions carried in

- Existing user role distinguishes admin; WS event plumbing from Phases 2/4.

### Out of scope for this phase

- "Deleted message" placeholder (hard delete only), undo, admin moderation panel.

### Acceptance criteria

- [ ] Author can delete own message; admin can delete any — [test: API authz tests]
- [ ] Other member's delete attempt rejected without leaking existence — [test: API authz test (403/404)]
- [ ] Reactions removed in the same operation — [test: reactions gone after delete]
- [ ] Connected clients remove the message live with animation, no layout jump — [manual: two browsers]
- [ ] Message absent after reload for everyone — [manual]
- [ ] Replies to the deleted message keep their quotes — [test: snapshot independence]

---

## Phase 7: Expiry cron + push notifications

**User stories**: 5 (push about a new message)

### What to build

Expiry cleanup: hourly cron `7 * * * *` in both environments (the scheduled handler branches by
cron expression alongside the existing 6:00 calendar job); deletes `expires_at < now()` messages
together with their reactions in one query. Push on new chat messages only: recipients = active
push subscribers minus currently-connected users (DO connected set) minus the author; title
**"Nowa wiadomość ze Wspólniaka"**, no message content; per-user throttle (one push per 2 minutes);
deep link to `/app/chat`. Never for reactions or typing.

### Assumptions carried in

- Existing VAPID push fan-out and subscriber store; DO connected-user set from Phase 2.

### Out of scope for this phase

- Push content previews, badges, per-user notification settings.

### Acceptance criteria

- [ ] Cron deletes expired messages + their reactions — [test: scheduled-handler test with a seeded expired row; manual: `wrangler dev --test-scheduled` → `/__scheduled`]
- [ ] `GET` never returns expired rows even before the cron ran — [test: domain test]
- [ ] Non-connected subscriber receives a push with the generic title and deep link — [manual: chat closed on second device]
- [ ] Connected user receives no push for messages they see live — [manual]
- [ ] Author never receives a push for their own message — [test: fan-out exclusion]
- [ ] Second message within 2 minutes → no second push to that user — [test: throttle unit test; manual]
- [ ] No push triggered by reactions or typing — [test: fan-out only on the message path]

---

## Phase 8: Feature flag, navigation, offline, settings

**User stories**: 6 (chat reachable from the app navigation), plus the settings note

### What to build

Ship readiness. Fourth feature flag **`chat`** (default on) with a switch in the admin "Funkcje"
panel (60s-cached, like the others); nav item **"Czat"** in the existing mobile drawer and desktop
sidebar (`MessageSquare`, filled when active — same pattern as Biblioteka/Wideo/Kalendarz), hidden
when the flag is off, with the route guarded the same way; offline banner ("Jesteś offline") with
sending and reactions disabled while offline (reuse the existing online-status component); static
note "Wiadomości na czacie znikają po 24 godzinach" in `/app/settings`; final animation QA sweep
against the PRD animation inventory (send / receive / scroll button / reactions / menu / delete /
typing). Bottom mobile nav bar unchanged.

### Assumptions carried in

- Feature-flag pattern and admin panel section exist (`instance` domain); online-status component
  exists in `src/pwa/`.

### Out of scope for this phase

- Unread badges, per-user prefs, mobile bottom-bar changes.

### Acceptance criteria

- [ ] Flag OFF → nav item hidden and `/app/chat` guarded — [test + manual]
- [ ] Flag switch works in the admin "Funkcje" panel — [manual]
- [ ] Nav item visible with `MessageSquare`, filled when active (mobile drawer + desktop sidebar) — [manual visual]
- [ ] Offline → banner + disabled input/reactions; back online → enabled — [manual: airplane mode]
- [ ] Settings note present on `/app/settings` — [manual]
- [ ] Animation QA checklist from the PRD passes end-to-end — [manual: checklist]
- [ ] Gates green — [command: `pnpm types && pnpm test && pnpm lint`]
