# Consologist TMS — Docker deployment (development stage)

> No migration history yet: the `migrate` service runs `prisma db push`. Create a baseline
> migration chain before the first production deployment.

Adapted from the Consologist Accountant deployment guide and the failures it records.

## Quick start

```bash
cd app
cp .env.docker.example .env.docker      # fill in secrets
docker compose --env-file .env.docker up -d --build
```

Open `http://localhost:3200` (host port 3200 → container 3000). First user registers at `/register`
and creates the workspace; there is no seed script.

Services:

| Service | Purpose |
|---|---|
| `postgres` | PostgreSQL 16, named volume `pg_data` |
| `migrate` | One-shot `prisma db push` (development); app waits for it to succeed |
| `app` | Next.js standalone server (runtime image, non-root, healthcheck) |
| `cron-alerts` | Every 15 min → `GET /api/cron/due-alerts` with `CRON_SECRET` |
| `cron-backups` | Hourly → `GET /api/cron/backups` (app decides what is due) |

Volumes: `pg_data` (database), `backup_data` (`/app/backups`, filesystem backup destination).

## Required environment

For a Portainer Git stack, enter the variables below in the stack's environment settings.
For local Docker runs, keep the values in the gitignored `.env.docker` file.

| Variable | Required | Notes |
|---|---|---|
| `POSTGRES_PASSWORD` | yes | Immutable after first start on a non-empty volume |
| `POSTGRES_USER` / `POSTGRES_DB` | no | Defaults `consologist` / `consologist_tms` |
| `JWT_SECRET` | yes | `openssl rand -hex 32` |
| `APP_URL` | yes | Public URL; used for Drive OAuth and email links |
| `CRON_SECRET` | yes | Bearer token for both cron endpoints |
| `BACKUP_SCHEDULE_PASSWORD` | for scheduled backups | ≥ 8 chars |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | email | Verified sender domain required |
| `GOOGLE_DRIVE_CLIENT_ID/SECRET/ENCRYPTION_KEY`, `GOOGLE_DRIVE_REDIRECT_URI` | file uploads | Redirect URI must be `{APP_URL}/api/google-drive/callback` |
| `GOOGLE_CLIENT_ID/SECRET` | optional | Google login |

`NEXT_PUBLIC_*` is not used by this app, so there are no build-time public args to pass.

## Image design

- `node:24-slim` (Debian), not alpine — Prisma needs glibc + `openssl`.
- Four stages: `deps` (npm ci + `prisma generate`) → `builder` (`next build`) → `migrator`
  (keeps Prisma CLI, pushes the schema, never serves traffic) → `runner` (standalone bundle only).
- Build placeholders (`DATABASE_URL`, `JWT_SECRET`, `APP_URL`) exist only so Next can import
  server modules. Compose passes the real values to the container at runtime.
- Runtime image runs as `nextjs` (uid 1001) under `tini`; healthcheck uses `fetch()` against
  `/api/health` because Debian slim has no `wget`.
- `docker-entrypoint.sh` only starts `node server.js`; migrations are a separate one-shot service.

## Reverse proxy

Forward to the **container** port 3000 (not the host mapping 3200), scheme `http`.
Register `https://your-domain/api/google-drive/callback` in Google Cloud Console.

## MCP

- **HTTP MCP** is part of the app: `POST/GET /api/mcp`, authenticated with a workspace MCP key
  (`x-api-key`). No extra container needed.
- **stdio MCP** is not shipped in the runtime image (no `tsx`). Run it from a checkout, or use HTTP.

## Updating

```bash
git pull
docker compose --env-file .env.docker up -d --build
```

`migrate` pushes the schema again; the app restarts after it succeeds. Postgres credentials do not change.

## Verification checklist

- [ ] `docker compose --env-file .env.docker ps` → postgres healthy, app healthy, migrate exited 0
- [ ] `curl -fsS http://localhost:3200/api/health` → `{"status":"healthy"}`
- [ ] `/register` creates the first workspace
- [ ] Login, create a project, task, document
- [ ] MCP: create a key in My Account → `curl -H "x-api-key: …" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' https://domain/api/mcp`
- [ ] Cron: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3200/api/cron/due-alerts`
- [ ] Backup: create one in Manage System → Backups; check `backup_data` volume
- [ ] Drive: connect, upload a task attachment

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find module 'effect'` / Prisma CLI errors in migrator | Cherry-picked node_modules | Keep the full `node_modules` copy in the migrator stage |
| `#!/bin/sh\r: not found` | CRLF script | `.gitattributes` + `sed -i 's/\r$//'` in Dockerfile |
| `JWT_SECRET is required` during build | Server module import at build time | Keep builder placeholder env |
| Redirect to `0.0.0.0:3000` | `request.nextUrl.origin` behind proxy | Use `APP_URL` (already used in Drive OAuth) |
| `password authentication failed` | PG creds changed after first start | Recreate the `pg_data` volume (destroys data) |
| 502 from proxy | Forwarding to host port | Forward to container port 3000 |
| Healthcheck failing | DB not reachable | Check `DATABASE_URL`, postgres health, migrate exit code |
| File upload 413 | Body limit | `next.config.ts` server-action limit is 150 MB; proxy must allow it |
| MCP 401 | Missing/revoked key | Create a new key in My Account → MCP access |
