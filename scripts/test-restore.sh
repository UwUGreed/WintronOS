#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
stage=$(mktemp -d)
container="wintron-recovery-test-$(date +%s)"
cleanup(){ code=$?; docker rm -f "$container" >/dev/null 2>&1 || true; rm -rf "$stage"; exit "$code"; }
trap cleanup EXIT
mkdir -p "$stage/source/documents" "$stage/repository" "$stage/restored"
openssl rand -hex 32 > "$stage/password"
docker compose -f compose.yaml -f compose.dev.yaml exec -T db pg_dump -U wintron -d wintron_test -Fc > "$stage/source/database.dump"
if [ -d .data/documents ]; then cp -r .data/documents/. "$stage/source/documents/"; fi
printf '%s\n' 'restore-test-only=true' > "$stage/source/configuration.txt"
(cd "$stage/source" && find documents -type f -print0 | sort -z | xargs -0 -r sha256sum > documents.sha256)
restic_test(){ docker run --rm --user "$(id -u):$(id -g)" --network none -e RESTIC_REPOSITORY=/repository -e RESTIC_PASSWORD_FILE=/key -v "$stage/password:/key:ro" -v "$stage/source:/source:ro" -v "$stage/repository:/repository" -v "$stage/restored:/restored" restic/restic:0.18.1 "$@"; }
restic_test init
restic_test backup /source
restic_test check --read-data
restic_test restore latest --target /restored
(cd "$stage/restored/source" && sha256sum -c documents.sha256)
cmp "$stage/source/configuration.txt" "$stage/restored/source/configuration.txt"
docker run -d --name "$container" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
for attempt in $(seq 1 30); do docker exec "$container" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$container" createdb -U postgres restored
docker exec -i "$container" pg_restore -U postgres -d restored --no-owner --no-acl --exit-on-error < "$stage/restored/source/database.dump"
docker exec -i "$container" psql -U postgres -d restored -v ON_ERROR_STOP=1 < scripts/verify-ledger.sql
original=$(docker compose -f compose.yaml -f compose.dev.yaml exec -T db psql -U wintron -d wintron_test -Atc 'SELECT count(*) FROM "JournalEntry"')
restored=$(docker exec "$container" psql -U postgres -d restored -Atc 'SELECT count(*) FROM "JournalEntry"')
test "$original" = "$restored"
echo "PASS: encrypted backup round-trip, document hashes, configuration, journal counts ($restored), and financial invariants. Offsite credentials were not tested."
