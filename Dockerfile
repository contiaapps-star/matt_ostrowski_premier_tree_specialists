# syntax=docker/dockerfile:1.7

# ---------- Stage 1: builder (also used as dev base) ----------
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
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./

RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.json biome.json vitest.config.ts drizzle.config.ts ./
COPY app ./app
COPY scripts ./scripts
COPY tests ./tests

RUN npm run build

# ---------- Stage 2: runtime (production) ----------
FROM node:20-slim AS runtime

ENV NODE_ENV=production
WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./

RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
    && npm cache clean --force

COPY --from=builder /workspace/dist ./dist

RUN mkdir -p /data && chown -R node:node /data /workspace

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:5000/health || exit 1

CMD ["node", "dist/server.js"]
