# Wintron OS

Private, self-hosted business management for **Wintron Technologies LLC**. Built with Next.js App Router, React, strict TypeScript, PostgreSQL/Prisma, Better Auth, Decimal.js, Tailwind CSS, Radix dialogs, Lucide and Recharts. The navy dashboard and reusable components follow the supplied reference. Business data starts empty.

## Current workspace

The Docker app and scheduler are running on server `100.95.159.90`, accessible through **https://alienwareserver.tail70d8db.ts.net:8443** from a device connected to the tailnet. Docker and Tailscale are enabled at boot, and the containers and HTTPS proxy are configured to resume after reboot. See [this server’s operations notes](docs/HOST.md). Create your first owner from an interactive terminal:

```bash
cd /home/greed/wintron-os
docker compose run --rm --no-deps app npx tsx scripts/create-admin.ts --email YOUR_EMAIL --name 'YOUR NAME'
```

The password prompt is hidden. The business database starts empty. To switch to the development server below, first run `docker compose stop app scheduler` to release port 3000.

## Run locally

```bash
cd /home/greed/wintron-os
npm ci
# For a NEW checkout only; an .env has already been generated in this workspace:
# node scripts/local-env.mjs
docker compose -f compose.yaml -f compose.dev.yaml up -d db
npm run db:migrate
npm run admin:create -- --email YOUR_EMAIL --name 'YOUR NAME'
npm run dev
```

Open **http://localhost:3000**. The first-owner command asks for a hidden password; there are no default or demo credentials. Set up MFA in Account security, then add the second founder in Settings → Staff & access. The database is persistent across app/container restarts. Its development port is loopback-only; production Compose publishes no database port.

## Implemented workflows

- Dashboard sourced from PostgreSQL: accrual revenue, current receivables, reserve planning, active clients, chart, activity, contracts and quick actions.
- CRM: client profiles, contacts, rich notes with edit history, projects, private files, timeline and organization-scoped search.
- Invoices: multiline drafts, precise discounts/configurable sales tax, immutable issuance and numbering, identity snapshots, PDF/print, SMTP delivery events, duplicate, reasoned void and replacement.
- Payments: partial/multi-invoice allocations, unapplied funds, refunds/corrections, reconciliation, stable idempotency keys, operating/reserve cash account selection.
- Expenses: mapped ledger accounts, receipts, uncertain deductibility review flags, recurring confirmed payments, reversible corrections.
- Double-entry accounting: immutable journals, database-enforced balancing, owner capital/distributions, reviewed adjustments and ledger-backed reports with CSV/PDF exports.
- Taxes: effective-dated reserve assumptions, classification/residency configuration, owner book-profit allocations, earmarked amounts and entity tax payments. No invented rates or automated filing.
- Retainers: monthly/quarterly/annual contracts, pause/cancel/renewal dates, time entries and idempotent scheduled draft generation.
- Administration: individual accounts, Owner/Staff/Accountant roles, TOTP/recovery codes, revocable sessions, organization settings, notifications with per-user read state, safe SMTP status and audit/job history.
- Operations: non-root Docker image, Compose, migration workflow, private volumes, health checks, hourly scheduler, encrypted offsite backup scripts, systemd schedule examples and isolated restore verification.

## Build, test and deploy

```bash
npx tsx scripts/prepare-tests.ts
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
scripts/test-restore.sh
npm audit

# Production: configure .env and Tailscale origin first.
docker compose build
docker compose up -d db
docker compose run --rm migrate
docker compose up -d app scheduler
```

Optional development-only fictional sample data:

```bash
npm run db:seed -- --development-only
```

Seeding requires an empty client database and refuses production mode. Tests use a separate `wintron_test` database, not your business records. Test credentials and raw test output are ignored local artifacts; selected screenshots in `docs/screenshots/` contain only fictional test records.

## Documentation

- [Deployment, first admin, Tailscale, upgrade and troubleshooting](docs/DEPLOYMENT.md)
- [Architecture and accounting definitions](docs/ARCHITECTURE.md)
- [Security, roles and account recovery](docs/SECURITY.md)
- [Encrypted backups and restoration](docs/BACKUP-RECOVERY.md)
- [API and payload contracts](docs/API.md)
- [Verification results and acceptance limits](docs/VERIFICATION.md)
- [Implementation checklist](docs/PROGRESS.md)

## Before real business use

This is a working, tested self-hosted implementation, **not a certification of production readiness**. Configure the real founders and business identity, verify HTTPS/MFA on the target tailnet, connect and test SMTP and offsite storage, perform a target-host recovery drill, and have the accounting configuration and security reviewed.

Jurisdiction-specific tax obligations remain visibly incomplete until verified rules and owner facts exist. The reporting basis is accrual; cash collection and contract run rates are separately labeled. Current aging is not a historical as-of aging engine. The initial chart uses operating and reserve cash accounts; sophisticated bank reconciliation, credit-note documents, guaranteed-payment tax treatment and broad SaaS tenancy are outside this implementation. Use traceable refund/void/reissue and reviewed journals for supported corrections.

The small-business UI currently loads organization-level records together. Large datasets need pagination and incremental reporting before adoption. Files are validated and private but are not malware-scanned. Review [security limitations](docs/SECURITY.md) before storing sensitive records.
