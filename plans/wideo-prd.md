# PRD: Wspólniak Wideo

## Overview

The `/video` tab lets family members upload and watch videos inside their private Wspólniak instance. Videos are stored on a dedicated YouTube channel (unlisted) and played back through an iframe embed directly in the app.

## Problem Statement

The family wants to share video recordings in the same closed space as photos and posts — without external messengers, without each member creating a YouTube account, and without making videos public.

## Users

| User type | Description | Volume |
|-----------|-------------|---------|
| Family member | Watches and uploads videos | all instance users |
| Admin | Same as above + can delete any video | 1 per instance |

## Goals & Success Criteria

- [ ] A family member can upload a video from phone or computer without creating a YouTube account
- [ ] The video appears in the `/video` feed after upload completes
- [ ] The video can be watched directly in the app (iframe)
- [ ] The video can be attached to a post in the main feed
- [ ] Author or admin can delete a video (from Wspólniak and from YouTube)
- [ ] Upload shows a visible progress bar
- [ ] The daily limit of 3 videos is enforced by both UI and backend

## User Stories

1. As a family member, I want to upload a birthday video so the rest of the family can watch it in the app without leaving for YouTube.
2. As a family member, I want to see all family videos in one place, sorted newest first.
3. As an admin, I want to connect the family YouTube account once, so that uploads work afterwards without me touching it again.
4. As a family member, I want to see a progress bar while a large video uploads, so I know it's working and roughly how long is left.
5. As a family member, I want to upload a 2 GB video from my phone, so I'm not limited to short clips.
6. As a family member, I want to watch a video right inside the app, so I don't get sent out to YouTube.
7. As a post author, I want to attach a video to a feed post so it shows alongside the description.
8. As a post author, I want attached videos to appear in the order I added them, so the post reads naturally.
9. As an author, I want to delete a video I uploaded by mistake — so it disappears from both Wspólniak and YouTube.
10. As an admin, I want to be able to delete any video in the instance.
11. As a family member trying a 4th upload, I want to be clearly told the daily limit is reached, so I know to try tomorrow.
12. As a family member, I want only our family to see the videos (unlisted on YouTube), so they stay private.

## Scope

### In scope

- New `/video` tab with a chronological video feed
- Video upload: browser → Worker (chunked, ≤ ~90 MB chunks) → YouTube Resumable Upload API
- The Worker initiates the resumable session (OAuth token held server-side) and proxies each chunk to YouTube
- Upload progress bar (advances per chunk on the client)
- Formats: MP4, MOV and others supported by YouTube
- Limit: max 3 videos/day per instance (hard cap in UI + backend validation), resets at midnight UTC
- Size limit: max 2 GB per file
- Metadata: title (required) + description (optional)
- Playback: YouTube iframe embed, responsive, mobile-first
- Feed: thumbnail + title + author + date, infinite scroll or pagination
- Post integration: attach one or more videos from `/video` to a post in the main feed; order = order of addition (`position` column)
- Deletion: author or admin — deletes the Neon record + deletes the video from YouTube via API
- YouTube visibility: all videos unlisted (not publicly indexed)
- Instance authorization: one-time OAuth2 authorization by the admin, refresh token stored in the DB (instance settings)
- Admin panel screen to connect/disconnect YouTube and view connection status

### Out of scope

- Comments on videos
- Reactions on videos
- Push notifications on new video upload
- In-app editing / trimming of videos
- Multiple YouTube accounts per instance
- Automatic video expiry
- Downloading videos as a file

## System Components

