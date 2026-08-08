#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BROWSER=0
if [[ "${1:-}" == "--browser" ]]; then BROWSER=1; fi

printf '== Creator Empire v1.4 Local Validation ==\n'
node --version
npm --version
python3 --version

printf '\n[1/5] Install exact dependencies\n'
npm ci
printf '\n[2/5] TypeScript + domain/UI tests\n'
npm test
printf '\n[3/5] SQLite/data-security regression tests\n'
python3 tests/server-v1.3.py
printf '\n[4/5] Repository hygiene guard\n'
tracked="$(git ls-files | grep -E '(^dist/|^data/|\.sqlite$|\.sqlite-wal$|\.sqlite-shm$|^\.env$)' || true)"
if [[ -n "$tracked" ]]; then
  printf '%s\n' "$tracked" >&2
  echo 'Runtime/build/secret artifacts are tracked by Git.' >&2
  exit 1
fi
printf '\n[5/5] Core local validation complete\n'

if [[ "$BROWSER" == "1" ]]; then
  python3 -m pip install playwright
  python3 -m playwright install chromium
  runtime="${TMPDIR:-/tmp}/creator-empire-local-qa"
  mkdir -p "$runtime"
  export CREATOR_EMPIRE_DB="$runtime/creator.sqlite"
  export CREATOR_EMPIRE_NO_BROWSER=1
  python3 creator_server.py --root dist --host 127.0.0.1 --port 4173 >"$runtime/server.log" 2>&1 &
  pid=$!
  trap 'kill "$pid" 2>/dev/null || true' EXIT
  for _ in $(seq 1 60); do
    if curl -fsS http://127.0.0.1:4173/api/storage >/dev/null 2>&1; then break; fi
    sleep .25
  done
  curl -fsS http://127.0.0.1:4173/api/storage >/dev/null
  printf '\n[Browser regression] v1.3 data/recovery contracts\n'
  python3 tests/browser-v1.3.py
  printf '\n[Browser acceptance] v1.4 frozen Editorial Creator OS\n'
  python3 tests/browser-v1.4.py
  kill "$pid" 2>/dev/null || true
  trap - EXIT
fi

echo 'LOCAL VALIDATION PASS'
