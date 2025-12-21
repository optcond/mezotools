# syntax=docker/dockerfile:1

FROM node:20-slim AS builder

WORKDIR /app

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages

RUN pnpm install --filter @mtools/indexer... --frozen-lockfile
RUN pnpm --filter @mtools/indexer build

FROM node:20-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
RUN corepack enable

COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/indexer ./packages/indexer
COPY --from=builder /app/packages/shared ./packages/shared
COPY packages/indexer2/docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
