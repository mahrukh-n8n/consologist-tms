# Consologist TMS (Task Management System)

> **Status: DEVELOPMENT.** This project is under active development. There is no
> production database or migration history yet — the schema is applied with
> `prisma db push`. Migration files will be introduced when the project is
> finalized and ready for its first real deployment.

Next.js 16 + React 19 + Prisma/Postgres task management app with RBAC, approvals,
audit, Google Drive files, encrypted backups, email alerts, and an MCP server
(stdio + Streamable HTTP) that shares the same gatekeepers as the GUI.

## Local development

```bash
npm install
npx prisma generate
npm run db:push        # development schema sync
npm run dev
```

## Docker (development stack)

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up -d --build
```

The `migrate` service runs `prisma db push`. See `DOCKER-DEPLOYMENT.md`.

## MCP

- HTTP: `POST /api/mcp` with `x-api-key` (create a key in My Account → MCP access).
- stdio: `npm run mcp` with `MCP_API_KEY` and `MCP_COMPANY_ID`.
