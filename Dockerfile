# ─────────────────────────────────────────────────────────────
# WorkersArena — multi-stage Docker build
# ─────────────────────────────────────────────────────────────

# 1) Dependencies
FROM node:22-alpine AS deps
WORKDIR /app
# npm >= 11 honors the scoped security overrides in package.json, and the
# lockfile was written by npm 12 (Node 22 bundles npm 10, which rejects it).
# No `npm install` fallback: it would silently drop those overrides.
RUN npm install -g npm@12.0.2
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# 2) Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# 3) Runtime (standalone)
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