```
[Browser]
    │
    ├─► POST /api/video/upload-session  →  [Worker/Hono]
    │       Worker checks the daily limit (3/day, reset midnight UTC)
    │       Worker mints an OAuth access token from the stored refresh token
    │       Worker starts a YouTube Resumable Upload session server-side
    │       Returns: resumable session URL
    │
    ├─► PUT /api/video/upload-chunk  (repeated, ≤ ~90 MB each)  →  [Worker/Hono]
    │       Browser streams each chunk to the Worker
    │       Worker forwards the chunk to the YouTube session URL (server-to-server, no CORS)
    │       Progress bar advances per chunk
    │       The final chunk's response carries the youtube_video_id
    │
    └─► POST /api/video/confirm  →  [Worker/Hono]
            Browser sends: youtube_video_id + title + description
            Worker writes the Neon record: id, youtube_video_id, title, description, author_id, created_at
            Worker fetches the thumbnail URL from the YouTube API
            Returns: full video object for the feed

[Neon PostgreSQL]
    Table: videos
    ┌─────────────────┬──────────────────┐
    │ id              │ text PK          │
    │ youtube_video_id│ text unique      │
    │ title           │ text             │
    │ description     │ text null        │
    │ author_id       │ text FK          │
    │ thumbnail_url   │ text             │
    │ created_at      │ timestamp        │
    └─────────────────┴──────────────────┘

    Table: post_videos (N:M posts ↔ videos)
    ┌──────────────┬──────────┐
    │ post_id      │ text FK  │
    │ video_id     │ text FK  │
    │ position     │ int      │   ← order of addition to the post
    └──────────────┴──────────┘

    Instance settings (existing instance domain), new columns:
    ┌────────────────────────┬──────────────┐
    │ youtube_channel_id     │ text null    │
    │ youtube_refresh_token  │ text null    │   ← encrypted at rest
    │ youtube_connected_at   │ timestamp    │
    │ youtube_connected_by   │ text FK null │
    └────────────────────────┴──────────────┘

[YouTube]
    Admin's channel (dedicated "Wspólniak Wideo")
    All videos: unlisted
    Authorization: OAuth2, refresh token per instance (app in Production status → long-lived)
```

## Functional Components

Deep modules — small interfaces hiding large implementations. Risk-heavy logic is enclosed behind narrow boundaries.

### `youtube` — YouTube integration (deepest module)
All Google/YouTube communication behind a narrow interface:
- `connectWithCode(code)` — exchange the OAuth code for tokens, discover the channel
- `startUploadSession(size)` → `uploadChunk(sessionUrl, data, range)` — the resumable protocol
- `getVideo(id)` / `deleteVideo(id)` / `getOwnChannel()`

Hides: OAuth flow, refresh-token persistence + encryption, the resumable protocol, chunking, API error mapping, quota handling. The rest of the app never touches Google.

### `videos` — database domain
- Tables `videos` + `post_videos` (with a `position` column)
- Queries: create / get / list (paginated) / delete, `countTodayUTC()` for the daily limit, attach / list-for-post

Hides: pagination, joins, daily-limit computation.

### YouTube connection (instance config)
The fields `youtube_channel_id`, `youtube_refresh_token`, `youtube_connected_at`, `youtube_connected_by` live on the existing `instance` domain; the token logic (encryption / refresh) lives in the `youtube` module, keeping `instance`'s interface narrow (settings CRUD only).

### API endpoints — thin wrappers
`POST /upload-session`, `PUT /upload-chunk`, `POST /confirm`, `DELETE /:id`, plus `GET /oauth/start` and `GET /oauth/callback`. Each only validates input, calls a module, and maps errors.

### `useVideoUpload` — frontend hook
Client-side chunked-upload logic: splits the file into ≤ ~90 MB chunks, sends them, drives the progress bar, and retries on interruption. Interface: `uploadFile(file, { onProgress })`.

### Frontend
The `/video` tab (feed + upload + iframe player), the YouTube connection screen in the admin panel, and a video picker in the post composer.

## Implementation Decisions

