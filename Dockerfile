# =============================================================================
#  RentRewards — production image
#
#  Multi-stage so the shipped layer carries the built application rather than
#  the toolchain that built it. The runtime still keeps drizzle-kit and tsx,
#  because the container applies the schema and seeds the demo data on first
#  start — a demo that needs a second manual step is a demo that does not get
#  run.
#
#  Build:  docker build -t rentrewards .
#  Run:    docker compose up          (brings up PostgreSQL alongside)
# =============================================================================

# --- 1. Dependencies ---------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# Next.js's own Docker example adds this on Alpine: some of its binaries expect
# glibc symbols that musl does not provide. Cheap insurance.
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
# `npm ci` for a reproducible tree: the recipient gets the versions that were
# tested, not whatever resolves on the day they build.
RUN npm ci --no-audit --no-fund

# --- 2. Build ----------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build only needs a syntactically valid URL; it never connects.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV AUTH_SECRET="build-time-placeholder-not-used-at-runtime"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- 3. Runtime --------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src ./src
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Run as the image's own unprivileged user rather than root.
RUN chown -R node:node /app
USER node

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
