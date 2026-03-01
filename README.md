# SMM Cross Automation

Node.js platform for running Instagram/TikTok/YouTube -> Facebook page automation with token-based billing.

## What is included

- Public landing page with branding for **SMM Cross Automation**
- Customer auth (register/login)
- Customer dashboard with:
  - token balance
  - automation jobs
  - logs
  - payment request history
- Token wallet workflow:
  - user pays through Easypaisa
  - user submits payment request with transaction reference
  - admin approves/rejects
  - approved requests credit user tokens
  - every successful upload consumes 1 token
- Admin dashboard with:
  - pending payment approvals
  - token credit/debit controls
  - customer and job visibility
- Automation engine:
  - oldest-to-newest source posting
  - scheduled checks via cron
  - Facebook page video upload support

## Tech

- Express + EJS
- SQLite (`better-sqlite3`)
- Scheduler: `node-cron`
- Source extraction/downloading: `youtube-dl-exec` / `yt-dlp`
- Facebook Graph API upload via `axios`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env and edit values:

```bash
copy .env.example .env
```

3. Start app:

```bash
npm start
```

4. Open:

`http://localhost:3000`

## Required env values

- `APP_NAME` (default: `SMM Cross Automation`)
- `EASYPAISA_NUMBER` (default: `+923053120875`)
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`

## Default admin

Admin user is auto-created from env:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

## Payment flow

1. User sends Easypaisa payment to configured number.
2. User submits amount + transaction reference from `/dashboard/payments`.
3. Admin reviews from `/admin/payments`.
4. On approval, tokens are credited and logged in `token_ledger`.

## Notes

- This project stores tokens and access details in SQLite for MVP use.
- For production, add encryption-at-rest, stricter audit logs, rate limits, and CSRF protection.
- Ensure your Facebook app permissions are valid for page video publishing.
- Ensure `yt-dlp` is installed and reachable by `YTDLP_BINARY` if auto-discovery fails.
