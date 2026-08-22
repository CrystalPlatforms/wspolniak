# PRD: Wspólniak Chat

> Updated after the second `/ask` discovery session (2026-08-21). All open questions are resolved;
> this document reflects the codebase reality (existing mobile drawer, existing cron, no-FK convention)
> and every decision signed off by the client. UI copy stays Polish.

## Overview

Wspólniak Chat is a global, real-time family chat inside the Wspólniak app. It solves the problem of
communication scattered across external messengers by providing a fast, ephemeral contact channel in
the place where the whole family already is.

Animations and motion quality are a **first-class requirement**, not polish: the benchmark is
**Telegram on iOS**. Nothing may appear abruptly.

---

## Problem Statement

The family communicates through different messengers (e.g. WhatsApp), but not everyone is present
there. Wspólniak is the only place where all family members are — yet it lacks a fast channel for
day-to-day contact. Feed posts don't fit this purpose — they are permanent and carry a different
intent.

---

## Users

| User type       | Description                                                       | Estimated count                 |
| --------------- | ----------------------------------------------------------------- | ------------------------------- |
| Family member   | Any logged-in Wspólniak user, mixed tech skills, mobile-first     | All app users                   |

---

## Goals & Success Criteria

- [ ] The family uses Wspólniak chat instead of WhatsApp / other messengers for day-to-day contact
- [ ] Messages are delivered and visible in real time without manual refresh
- [ ] The UX is smooth and polished — benchmark: **Telegram on iOS** (all animations mandatory)

---

## User Stories

1. As a family member I want to send a text message to the whole family, to make quick contact.
2. As a family member I want to react to a message with the same reactions as the feed, and see who reacted.
3. As a family member I want to reply to a specific message with a visible quote, so conversation context stays readable.
4. As a family member I want to see that someone is typing right now, so I know to wait for a reply.
5. As a family member I want a push notification about a new message, so I don't miss contact.
6. As a family member I want to open the chat from anywhere in the app, without interrupting what I'm doing.
7. As an author (or admin) I want to delete a message for everyone, to fix a mistake or remove something sent by accident.
8. As a family member I want to copy a message text and check its exact send date and time.

---

## Scope

### In scope

- One global chat for the whole family at **`/app/chat`** (existing auth middleware)
- Text messages only, **200 characters max**
- Anti-spam: **max 10 messages/minute/user** (counter in the Durable Object)
- **Reactions — same 3 as the feed** (heart, laugh, flame — lucide icons from `reaction-config`, not emoji characters)
  - one mutation toggles add/remove
  - display: one icon per reaction type, **no counters**, highlighted when I reacted
  - tap a reaction → list of **who reacted** (reuse `ReactionUsers` pattern)
- **Reply** with a quote snapshot of the quoted **text only** (no author name)
  - quote shown above the bubble; click scrolls to the original if it's still alive
  - replies survive the original's expiry/deletion (snapshot is independent)
- **Context menu on a bubble** — Reply / Copy / Delete / Info (exact send date & time + author)
- **Delete for everyone** — author of the message **or admin**; hard delete (nothing remains);
  reactions removed in the same query; replies to it stay
- **Expiry: 24h rolling, per message, hard rule** — no exceptions
- **Real-time delivery** via Cloudflare Durable Objects + WebSocket (receive-only broadcast + typing);
  **sending over HTTP** (auth, validation, DB write), then broadcast through the DO
- Optimistic UI: instant bubble + thin progress bar; red bar + retry on error
- Typing indicator — anonymous **"ktoś pisze…"**, expires ~3s after last typing event
- Push notifications for **new messages only** (never reactions, never typing):
  - only to users **not currently connected** to the chat (chat closed), excluding the author
  - generic title **"Nowa wiadomość ze Wspólniaka"** — no message content on the lock screen
  - throttle: after a push to a user, further chat pushes to them are suppressed for **2 minutes**
  - deep link to `/app/chat`
- History load: all messages from the last 24h; **loader + notice when > 50 messages**
- Feature flag **`chat`** (4th, next to `video` / `markdown` / `library`); OFF hides nav item + guards the route
- Offline: "Jesteś offline" banner + disabled sending/reactions (reuse existing online-status component)
- `/app/settings`: static note "Wiadomości na czacie znikają po 24 godzinach"
- Navigation: **add "Czat" to the existing mobile drawer and desktop sidebar** — `MessageSquare` icon,
  filled when active (same pattern as Biblioteka/Wideo/Kalendarz). Bottom mobile nav bar unchanged.

### Out of scope

- 1:1 (private) chats
- Group chats (subgroups)
- Sending photos / media
- Message editing
- Deleting others' messages (only author + admin can delete)
- Admin moderation tooling beyond delete
- Read receipts ("seen by")
- Unread badge / counter
- Pinning messages
- Chat history search

---

## UX & Animations

Benchmark: **Telegram on iOS**. Every state change must be animated. Animations must be fluid,
feel native, and never stutter on mobile devices.

