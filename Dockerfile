# syntax=docker/dockerfile:1.7

# ----------- Stage 1: deps (production dependencies only) -----------
FROM node:20-slim AS deps

ENV NODE_ENV=production
WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        python3 \
        make \
        g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./

RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
    && npm cache clean --force

# ----------- Stage 2: builder (full deps + TS + Tailwind compile) -----------
FROM node:20-slim AS builder

ENV NODE_ENV=development
WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        python3 \
        make \
        g++ \
        sqlite3 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./

RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.json biome.json vitest.config.ts drizzle.config.ts tailwind.config.js ./
COPY app ./app
COPY scripts ./scripts
COPY tests ./tests
COPY public ./public

RUN npm run build:css \
    && npm run build

# ----------- Stage 3: runtime (production) -----------
FROM node:20-slim AS runtime

ENV NODE_ENV=production \
    PORT=5000

WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        sqlite3 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r app && useradd -r -g app -u 1001 app

# Production node_modules from the deps stage (no dev deps).
COPY --from=deps /workspace/node_modules ./node_modules
# Compiled JS + assets from the builder stage.
COPY --from=builder /workspace/dist ./dist
COPY --from=builder /workspace/public ./public
COPY --from=builder /workspace/app/db/migrations ./app/db/migrations
COPY package.json package-lock.json* ./
COPY scripts/backup.sh ./scripts/backup.sh

RUN chmod +x ./scripts/backup.sh \
    && mkdir -p /data /backups \
    && chown -R app:app /data /backups /workspace

USER app

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -fsS http://localhost:5000/health || exit 1

CMD ["node", "dist/server.js"]