| Decision | Choice | Rationale |
|---------|--------|-----------|
| Upload path | Browser → Worker (chunked) → YouTube | The browser cannot upload directly to YouTube (no CORS on the upload endpoint); Workers has a 100 MB request limit, so the Worker proxies the resumable session in ≤ ~90 MB chunks |
| Video storage | YouTube (unlisted) | Free CDN, proven infra, no storage cost on the Wspólniak side |
| OAuth token lifetime | App published to Production status (unverified) | In Testing status Google expires refresh tokens after 7 days; in Production status tokens are long-lived even without verification. Admin clicks through the "unverified app" warning once |
| Daily limit | 3 videos per instance | YouTube Data API quota: 10,000 units/day, upload = 1,600 units; 3 videos = 4,800 units (safe margin) |
| Daily limit reset | Midnight UTC | Simplest in code (date-based); resets at 02:00 PL time |
| Size limit | 2 GB | YouTube accepts up to 256 GB; upload goes through the Worker in chunks, bypassing the 100 MB request limit |
| Retention | Permanent | Videos treated like albums — no automatic deletion |
| Playback | YouTube iframe embed | Zero CDN cost, native mobile, no custom player to maintain |
| Metadata | Title + description | Enough for the family use case; no comments or reactions |
| Channel configuration | Admin panel (DB instance settings) | `youtube_channel_id` auto-discovered from OAuth (`channels.list?mine=true`); refresh token stored encrypted. Avoids env-file config |
| Video order in a post | Order of addition (`position` column) | Author controls the sequence of attached videos |
| Push notifications | None for new videos | Product decision — not every upload warrants an alert |

## Validation Strategy

No formal user testing — the project owner verifies on production:
1. Upload from a phone (iOS + Android) succeeds and the video appears in the feed
2. The video is visible as unlisted on YouTube (does not appear in search results)
3. The daily limit of 3 videos is enforced (4th attempt blocked), resets at midnight UTC
4. Deletion by the author removes the video from both places
5. A video attached to a post displays correctly in the main feed

## Validation Criteria

Per-component acceptance criteria. The `videos` domain and the `useVideoUpload` hook are verified informally (see Validation Strategy); the formal criteria below cover the two modules that touch external boundaries.

### `youtube` integration
- [ ] `connectWithCode` persists a working refresh token and channel id; the token does NOT expire after 7 days (app in Production status)
- [ ] `refreshAccessToken` returns a fresh access token from the stored refresh token
- [ ] `startUploadSession` returns a valid resumable session URL (server-initiated, OAuth token held server-side)
- [ ] A full file uploaded via repeated `uploadChunk` calls produces one playable unlisted video on YouTube
- [ ] `deleteVideo` removes the video from YouTube (confirmed by `getVideo` returning not-found)
- [ ] API errors (401 / 403 / quota) are mapped to typed `AppError`s, never leaked raw

### API endpoints
- [ ] `POST /upload-session` rejects when the daily limit (3/day, UTC reset) is reached, before any YouTube call is made
- [ ] `PUT /upload-chunk` forwards exactly one chunk per request and returns cumulative progress; the final chunk returns the `youtube_video_id`
- [ ] `POST /confirm` writes the Neon record and returns the video with a thumbnail
- [ ] `DELETE /:id` succeeds only for the author or admin, and deletes both the Neon record and the YouTube video
- [ ] `GET /oauth/start` → consent → `GET /oauth/callback` round-trip stores the connection and redirects to the admin panel
- [ ] All endpoints require an authenticated session; unauthenticated requests are rejected

## Open Questions

None material. Remaining items are implementation details for `/blueprint`:
- Exact resumable chunk size (≈ 90 MB, tuned below the 100 MB Worker limit)
- Encryption mechanism for the refresh token at rest
- Location/placement of the YouTube connection screen in the admin panel

## References

- Discovery summary: `/ask` session (2026-07-23) — resolved the YouTube OAuth 7-day expiry (Production status) and the browser-direct CORS upload blocker (Worker-proxied chunks)
- Repo: https://github.com/CrystalGamesStudio/wspolniak
- YouTube Resumable Upload API: https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
- YouTube Data API quota: https://developers.google.com/youtube/v3/getting-started#quota
- Google OAuth refresh token 7-day expiry (Testing vs Production): https://developers.google.com/identity/protocols/oauth2
- Restricted scope verification (why we stay unverified in Production): https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
