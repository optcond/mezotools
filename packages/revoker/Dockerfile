FROM node:22-alpine AS base

WORKDIR /app

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/revoker/package.json packages/revoker/package.json

RUN pnpm install --filter @mtools/revoker... --frozen-lockfile

COPY packages/shared packages/shared
COPY packages/revoker packages/revoker

RUN pnpm --filter @mtools/shared build
RUN pnpm --filter @mtools/revoker build

ENTRYPOINT ["/app/packages/revoker/docker/entrypoint.sh"]
