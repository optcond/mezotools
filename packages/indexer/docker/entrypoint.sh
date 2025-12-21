#!/bin/sh
set -eu

cd /app

INTERVAL="${INDEXER_INTERVAL_SECONDS:-60}"

echo "[entrypoint] Starting indexer loop. Interval: ${INTERVAL}s"

graceful_shutdown() {
  echo "[entrypoint] Shutdown signal received. Exiting loop."
  exit 0
}

trap graceful_shutdown INT TERM

while true; do
  if ! pnpm --filter @mtools/indexer start; then
    EXIT_CODE=$?
    echo "[entrypoint] Indexer run failed with exit code ${EXIT_CODE}" >&2
  else
    echo "[entrypoint] Indexer run completed successfully"
  fi

  sleep "$INTERVAL" &
  wait $!
done
