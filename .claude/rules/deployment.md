# Docker deployment rules

Adapted from the Consologist Accountant deployment guide. Read `DOCKER-DEPLOYMENT.md` before changing
the image, compose stack, or runtime env.

## Image

- Use `node:XX-slim` (Debian), never alpine. Prisma needs glibc + `openssl`.
- Stages: `deps` (`npm ci` + `prisma generate`) → `builder` (`next build`) → `migrator`
  (Prisma CLI + `db push`, one-shot) → `runner` (standalone only, non-root).
- The runtime image must not contain the Prisma CLI, `tsx`, or the full `node_modules`.
- `next.config.ts` keeps `output: "standalone"`. The runner copies `public`,
  `.next/static`, `prisma/`, `prisma.config.ts`, and `src/generated`.
- Healthcheck must use `node -e "fetch(...)"`; Debian slim has no `wget`.

## Build-time environment

Next imports server modules during build. Keep placeholder `DATABASE_URL`, `JWT_SECRET`, and
`APP_URL` in the builder stage. Never bake real secrets into the image or pass them as build args.
`NEXT_PUBLIC_*` is not used by this app; do not introduce build-time public vars without documenting
that they must be build args.

## Runtime environment

- Compose passes runtime settings through the app's `environment` block. Supply values
  through the gitignored `.env.docker` file locally or Portainer's stack settings.
- `.env.example`, `.env.docker.example`, and `docker-compose.yml` must list every variable
  (backend rule: update all locations).
- Postgres credentials are immutable once the volume exists — document it, never "fix" it by
  changing env vars.
- Use `APP_URL`, never `request.nextUrl.origin`, for redirects behind a proxy.

## Migrations and data

- The project is in **development stage**: no migration history. The `migrate` service runs
  `prisma db push`; the app waits for `service_completed_successfully`.
- Before the first production/finalized deployment, generate a baseline migration chain and switch
  the service to `prisma migrate deploy`. Until then, do not add migration files.
- Backup files live in `/app/backups`; keep the `backup_data` volume mounted or filesystem
  backups are lost on redeploy.

## Cron

- Background work is triggered over HTTP with `CRON_SECRET`:
  `/api/cron/due-alerts` (15 min) and `/api/cron/backups` (hourly).
- Cron containers call the app by service name (`http://app:3000`), never the public domain.

## Verification before shipping a Docker change

1. `npm run build` with placeholder env succeeds.
2. `docker compose --env-file .env.docker config` resolves.
3. Blank database + `prisma db push` succeeds.
4. Standalone `node server.js` serves `/api/health` 200, `/login` 200, `/api/mcp` 401 without a key.
5. Update `DOCKER-DEPLOYMENT.md` when services, ports, env vars, or cron change.
