# CrossPost Pro (Instagram/TikTok -> Facebook Page Automation)

Node.js web app for selling a cross-posting automation service.

## What this app includes

- Public website with pricing cards
- Customer auth (register/login)
- Customer dashboard
- Automation job setup with:
  - source platform (Instagram/TikTok)
  - source profile URL
  - Facebook user token input
  - Facebook page selection (fetches all manageable pages from token)
- Daily automation engine:
  - starts from oldest source video
  - uploads one video every 24 hours
  - keeps source title/description
  - deletes temporary downloaded file after upload
- Admin dashboard
- Admin plan creation/editing
- Admin manual subscription assignment to customers

## Tech

- Express + EJS
- SQLite (`better-sqlite3`)
- Scheduler: `node-cron`
- Downloader: `youtube-dl-exec` (uses yt-dlp engine)
- Facebook Graph API upload via `axios`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env and edit:

```bash
copy .env.example .env
```

3. Start app:

```bash
npm start
```

4. Open:

`http://localhost:3000`

## Default admin

On first run, admin user is auto-created from env values:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Use these to login at `/login` and access `/admin`.

## Required permissions for Facebook token

User token must be generated for your app with page permissions needed for posting video to page.
Typically includes page management/posting scopes according to your Graph API app configuration.

## Workflow details

When a customer creates a job:

1. Source URL is scanned for videos.
2. Videos are sorted oldest -> newest.
3. Job posts video at `next_media_index`.
4. After success, index increments by 1 and next run is set for +24h.
5. Downloaded file is deleted immediately after upload.

Scheduler checks due jobs every minute by default (`SCHEDULER_CRON` in `.env`).

If no new videos are found, job remains active and checks again later.

## Notes

- Store tokens securely for production. This sample stores them in SQLite for functionality.
- For production, add encryption-at-rest and CSRF protection.
- If downloader fails, install latest `yt-dlp` binary and ensure it is available in PATH.
