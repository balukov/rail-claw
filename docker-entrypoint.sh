#!/bin/sh
set -e

if [ -d /data ] && [ "$(stat -c %u /data)" != "1000" ]; then
  chown -R node:node /data
fi

[ -f /data/.openclaw/openclaw.json ] && chown node:node /data/.openclaw/openclaw.json 2>/dev/null || true

exec gosu node "$@"