### Sending a message (Optimistic UI)

1. User taps send
2. The message bubble **slides in immediately** (optimistic insert) — no waiting for the server
3. A **thin progress bar** appears under the bubble, animated until the API confirms
4. On confirm: the bar fades out, the message stays — **no layout jump**
5. On error: the bar turns red + retry option

### Incoming messages

- Every new message **slides in from the bottom** — translate + fade, Telegram-style
- Duration ~220ms, easing `ease-out`
- The list auto-scrolls to the bottom if the user is near the end (~last 100px);
  otherwise a "↓ nowe wiadomości" button appears

### Reactions

- On tap: **pop/bounce** (scale 0 → 1.3 → 1.0, ~200ms)
- Removing own reaction: fade out
- One icon per reaction type, no counters; own reaction highlighted
- Tap a reaction → who-reacted list (names)

### Context menu & delete (new)

- Menu opens with a **scale + fade** animation (Telegram-style)
- Deleting: the bubble **fades/slides out** and the list closes the gap smoothly — no abrupt disappearance

### Typing indicator

- Three pulsing dots + "ktoś pisze…" (anonymous — no names)
- Fades in and out; expires ~3s after the last typing event

### General rules

- CSS transitions / Tailwind (`tw-animate-css` is already a dependency) or `framer-motion` for complex sequences
- No animation may block interaction (`pointer-events: auto` while animating)
- Animate `transform` and `opacity` only — never `height`, `width`, `top`, `left` (GPU performance)

---

## System Components

### Stack context

| Layer     | Technology                                                |
| --------- | --------------------------------------------------------- |
| Framework | TanStack Start (SSR + Router + Query)                     |
| API       | Hono on Cloudflare Workers                                |
| Database  | Neon PostgreSQL (serverless, `@neondatabase/serverless`) |
| ORM       | Drizzle ORM                                               |
| Real-time | Cloudflare Durable Objects + WebSocket (Hibernation API)  |
| Push      | Web Push VAPID (existing system)                          |
| Styling   | Tailwind CSS v4 + shadcn/ui + tw-animate-css              |
| Build     | Vite + pnpm                                               |
| Linting   | Biome                                                     |

### Database schema (Neon PostgreSQL + Drizzle)

**No foreign keys** — project convention (as in `bookmarks`, calendar): cascades are done in queries.

**Table `chat_messages`:**

```
id           uuid         PK, default gen_random_uuid()
author_id    uuid         (users.id — no FK)
text         text         NOT NULL, max 200 chars
reply_to_id  uuid         nullable (chat_messages.id — no FK)
reply_text   text         nullable — snapshot of quoted text (author name NOT stored)
created_at   timestamptz  default now()
expires_at   timestamptz  default now() + interval '24 hours'
```

Indexes: `expires_at` (cron cleanup), `created_at` (24h window query).

**Table `chat_reactions`:**

```
id          uuid         PK
message_id  uuid         (chat_messages.id — no FK)
user_id     uuid         (users.id — no FK)
reaction    text         NOT NULL — 'heart' | 'laugh' | 'flame' (same set as feed)
created_at  timestamptz  default now()
UNIQUE (message_id, user_id, reaction)
```

Expired/deleted messages have their reactions removed in the same query.

Migrations: dev `0025`; production applied manually (standard HITL for the second developer).

### API (Hono, behind the existing auth middleware)

```
GET    /api/chat/messages                 — last 24h (filters expires_at > now())
POST   /api/chat/messages                 — send {text ≤ 200, reply_to_id?}
                                            (server snapshots reply_text; validates the original exists & isn't expired)
POST   /api/chat/messages/:id/reactions   — toggle {reaction: heart|laugh|flame}
DELETE /api/chat/messages/:id             — author or admin; hard delete + its reactions
GET    /api/chat/ws                       — WebSocket upgrade (session-cookie auth) → forwarded to DO
```

Rate limiting (10 msg/min/user) is enforced **before** the DB write: the Worker asks the ChatRoom DO
(check-and-increment counter stored in the DO).

### Real-time (Cloudflare Durable Objects + WebSocket)

- Single `ChatRoom` DO instance (`idFromName("global")`) — one family = one room
- **WebSocket Hibernation API** — free Workers plan suffices (SQLite-backed DOs; 100k requests/day;
  hibernating sockets incur no duration charges)
- WebSocket is **receive-only for messages** + sends typing events; sending happens over HTTP POST
- Flow: `POST /api/chat/messages` → validate → write to Neon → Worker broadcasts via DO → DO fans out
- DO tags each socket with the user id — answers "who is currently connected?" for push suppression
- Typing: client sends `{ type: "typing" }` (throttled), DO broadcasts to others, expires ~3s
- Reconnect: client auto-reconnects with backoff; on reconnect it refetches messages (no gaps)

`wrangler.jsonc` additions (both environments):

