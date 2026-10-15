#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
: "${RESTIC_REPOSITORY:?Set RESTIC_REPOSITORY}"
: "${RESTIC_PASSWORD_FILE:?Set RESTIC_PASSWORD_FILE}"
stage=$(mktemp -d)
container="wintron-restore-check-$(date +%s)"
cleanup() { code=$?; docker rm -f "$container" >/dev/null 2>&1 || true; rm -rf "$stage"; exit "$code"; }
trap cleanup EXIT
restic check --read-data
restic restore latest --tag wintron-os --target "$stage"
dump=$(find "$stage" -name database.dump -type f -print -quit)
test -n "$dump"
root=$(dirname "$dump")
(cd "$root" && sha256sum -c documents.sha256)
# Isolated disposable container with no network and no published ports.
docker run -d --name "$container" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
for attempt in $(seq 1 30); do docker exec "$container" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$container" createdb -U postgres wintron_restore
docker exec -i "$container" pg_restore -U postgres -d wintron_restore --no-owner --no-acl --exit-on-error < "$dump"
docker exec -i "$container" psql -U postgres -d wintron_restore -v ON_ERROR_STOP=1 < scripts/verify-ledger.sql
docker compose run --rm --no-deps app npx tsx scripts/record-job.ts RESTORE_CHECK SUCCESS 'Offsite restore, document hashes, foreign keys and journal balance verified.' >/dev/null
echo 'Isolated restore verification passed.'
