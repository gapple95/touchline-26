# syntax=docker/dockerfile:1.7

FROM node:22.13.1-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22.13.1-bookworm-slim AS builder
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22.13.1-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs appuser

COPY --from=builder --chown=appuser:nodejs /app/dist/standalone ./

USER appuser
EXPOSE 3000

CMD ["node", "server.js"]
