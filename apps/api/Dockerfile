FROM node:22-alpine AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=/opt/vidbee-media-tools/bin:${PNPM_HOME}:${PATH}
ENV YTDLP_PATH=/opt/vidbee-media-tools/bin/yt-dlp
ENV GALLERY_DL_PATH=/opt/vidbee-media-tools/bin/gallery-dl

RUN apk add --no-cache python3 py3-pip make g++

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
ENV HUSKY=0

RUN corepack enable

WORKDIR /app

COPY vendor/yt-dlp vendor/yt-dlp

WORKDIR /app/vendor/yt-dlp

RUN python3 devscripts/make_lazy_extractors.py \
  && python3 -m venv /opt/vidbee-media-tools \
  && /opt/vidbee-media-tools/bin/pip install --no-cache-dir \
  ".[pin,pin-curl-cffi]" "https://codeberg.org/mikf/gallery-dl/archive/f93159c24ed0e26a141ff823a0ee3bd4587489a0.tar.gz" \
  && "${YTDLP_PATH}" --version \
  && "${YTDLP_PATH}" --list-impersonate-targets | grep -Eq '^Chrome-' \
  && "${GALLERY_DL_PATH}" --version

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/downloader-core/package.json packages/downloader-core/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/logger/package.json packages/logger/package.json
COPY packages/subscriptions-core/package.json packages/subscriptions-core/package.json
COPY packages/task-queue/package.json packages/task-queue/package.json
COPY packages/transcription/package.json packages/transcription/package.json

RUN pnpm install --filter "{./apps/api}..." --frozen-lockfile

COPY apps/api apps/api
COPY apps/desktop/resources/gallery-dl-extractors apps/desktop/resources/gallery-dl-extractors
COPY packages/db packages/db
COPY packages/downloader-core packages/downloader-core
COPY packages/i18n packages/i18n
COPY packages/logger packages/logger
COPY packages/subscriptions-core packages/subscriptions-core
COPY packages/task-queue packages/task-queue
COPY packages/transcription packages/transcription

RUN pnpm --filter ./apps/api run build
RUN pnpm --filter ./apps/api deploy --prod --legacy /prod/api

FROM node:22-alpine AS runner

ENV PATH=/opt/vidbee-media-tools/bin:${PATH}
ENV YTDLP_PATH=/opt/vidbee-media-tools/bin/yt-dlp
ENV GALLERY_DL_PATH=/opt/vidbee-media-tools/bin/gallery-dl
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV VIDBEE_API_HOST=0.0.0.0
ENV VIDBEE_API_PORT=3100
ENV VIDBEE_DOWNLOAD_DIR=/data/downloads
ENV VIDBEE_DATA_DIR=/data/vidbee
ENV VIDBEE_GALLERY_EXTRACTORS_DIR=/app/resources/gallery-dl-extractors
ENV VIDBEE_MIGRATIONS_DIR=/app/resources/drizzle
ENV VIDBEE_PERSIST_QUEUE=1

RUN apk add --no-cache python3 ffmpeg

WORKDIR /app

COPY --from=builder --chown=node:node /prod/api/node_modules ./node_modules
COPY --from=builder /opt/vidbee-media-tools /opt/vidbee-media-tools
COPY --from=builder --chown=node:node /app/apps/api/dist ./dist
COPY --chown=node:node apps/desktop/resources/gallery-dl-extractors ./resources/gallery-dl-extractors
COPY --chown=node:node apps/desktop/resources/drizzle ./resources/drizzle

RUN "${YTDLP_PATH}" --version \
  && "${YTDLP_PATH}" --list-impersonate-targets | grep -Eq '^Chrome-' \
  && "${GALLERY_DL_PATH}" --version

RUN mkdir -p /data/downloads /data/vidbee && chown -R node:node /data/downloads /data/vidbee

USER node

EXPOSE 3100
VOLUME ["/data/downloads", "/data/vidbee"]

CMD ["sh", "-c", "node dist/migrate-history.js && exec node dist/index.js"]
