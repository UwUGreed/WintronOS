#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
: "${RESTIC_REPOSITORY:?Set RESTIC_REPOSITORY}"
: "${RESTIC_PASSWORD_FILE:?Set RESTIC_PASSWORD_FILE}"
if [ "${1:-}" != '--new-installation-only' ]; then echo 'Usage: scripts/restore.sh --new-installation-only [snapshot-id]. Use on a new, empty installation.' >&2; exit 1; fi
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
restic restore "${2:-latest}" --tag wintron-os --target "$stage"
dump=$(find "$stage" -name database.dump -type f -print -quit)
test -n "$dump"
root=$(dirname "$dump")
(cd "$root" && sha256sum -c documents.sha256)
docker compose up -d db
for attempt in $(seq 1 30); do docker compose exec -T db pg_isready -U wintron -d wintron >/dev/null 2>&1 && break; sleep 1; done
count=$(docker compose exec -T db psql -U wintron -d wintron -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
if [ "$count" != '0' ]; then echo 'Refusing to restore over a nonempty database.' >&2; exit 1; fi
docker compose exec -T db pg_restore -U wintron -d wintron --no-owner --no-acl --exit-on-error < "$dump"
docker compose exec -T db psql -U wintron -d wintron -v ON_ERROR_STOP=1 < scripts/verify-ledger.sql
# Copy into the explicitly configured persistent document volume.
tar -C "$root/documents" -cf - . | docker compose run --rm -T --no-deps app tar -C /app/storage -xf -
echo 'Restored database and documents. Review the encrypted configuration snapshot, run migrations, and start app and scheduler.'
