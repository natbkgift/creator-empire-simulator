#!/usr/bin/env sh
cd "$(dirname "$0")"
printf 'Open http://127.0.0.1:4173\n'
node server.mjs --root dist --port 4173
