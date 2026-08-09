#!/usr/bin/env bash
set -euo pipefail

release_dir="${1:-}"
release_sha="${2:-}"
app_root=/opt/creator-empire
shared_root=/var/lib/creator-empire
env_file=/etc/creator-empire/creator-empire.env
service_file=/etc/systemd/system/creator-empire.service
nginx_file=/etc/nginx/sites-available/creator.flowbiz.cloud.conf

if [[ "$(id -u)" != "0" ]]; then
  echo "install-release.sh must run as root" >&2
  exit 2
fi
if [[ -z "$release_sha" || ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full 40-character release SHA is required" >&2
  exit 2
fi
if [[ "$release_dir" != "$app_root/releases/$release_sha" || ! -d "$release_dir" ]]; then
  echo "Release directory does not match the immutable release SHA" >&2
  exit 2
fi

previous_release="$(readlink -f "$app_root/current" || true)"
install -d -m 0755 "$app_root/releases"
install -d -o creator-empire -g creator-empire -m 0750 "$shared_root"
install -d -o creator-empire -g creator-empire -m 0700 "$shared_root/uploads" "$shared_root/backups"

npm --prefix "$release_dir" ci
npm --prefix "$release_dir" test

if [[ ! -x "$shared_root/venv/bin/python" ]]; then
  python3 -m venv "$shared_root/venv"
fi
"$shared_root/venv/bin/python" -m pip install --disable-pip-version-check --no-input -r "$release_dir/requirements.txt"
"$shared_root/venv/bin/python" "$release_dir/tests/server-v1.3.py"

upsert_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$env_file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$env_file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$env_file"
  fi
}

upsert_env CREATOR_EMPIRE_RELEASE_SHA "$release_sha"
upsert_env CREATOR_EMPIRE_UPLOAD_DIR "$shared_root/uploads"
upsert_env CREATOR_EMPIRE_MAX_VIDEO_BYTES 2147483648
if ! grep -q '^CREATOR_EMPIRE_TOKEN_KEY=.' "$env_file"; then
  token_key="$("$shared_root/venv/bin/python" -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode("ascii"))')"
  upsert_env CREATOR_EMPIRE_TOKEN_KEY "$token_key"
  unset token_key
fi
chmod 0600 "$env_file"

set -a
. "$env_file"
set +a
if [[ -n "${CREATOR_EMPIRE_DB:-}" && -f "$CREATOR_EMPIRE_DB" ]]; then
  backup_path="$shared_root/backups/predeploy-${release_sha}.sqlite"
  CREATOR_BACKUP_PATH="$backup_path" "$shared_root/venv/bin/python" -c 'import os, sqlite3; source=sqlite3.connect(os.environ["CREATOR_EMPIRE_DB"]); target=sqlite3.connect(os.environ["CREATOR_BACKUP_PATH"]); source.backup(target); target.close(); source.close()'
  chown creator-empire:creator-empire "$backup_path"
  chmod 0600 "$backup_path"
fi

install -m 0644 "$release_dir/deploy/creator-empire.service" "$service_file"
install -m 0644 "$release_dir/deploy/creator.flowbiz.cloud.conf" "$nginx_file"
nginx -t
systemctl daemon-reload

ln -sfn "$release_dir" "$app_root/current.new"
mv -Tf "$app_root/current.new" "$app_root/current"
systemctl restart creator-empire
systemctl reload nginx

healthy=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8417/api/health | "$shared_root/venv/bin/python" -c 'import json,sys; expected=sys.argv[1]; payload=json.load(sys.stdin); raise SystemExit(0 if payload.get("ok") is True and payload.get("release")==expected else 1)' "$release_sha"; then
    healthy=1
    break
  fi
  sleep 1
done

if [[ "$healthy" != "1" ]]; then
  if [[ -n "$previous_release" && -d "$previous_release" ]]; then
    ln -sfn "$previous_release" "$app_root/current.rollback"
    mv -Tf "$app_root/current.rollback" "$app_root/current"
    previous_sha="$(basename "$previous_release")"
    upsert_env CREATOR_EMPIRE_RELEASE_SHA "$previous_sha"
    systemctl restart creator-empire
  fi
  echo "Release health verification failed; previous release restored" >&2
  exit 1
fi

echo "release=$release_sha"
echo "previous_release=$previous_release"
echo "health=passed"
