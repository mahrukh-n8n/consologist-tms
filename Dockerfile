# syntax=docker/dockerfile:1
# ============================================
# Consologist TMS — production image
#
# Debian slim (not alpine): Prisma needs glibc + openssl.
# Stages: deps → builder → migrator (one-shot) → runner (runtime only).
# ============================================

# ---------- Stage 1: dependencies + Prisma client ----------
FROM node:24-slim AS deps
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

# ---------- Stage 2: Next.js build ----------
FROM node:24-slim AS builder
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=3072"

# Placeholders only: Next imports server modules at build time. Real values are
# supplied at runtime by docker-compose/.env.docker.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV JWT_SECRET="build-time-placeholder-not-used-at-runtime"
ENV APP_URL="http://localhost:3000"

RUN mkdir -p public && npm run build

# ---------- Stage 3: migrator (one-shot, keeps Prisma CLI) ----------
FROM node:24-slim AS migrator
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/docker-migrate.sh ./docker-migrate.sh
RUN sed -i 's/\r$//' ./docker-migrate.sh && chmod +x ./docker-migrate.sh

CMD ["sh", "docker-migrate.sh"]

# ---------- Stage 4: runtime ----------
FROM node:24-slim AS runner
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000
ENV NODE_OPTIONS="--max-old-space-size=2048"

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
RUN mkdir -p .next && chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma runtime files (schema is small; generated client lives in the bundle).
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated

COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

RUN mkdir -p /app/backups && chown nextjs:nodejs /app/backups

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "docker-entrypoint.sh"]