```jsonc
"durable_objects": { "bindings": [{ "name": "CHAT_ROOM", "class_name": "ChatRoom" }] },
"triggers": { "crons": ["0 6 * * *", "7 * * * *"] }   // hourly expiry cleanup added alongside existing 6:00
```

`ChatRoom` class exported from the Worker entry (`src/server.ts`).

### Navigation

- **Mobile:** existing `MobileSidebar` drawer — add "Czat" nav item (`MessageSquare`, filled when active).
  Bottom `MobileNav` bar unchanged. No new "Witamy!" header (rejected — drawer already exists).
- **Desktop:** existing sidebar — same nav item, same icon behavior.

### Expiry

Hourly cron `7 * * * *` (off the full hour) in **both** dev and production environments, alongside the
existing daily 6:00 calendar cron. Handler deletes `expires_at < now()` messages together with their
reactions in one query. The read path (`GET /api/chat/messages`) always filters by `expires_at > now()`.

### Push notifications

Reuse the existing Web Push VAPID system (`buildPushDeps` / fan-out to subscribers):

- Trigger: new chat message (only)
- Recipients: active push subscribers **not currently connected** to the chat WebSocket, excluding the author
- Title: **"Nowa wiadomość ze Wspólniaka"** — no message content (lock-screen privacy)
- Throttle: one push per user per 2 minutes (subsequent messages suppressed)
- Deep link: `/app/chat`

---

## Implementation Decisions

| Decision                   | Choice                                                    | Rationale                                                                       |
| -------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Chat scope                 | One global chat                                           | Simplicity; the family is one unit                                               |
| Route                      | `/app/chat`                                               | Free auth via existing middleware (all app routes live under `/app`)             |
| Message persistence        | 24h rolling, per message, hard rule                       | Ephemerality distinguishes chat from feed; no exceptions keeps logic simple       |
| Message length             | 200 chars                                                 | Chat = short messages                                                            |
| Anti-spam                  | 10 msg/min/user in the DO                                 | Protects against a stuck key / accidental flood                                  |
| Reactions                  | Same 3 as feed (icons), no counters, who-reacted view      | UX consistency with the feed; toggle in one mutation                             |
| Reply                      | Text-only snapshot quote; click scrolls to original        | Quote survives expiry/deletion of the original                                   |
| Context menu               | Reply / Copy / Delete / Info; long-press (mobile), right-click (desktop) | Telegram pattern; plain tap stays free                          |
| Delete                     | Author + admin, for everyone, hard delete                 | Fix mistakes; no placeholder clutter (ephemeral spirit)                          |
| Foreign keys               | None — cascades in queries                                | Project convention (bookmarks, calendar)                                         |
| Send transport             | HTTP POST; WebSocket receive-only + typing                | Reuses Hono auth/validation; matches optimistic UI progress bar                  |
| Real-time infra            | Durable Objects + WS Hibernation API                      | Native CF tool; free tier sufficient for a family                                |
| Expiry cleanup             | Hourly cron `7 * * * *` (dev + prod)                      | Doesn't burden the read path; cron infra already exists                          |
| Push policy                | Only non-connected users, skip author, generic title      | Avoids spamming an open chat; lock-screen privacy                                |
| Push throttle              | 2 minutes per user                                        | Active conversations don't machine-gun notifications                             |
| Typing indicator           | Anonymous "ktoś pisze…"                                   | Client's choice; simpler than names                                              |
| History load               | All 24h messages; loader + notice when > 50               | Resolved PRD open question                                                       |
| Layout                     | Two-sided Telegram-style; grouped consecutive messages    | Familiar messenger feel; time in every bubble; no day separators                 |
| Animations                 | Telegram on iOS benchmark — mandatory, full inventory     | Motion quality is a first-class requirement                                      |
| Feature flag               | `chat` (4th) in admin "Funkcje" panel                     | Consistent pattern; emergency off-switch                                         |
| Offline                    | Banner + blocked sending/reactions                        | Cheap; queueing rejected (too much work for a 24h chat)                          |
| Expiry info                | Static note in `/app/settings`                            | Sets expectations without cluttering the chat header                             |
| Read receipts              | No                                                        | Reduces social pressure; simpler                                                 |
| Unread badge               | No                                                        | Reduces anxiety; chat is ephemeral by nature                                     |

---

## Validation Strategy

Deploy to production → observe whether the family actually switches from WhatsApp to Wspólniak chat.
Standard rollout: dev environment first, production deploy + migration manually (HITL).

---

## Open Questions

None. All resolved during discovery:

- "A lot of messages" threshold → **50** (resolved 2026-08-21)

---

## References

- Discovery summary: two `/ask` sessions (Polish)
- Main Wspólniak PRD: `./docs/002-prd.md`
- Repo: `github.com/CrystalPlatforms/wspolniak`
- Mobile nav style: existing in-app drawer (`src/components/app/mobile-sidebar.tsx`)
- UX benchmark: Telegram on iOS
