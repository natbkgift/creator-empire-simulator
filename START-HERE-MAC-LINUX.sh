#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python3 creator_server.py --root dist --host 127.0.0.1 --port 4173
