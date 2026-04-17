#!/bin/sh
set -eu

cd /app

INTERVAL="${REVOKER_INTERVAL_SECONDS:-600}"

echo "[entrypoint] Starting revoker loop. Interval: ${INTERVAL}s"

graceful_shutdown() {
  echo "[entrypoint] Shutdown signal received. Exiting loop."
  exit 0
}

trap graceful_shutdown INT TERM

while true; do
  set +e
  pnpm --filter @mtools/revoker start
  EXIT_CODE=$?
  set -e

  if [ "$EXIT_CODE" -ne 0 ]; then
    echo "[entrypoint] Revoker run failed with exit code ${EXIT_CODE}" >&2
  else
    echo "[entrypoint] Revoker run completed successfully"
  fi

  sleep "$INTERVAL" &
  wait $!
done
