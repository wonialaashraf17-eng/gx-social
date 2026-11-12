# GX Social starter

A beginner-friendly website + PWA foundation for GX Social.

## Included
- Responsive homepage and navigation
- PostgreSQL schema
- Account registration/login with password hashing and HTTP-only JWT cookie
- Video upload and feed (MP4, WebM, MOV)
- Basic report endpoint
- PWA manifest and service worker
- Render deployment blueprint

## Run locally
1. Install Node.js 20+ and PostgreSQL.
2. Create a database and run `schema.sql`.
3. Copy `.env.example` to `.env` and fill in `DATABASE_URL` and a random `JWT_SECRET` of at least 32 characters.
4. Run `npm install`, then `npm start`.
5. Open http://localhost:3000.

## Deploy
Push the project to GitHub and create a Node web service on Render. Set `DATABASE_URL` and `JWT_SECRET` in Render environment variables. Run `schema.sql` once against your PostgreSQL database.

## Important before public launch
This is a starter, not a finished social network. Configure durable object storage for uploaded videos; Render's ordinary local filesystem is not permanent. Production video delivery needs transcoding and adaptive streaming (HLS/DASH) for high resolutions including 4K. AI tools are UI placeholders and are not connected. Live streaming, likes, comments, messaging, search, admin tools, rate limits, moderation workflows, privacy controls and age-appropriate safety protections still need implementation. Do not enable public live streams or open direct messages until effective safety and moderation systems are ready. Set appropriate file-size limits and storage budgets.
