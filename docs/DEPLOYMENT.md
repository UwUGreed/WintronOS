# Deployment and operations

## Local development

Requires Node 22, npm, Docker Engine and Compose. This checkout uses a database bound to loopback only for local development. Never add the development override on the production server.

```bash
npm ci
node scripts/local-env.mjs
# Refuses to overwrite an existing .env; keep the one already generated here.
docker compose -f compose.yaml -f compose.dev.yaml up -d db
npm run db:migrate
npm run admin:create -- --email YOUR_EMAIL --name 'YOUR NAME'
npm run dev
```

The admin command prompts for a hidden password of at least 14 characters. It refuses to create a second bootstrap owner. Add the second founder through Settings → Staff & access. There are no default credentials, public signup or automatically seeded business records. The local environment generator uses random independent database and session secrets.

Open `http://localhost:3000`. Use the exact host configured in `APP_URL`; `localhost` and `127.0.0.1` are distinct origins. If accessing a remote server, use an SSH/Tailscale tunnel rather than publishing the development port.

Optional fictional development data, only on an empty nonproduction database:

```bash
npm run db:seed -- --development-only
```

## Production Linux server

1. Copy the source checkout to `/opt/wintron-os` and protect its directory. Use a currently supported Linux distribution and Docker release.
2. Copy `.env.example` to `.env` and set independent random `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET` values. Generate hex values with `openssl rand -hex 32`; keep `.env` mode 0600. Hex avoids connection-string URL-encoding surprises. Configure `APP_URL` as the actual Tailscale HTTPS URL. Keep credentials in a secret manager.
3. Set `DOCUMENT_STORAGE_PATH=/app/storage` in production (Compose sets it). Compose injects the internal database URL; PostgreSQL has no published host port.
4. Build, migrate and launch:

```bash
docker compose build
docker compose up -d db
docker compose run --rm migrate
docker compose up -d app scheduler
docker compose run --rm app npx tsx scripts/create-admin.ts --email YOUR_EMAIL --name 'YOUR NAME'
```

The application publishes `127.0.0.1:3000` only. The image runs as a non-root user, forwards shutdown signals through Docker init, waits for migration completion, uses persistent database/document volumes, health checks, restart policies, and bounded JSON logs.

Enroll both founders in Account security → Two-factor authentication. Save recovery codes privately. Then set `REQUIRE_MFA=true` and recreate app/scheduler. Users who need enrollment can still sign in and use Account security, but cannot access business APIs until enrolled.

### Tailscale Serve

Install Tailscale and enroll the host in your tailnet. Restrict access using your tailnet policy to authorized staff devices/users. Enable HTTPS as required by Tailscale, then:

```bash
sudo tailscale serve --bg http://127.0.0.1:3000
tailscale serve status
```

Set `APP_URL` to the exact returned HTTPS origin (no trailing path), then `docker compose up -d --force-recreate app scheduler`. Tailscale Serve proxies to loopback while providing HTTPS inside your tailnet. Do **not** use Funnel, a public reverse proxy, or a public database port. See the [official Serve reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

Secure-cookie and HSTS behavior follows the configured HTTPS origin. Do not trust a browser-supplied host as the canonical application origin. The app checks the exact origin for mutations; Better Auth checks its own auth endpoints. Only your local trusted proxy should reach the host port. Test HTTPS login, secure cookies, MFA and logout through the actual tailnet origin before using real records.

### SMTP

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, and optional `SMTP_USER`/`SMTP_PASSWORD`. Use implicit TLS with `SMTP_SECURE=true` (usually 465), or required STARTTLS with `false` (usually 587). Provider credentials remain server-side. Sending is an explicit invoice action; a missing provider never blocks PDF download. Delivery failures are recorded separately from invoice accounting status. Configure and verify a real sender/provider before enabling delivery in operations.

### Upgrades

```bash
# Back up and verify restoration first.
scripts/backup.sh
git pull --ff-only
npm ci
docker compose build
docker compose stop app scheduler
docker compose run --rm migrate
docker compose up -d app scheduler
curl --fail http://127.0.0.1:3000/api/health
```

Never run `prisma migrate reset`, `db push --force-reset`, or `docker compose down -v` against business data. Review migrations before upgrading. Take a snapshot before schema changes; application rollback may require restoration into a separate clean environment rather than reversing a migration. Never overwrite the old instance until recovery is verified.

### Tests and checks

```bash
npx tsx scripts/prepare-tests.ts
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
scripts/test-restore.sh
npm audit
```

Tests use the separate `wintron_test` database, generated test accounts and fictional records. They do not seed the business database. Browser tests bind an isolated server to loopback port 43817. The restore test uses a disposable network-isolated PostgreSQL container and encrypted local test repository, then removes both. Credentials/screenshots/traces are in ignored `.data/` and test-results folders; do not share test traces containing session material.

### Troubleshooting

- `503` / empty skeleton: inspect `docker compose ps`, `docker compose logs --tail=100 app db`; run migrations and health check. The UI offers a retry and never substitutes fake metrics.
- Login succeeds but access is denied: check active membership and required MFA. Use Account security to enroll.
- Origin rejected: `APP_URL` must match the browser origin exactly. Recreate the app after changing it.
- Cookie missing on local HTTP: use `http://localhost:3000` locally and HTTPS for the tailnet. HTTPS configuration intentionally requires secure cookies.
- Invoice issue or payment rejected: review state, current balance and dates. All financial writes roll back together on failure.
- SMTP unavailable: download the PDF; correct the server provider settings and retry explicitly. A pending delivery after a crash requires checking the provider before resending to avoid duplicates.
- File upload rejected: maximum 10 MB, allowed PDF/PNG/JPEG/DOCX, with byte signature and extension checks. A file with an incorrect extension is rejected.
- Test port busy: update the test port consistently in Playwright config, test server and origin assertions; do not stop unrelated user processes.

The host operator must monitor backup failures externally too: an unavailable database cannot persist an in-app failure notification.
