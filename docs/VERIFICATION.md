# Verification record

Executed locally on October 15, 2026. Automated records are fictional and live in the separate `wintron_test` database. The business `wintron` database was explicitly checked: zero clients, invoices, payments and users. No development seed was run against it.

## Passing checks

- Strict TypeScript compilation (`npm run typecheck`).
- 27 unit/integration tests (`npm test`) using real PostgreSQL.
- Next.js optimized production build (`npm run build`), including standalone asset copying and removal of local environment files.
- 7 Chromium end-to-end tests against the built standalone server at loopback port 43817.
- Dependency audit: zero reported vulnerabilities at verification time (`npm audit`).
- Encrypted backup and restoration rehearsal (`scripts/test-restore.sh`): restic repository data verification, document hash checks, configuration round-trip, PostgreSQL restore, journal counts and financial invariants. The isolated test container and temporary repository were removed.
- Shell syntax checks on all backup/restore scripts.
- Production Docker images built; the migration container applied/checked all five migrations successfully. App and scheduler started from those images.
- Container runtime: UID 1000, writable private document volume, no bundled `.env`, health/login HTTP 200 and unauthenticated business API HTTP 401. App binds only `127.0.0.1:3000`; the development database mapping binds only `127.0.0.1:55432`. Production Compose has no database port mapping.
- App, scheduler and database restart: test-database journal count remained 74, a private-volume marker survived and was removed afterward, and health returned HTTP 200. Business database remained empty (zero clients, invoices, payments and users).

## Unit and PostgreSQL coverage

Invoice rounding, fractional quantities, line discounts and sales tax; allocation limits, partial/refunded balances; month-end/leap-year recurring dates; positive/loss tax reserves; owner allocation rounding and loss sharing; invalid calendar dates; South Carolina business-date boundaries; URL and tax-jurisdiction validation; default expense review classification; account authentication and public-signup refusal; authorization/origin checks; CRM updates, rich-text sanitization and note revisions; immutable invoice issuance with concurrent requests; PDF generation and access; idempotent payment replay/conflict; one payment allocated to multiple invoices; cash account selection; owner contribution/distribution exclusion from operating profit; reporting agreement with balanced ledger; refunds, unapplied allocations, voids and expense reversal; database rejection of unbalanced/mutated journals; concurrent recurring invoice idempotency; upload content/type validation and private downloads; CSV formula defense.

## Browser coverage

1. Sign in → empty dashboard → create client → discovery note → multiline-capable invoice → issue → PDF download → partial payment → remaining payment → paid status → reports → expense → retainer → billing run → verify persistent draft after reload.
2. Read-only account receives server-side 403 on mutations; cross-origin requests and public signup are rejected.
3. Mobile navigation at 390 × 844, dialog validation, Escape dismissal, keyboard search focus and horizontal-overflow check.
4. TOTP enrollment and verification, login challenge with business APIs inaccessible before second factor, recovery-code login.
5. Simulated data-service failure produces a recoverable error and no invented metrics; retry restores the dashboard.
6. Receipt PNG preview, zoom, authenticated download, PDF canvas rendering and page navigation in client files; marking an expense reviewed, persisted status/history, reopening with notes; anonymous preview and read-only review mutation rejection.
7. Authentication rate limiting returns 429.

Desktop screenshots at 1448 × 1086 were inspected against the supplied design. The chart animation was disabled so recorded revenue is visible immediately. Images in `docs/screenshots/` show only fictional test data, not business records.

## Deployment acceptance still required

The automated checks are not a production security certification or accountant approval. Actual SMTP delivery, offsite provider credentials/access, key custody, a scheduled offsite recovery drill, actual founder MFA enrollment require the operator's real environment. They were not asserted or fabricated. No external invoice email was sent.

The database-failure browser test simulates a failed API response; it is not a chaos/failover test. PostgreSQL restoration is exercised in a real isolated container. No public endpoint was published. The private Tailscale HTTPS endpoint was subsequently configured and verified; see [current server operations](HOST.md). UI coverage is Chromium desktop/mobile; Safari/Firefox and assistive-technology audits remain independent acceptance work.

## Document preview and expense review update

The isolated PostgreSQL test checks owner-only review actions, cross-organization rejection, required notes, duplicate-state conflicts, immutable history, audit events, unchanged financial journals, blocked financial field edits and rejection after reversal. The browser test waits for actual PDF canvas rendering and extracted page text, rather than merely the presence of a viewer. A two-page fictional PDF was visually inspected; the browser check also asserts painted pixels in the visible part of the canvas. PDF.js and worker/font assets are served locally. DOCX remains downloadable.

The live database now contains operator-provisioned accounts and business records; all automated feature tests continue to use `wintron_test`. Deployment applies an additive sixth migration without rewriting existing expenses or documents.

Deployed October 16, 2026: a protected pre-migration PostgreSQL dump was captured and its archive directory verified. The sixth migration applied successfully, the app/scheduler containers were recreated, and the live HTTPS health, login and PDF-worker requests returned 200. Anonymous private previews returned 401. The local migration snapshot is a rollback precaution, not an offsite backup.
