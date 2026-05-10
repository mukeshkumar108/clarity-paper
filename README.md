# Clarity Paper

Clarity Paper is a trust-focused research paper review app. Users upload or paste a paper, Pass 1 extracts structured scientific data, and Pass 2 rewrites that into human editorial prose.

The current frontend also exposes a visible trust layer:

- readable source rendering for uploaded documents
- evidence cards for grounded findings
- click-to-anchor navigation from claims back into source text
- Q&A provenance labels (`[doc]` and `[general]`)

Read these first before changing anything:

1. `AGENTS.md`
2. `ARCHITECTURE.md`
3. `PROMPTS.md`
4. `DECISIONS.md`

## Monorepo layout

- `artifacts/clarity`: Vite React frontend
- `artifacts/api-server`: Express API server
- `lib/db`: Drizzle schema and database access
- `lib/api-client-react`: generated API client/hooks used by the frontend

## Local development

1. Install deps: `pnpm install`
2. Copy envs: `cp .env.example .env`
3. Start Postgres: `docker compose up -d`
4. Push schema: `pnpm --filter @workspace/db push`
5. Seed demo papers if wanted: `pnpm seed:demos`
6. Start app: `pnpm dev`

Frontend runs on `http://localhost:5175`.

## Deployment shape

Use one GitHub repo, not separate frontend/backend repos.

- Frontend: Vercel
- Backend: Railway
- Database: Railway Postgres

This repo is now wired for split deployment:

- Vercel proxies `/api/*` to the Railway backend so auth/session cookies stay same-origin in production.
- Backend uses Postgres-backed sessions via `connect-pg-simple`.
- Backend is deployed on Railway using the repo-root `Dockerfile`.

## Current production status

Deployed and working:

- Vercel frontend is live
- Railway API server is live
- Railway Postgres is attached
- Demo papers are seeded into production
- Login/session persistence works through the Vercel `/api` proxy
- Readable document rendering is live
- Claim-to-source grounding UI is live in the document workspace

Known issue:

- Q&A still needs richer backend provenance payloads; the current UI can display provenance labels and evidence cards, but some answers still rely on best-available heuristic evidence matching

## Vercel setup

Create a Vercel project with root directory:

`artifacts/clarity`

Do not set `VITE_API_BASE_URL` for production when using the Vercel proxy setup.

`artifacts/clarity/vercel.json` is responsible for:

- proxying `/api/*` to Railway
- rewriting all other non-API routes to `index.html` for SPA routing

## Railway setup

Create one Railway project with:

1. A PostgreSQL service
2. A service for this repo using the repo-root `Dockerfile`

Set these backend variables:

- `DATABASE_URL`
- `PORT=8085`
- `NODE_ENV=production`
- `SESSION_SECRET=...`
- `SESSION_COOKIE_NAME=clarity.sid`
- `CORS_ORIGIN=https://YOUR-VERCEL-FRONTEND.vercel.app`
- `OPENROUTER_API_KEY=...`
- `OPENROUTER_STRUCTURED_MODEL=google/gemini-2.5-flash`
- `OPENROUTER_EDITORIAL_MODEL=deepseek/deepseek-v4-pro`
- `OPENROUTER_REVIEW_MODEL=deepseek/deepseek-v4-pro`
- `CLARITY_ENABLE_REVIEW_PASS=true`

After first deploy, run:

1. `pnpm --filter @workspace/db push`
2. `pnpm seed:demos:prod`

against the production environment.

## Verification

Before shipping, run:

- `pnpm typecheck`
- `pnpm build`
- `pnpm --filter @workspace/api-server test`

Then manually test:

- register
- login
- dashboard
- demo paper visibility
- upload
- analysis
- Q&A

If auth appears to succeed but follow-up authenticated API calls return `401`, verify that the frontend is using the Vercel `/api` proxy rather than calling Railway cross-origin directly.
