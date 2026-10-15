#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
command -v restic >/dev/null || { echo 'Install restic on the host.' >&2; exit 1; }
: "${RESTIC_REPOSITORY:?Set an encrypted offsite restic repository}"
: "${RESTIC_PASSWORD_FILE:?Set the separate root-readable password file}"
case "$RESTIC_REPOSITORY" in /*|./*|../*) echo 'Production backups require an offsite repository.' >&2; exit 1;; esac
exec 9>/tmp/wintron-backup.lock
flock -n 9 || { echo 'Another backup is running.' >&2; exit 1; }
stage=$(mktemp -d)
paused=false
cleanup() {
  result=$?
  if [ "$paused" = true ]; then docker compose start app scheduler >/dev/null || true; fi
  if [ "$result" -eq 0 ]; then
    docker compose run --rm --no-deps app npx tsx scripts/record-job.ts BACKUP SUCCESS 'Encrypted offsite backup and repository verification completed.' >/dev/null || true
  else
    docker compose run --rm --no-deps app npx tsx scripts/record-job.ts BACKUP FAILED 'Backup failed; inspect protected service logs.' >/dev/null || true
  fi
  rm -rf "$stage"
  exit "$result"
}
trap cleanup EXIT
# Quiesce application writers for a consistent DB + document snapshot.
docker compose stop app scheduler >/dev/null
paused=true
docker compose exec -T db pg_dump -U wintron -d wintron -Fc > "$stage/database.dump"
mkdir "$stage/documents"
app_container=$(docker compose ps -aq app)
test -n "$app_container"
docker cp "$app_container:/app/storage/." "$stage/documents/"
cp .env compose.yaml "$stage/"
cp -r prisma/migrations "$stage/migrations"
git rev-parse HEAD > "$stage/source-commit.txt" 2>/dev/null || echo 'Uncommitted local source' > "$stage/source-commit.txt"
(cd "$stage" && find documents -type f -print0 | sort -z | xargs -0 -r sha256sum > documents.sha256)
docker compose start app scheduler >/dev/null
paused=false
restic backup --tag wintron-os "$stage"
restic check --read-data-subset=5%
# Retention intentionally does not prune automatically; configure after recovery rehearsal.
echo 'Backup completed and offsite repository checked.'
