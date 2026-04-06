#!/bin/sh
set -e

# Fix volume permissions for non-root user (Railway mounts /data as root)
if [ -d /data ] && [ "$(stat -c %u /data)" != "1000" ]; then
  chown -R node:node /data
fi

exec gosu node "$@"
