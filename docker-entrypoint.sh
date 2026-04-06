#!/bin/sh
set -e

# Fix volume permissions for non-root user (Railway mounts /data as root)
if [ -d /data ] && [ "$(stat -c %u /data)" != "1000" ]; then
  chown -R node:node /data
fi

# OpenClaw saves media to STATE_DIR but resolves paths from WORKSPACE_DIR.
# Symlink so both paths reach the same files.
mkdir -p /data/workspace/.openclaw/media /data/.openclaw/media
ln -sfn /data/.openclaw/media/browser /data/workspace/.openclaw/media/browser

exec gosu node "$@"
