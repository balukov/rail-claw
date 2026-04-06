#!/bin/sh
set -e

# Fix volume permissions for non-root user (Railway mounts /data as root)
if [ -d /data ] && [ "$(stat -c %u /data)" != "1000" ]; then
  chown -R node:node /data
fi

# Ensure Playwright browser cache is owned by node user
PW_DIR="${PLAYWRIGHT_BROWSERS_PATH:-/home/node/.cache/ms-playwright}"
if [ -d "$PW_DIR" ] && [ "$(stat -c %u "$PW_DIR")" != "1000" ]; then
  chown -R node:node "$PW_DIR"
fi

exec gosu node "$@"
