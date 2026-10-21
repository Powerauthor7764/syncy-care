#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then
  echo 'Node.js 22+ required; install it before running this script.'
  exit 1
fi
echo 'Syncy Care: http://127.0.0.1:3000'
node src/server.js
