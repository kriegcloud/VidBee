FROM node:22-alpine AS builder

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
ENV HUSKY=0

COPY --from=oven/bun:1.4.4-alpine /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app

# Bun checks the whole workspace against bun.lock, so every manifest is copied.
COPY bun.lock bunfig.toml package.json ./
COPY patches patches
COPY apps/api/package.json apps/api/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/extension/package.json apps/extension/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/browser-capture/package.json packages/browser-capture/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/downloader-core/package.json packages/downloader-core/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/logger/package.json packages/logger/package.json
COPY packages/subscriptions-core/package.json packages/subscriptions-core/package.json
COPY packages/task-queue/package.json packages/task-queue/package.json
COPY packages/transcription/package.json packages/transcription/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN bun install --filter ./apps/web --frozen-lockfile --ignore-scripts

COPY apps/web apps/web
COPY packages/downloader-core packages/downloader-core
COPY packages/i18n packages/i18n
COPY packages/logger packages/logger
COPY packages/subscriptions-core packages/subscriptions-core
COPY packages/task-queue packages/task-queue
COPY packages/db packages/db
COPY packages/ui packages/ui

RUN bun run --cwd apps/web build
RUN mkdir -p /prod/web/node_modules/@vidbee \
  && cp -RL packages/logger /prod/web/node_modules/@vidbee/logger \
  && cp -RL node_modules/evlog /prod/web/node_modules/evlog

FROM node:22-alpine AS runner

ENV NODE_ENV=production
ENV VIDBEE_API_URL_INTERNAL=http://api:3100
ENV VIDBEE_WEB_HOST=0.0.0.0
ENV VIDBEE_WEB_PORT=3000

WORKDIR /app

COPY --from=builder --chown=node:node /app/apps/web/dist ./dist
COPY --from=builder --chown=node:node /app/apps/web/server.mjs ./server.mjs
COPY --from=builder --chown=node:node /prod/web/node_modules ./node_modules

USER node

EXPOSE 3000

CMD ["node", "server.mjs"]
