# Wintron OS workspace redesign

This change works in the existing Next.js, Prisma, PostgreSQL, Better Auth, Decimal.js, Radix, and PDF implementation. It does not replace the accounting engine or reset business records.

## Implemented

- Eight primary sections: Overview, Prospecting, Pipeline, Clients, Projects, Money, Automations, Settings. Existing `?module=` URLs remain available; new Money links use `?module=money&tab=…`. Back/forward and reporting period URLs are supported.
- Compact navigation, shared typography, surfaces, controls, badges, empty states, responsive tables, accessible dialogs, quick create, and global search. The small WT/unicorn SVG is a simplified vector adaptation of the supplied brand reference, not the original raster artwork.
- Overview uses actual tasks, follow-ups, current receivables, period receipts, prospect counts, recorded activity, and run history. It does not invent communications or provider activity.
- Manual prospects with evidence, HTTP(S) source links, observation dates, separately labeled qualification reasoning, persisted saved searches, search/filter/sort, selection, bulk dismissal confirmation, duplicate checks, and a side panel that keeps the table mounted.
- Organization-scoped opportunities with table/board views, owners, values, stage definitions, follow-up dates, notes, direct record URLs, and explicit won/lost actions. Won requires a linked client; lost requires a reason. Conversion is transactional and repeat-safe.
- Client journey with internal proposal drafts and a chronological timeline of available records. Existing contacts, rich notes, files, invoices, payments, projects, and recurring contracts remain accessible. Drafts and uploaded contracts do not imply acceptance/signature.
- Project ownership, delivery scope, status, due date, persisted tasks and task completion. Related client records remain directly accessible; client billing is not automatically attributed to individual projects.
- Money tabs preserve existing invoice, payment, expense, tax and ledger workflows. Gross receipts, refunds, net collected cash, current outstanding/overdue invoices, and accrual revenue are distinct. Summary links preserve reporting periods and matching filters. Manual reconciliation has visible persisted status. Partially paid past-due invoices appear in the overdue drilldown, with separate invoice-total and balance-due columns.
- Automations expose existing recurring billing, paused configuration, due-work preview, run history, and retry behavior. Runs also process existing recurring expenses. No new outbound action engine was introduced.
- Existing roles, authentication, MFA, CSRF protection, audit trails, document authorization, immutable accounting journals, and payment idempotency remain in place. New services apply the same authorization boundaries. Job history remains owner-only; staff and accountants receive an explicit access explanation rather than misleading empty health data.

## Route inventory

| Route / module | Destination and verification scope |
| --- | --- |
| `/login` | Password login, MFA challenge and recovery lifecycle, rate limits |
| `/`, `?module=overview`, legacy `?module=dashboard` | Overview, quick actions, empty/real summaries, error recovery |
| `?module=prospecting` | Manual research, saved criteria, filters, duplicate detection, qualification and conversion |
| `?module=pipeline` | Table/board, evidence, notes, stage/follow-up persistence; `record` deep links |
| `?module=clients`, optional `client` | Client details, journey, proposals, notes, contacts, invoices, payments, projects, retainers, files, activity |
| `?module=projects` | Project list/detail, owner, tasks, status and client linkage |
| `?module=money&tab=invoices`; legacy `?module=invoices` | Draft, issue, PDF, recorded partial/full payments, current balance filters |
| Money `payments`; legacy `payments` | Gross receipts, period filter, recorded allocations/refunds and reconciliation |
| Money `expenses`; legacy `expenses` | Expense entry, receipt preview/download, review/reopen persistence |
| Money `reconciliation`; legacy `reconciliation` | Manual statement comparison and review flags |
| Money `reports`; legacy `reports` | Eleven report types and CSV/PDF endpoints |
| Money `taxes`; legacy `taxes` | Existing tax planning and owner-finance tools preserved |
| `?module=automations` | Paused recurring configuration, safe preview, history and pause |
| Legacy `?module=retainers` | Existing recurring contract editing, billing and time controls |
| `?module=settings` | Business, staff/access, security, financial, integrations, system/audit |
| `/api/[...path]` | Existing authenticated endpoints plus `workspace`, `prospects`, `opportunities`, `tasks`, `saved-searches`, `proposals` |
| `/api/auth/[...all]`, `/api/me`, `/api/health` | Existing auth, membership and health behavior |
| `/icon.svg`, `/mark.svg` | Wintron workspace mark |

`docs/CONTROL-INVENTORY.json` enumerates static interactive-control sites with file and line references, including dynamically repeated controls. Regenerate with `npx tsx scripts/audit-controls.ts`. An inventory entry means the control was located, not that every data-dependent permutation was clicked.

## Verification evidence

Tests run only against `wintron_test` with fictional records, local test documents and the isolated server on port 43817. The existing production app, scheduler and business database are not used for browser tests. No real outreach, customer charges, live refunds, or business-record deletion occurs.

- `tests/workspace.test.ts`: duplicate identities, concurrent conversion idempotency, qualification requirements, won/lost validation, opportunity notes/follow-up persistence, cross-organization denial, accountant write denial, owner-only job history, project tasks, proposals, and audit evidence.
- `tests/integration.test.ts` and `tests/money.test.ts`: existing accounting, documents, invariants, authorization and money calculations, plus regressions for the Trial Balance Decimal constructor binding and partially paid overdue detection.
- `tests/e2e/workflow.spec.ts`: existing client → invoice → payment → expense → recurring workflow, read-only role/origin protection, mobile navigation, keyboard search, validation, MFA/recovery, failed-request recovery, image/PDF previews/downloads, auditable expense review, authentication rate limits.
- `tests/e2e/workspace.spec.ts`: prospect evidence and qualification, saved criteria, duplicate rejection, conversion, pipeline table/board and notes, proposal drafts, project tasks/status, failed-save value retention, paused rule configuration/preview/pause, module and legacy URL sweep, browser history/refresh, financial summary reconciliation, staff settings, report exports, quick-create controls, overdue-total reconciliation, linked-client/won conversion, rapid duplicate-click protection, keyboard focus return, and live notifications while dialogs are open.
- Browser screenshots at 1448, 1024 and 390 pixels are saved under `.data/workspace-*.png`. Prospect detail and board screenshots are `.data/prospect-detail.png` and `.data/pipeline-board.png`. Only fictional test data appears. Selected review images are copied to `docs/screenshots/workspace/`.
- The route/responsive sweep captures browser exceptions and failed API responses and checks document width for overflow.

Final results are recorded below. This is targeted regression coverage, not a claim that every permutation of every legacy administrative or financial control was exercised through the browser. Existing service tests cover additional accounting paths; live SMTP delivery, actual bank matching, OS print dialogs, and authenticated production workflows are outside this isolated test run.

## Bugs corrected during verification

- Trial Balance crashed because the exposed Decimal `max` method lost its constructor context. The wrapper now calls the original static method correctly, with decimal-precision regression coverage.
- Overdue balances included partially paid invoices, while their old display-status filter excluded those records. The filter now uses the same due-date/open-balance criteria, and invoice tables display balance due separately from invoice total.
- Accounting-revenue drilldowns now explicitly reset Reports to Profit & loss instead of retaining an unrelated previously selected report.
- A capture-phase unsaved-change listener could clear the first edited field. Dirty tracking now runs with the field changes; failed saves preserve entered data.
- Task checkboxes now show pending completion immediately, prevent repeat submissions during the save, and revert with an error if persistence fails.
- New form accessible names no longer include unrelated help text. Dialogs restore focus to their opening control, and a persistent live region keeps success feedback available while a modal is open.
- Rapid invoice Duplicate clicks share an in-flight guard, verified against persisted invoice counts.

## External dependencies and honest limits

- External business discovery now has a Tavily adapter; it requires `TAVILY_API_KEY`. Source previews must be reviewed before saving a prospect, and excerpts are not automatically recorded as verified facts. Automatic contact enrichment remains **Under development**. Local saved-prospect filters work without a provider.
- Stripe/bank import and webhook adapters do not exist. No successful sync is claimed. Provider fees/payouts are not separately modeled or counted as sales. Manual payment recording and reconciliation work.
- Inbound email, reply events, outbound sequences and reply-triggered rules are not implemented. SMTP only sends invoice documents. This checkout has neither `SMTP_HOST` nor `SMTP_FROM` configured. Invoice Send email is disabled while these are absent; setup instructions remain visible.
- Proposals are internal drafts. Delivery/acceptance, electronic signature verification and a contract signing provider are not connected. Existing uploaded proposal/contract files remain viewable/downloadable.
- Recurring execution uses the existing scheduler and deduplicates billing periods. Preview does not create records or send anything. Deployment must keep the scheduler configured for automatic runs.
- Organization data is still loaded as one small-business workspace dataset. Server-side pagination, large-data performance, malware scanning and provider synchronization are not added by this change.
- Project/relationship owners are stored as names, not new permission assignments. Access continues to be governed by organization membership roles.

## Migration and rollout

`prisma/migrations/202611110001_workspace/migration.sql` is additive: six new workflow tables, including project tasks, and `Project.ownerName` with an empty default. It does not drop, rewrite or delete existing business records, documents, accounting entries or permissions.

The migration has been applied to the isolated test database. The initial source-verification phase did not redeploy production. A subsequent November 12, 2026 rollout deployed the app and scheduler and applied this migration after a verified recovery snapshot (see the rollout record below). For rollout, use the existing deployment procedure: back up, build the updated app image, run the migration service, then restart app and scheduler. See `docs/DEPLOYMENT.md`. A bare source update without applying the migration will make the new workspace-data endpoint unavailable.

No new external credentials are required for manual prospecting, pipeline, proposal drafts or project tasks.

## Design references

Only public reference pages were inspected: [Linear](https://linear.app/), [HoneyBook](https://www.honeybook.com/), and [Stripe Payments](https://stripe.com/payments). No authenticated third-party dashboards were accessed.

## Initial redesign validation — November 12, 2026

| Check | Result |
| --- | --- |
| `npm run build` | Passed; optimized Next.js standalone build and bundled TypeScript check |
| `npm run typecheck` | Passed |
| `npm test` | 34 tests passed across 3 files |
| `npm run test:e2e` | 12 Chromium tests passed against the running isolated application |
| Prettier check on changed source and tests | Passed |
| `git diff --check` | Passed |
| Static control inventory | 228 control sites across 21 components |
| Responsive route sweep | Passed at 1448, 1024, and 390 px; no document overflow |
| Console/network monitoring | No browser exceptions or failed API responses in the route/responsive sweep; deliberately injected failure cases passed recovery checks |
| Dedicated lint command | None configured in this repository; no ESLint result is claimed |

The initial build and migration were subsequently deployed as recorded below. All new workflow behavior was tested using fictional data. Live lead discovery, Stripe/bank synchronization, inbound email/reply automation, electronic signatures, SMTP delivery, OS printing, and authenticated production workflows remain outside the verified paths for the reasons above. Legacy administrative and financial controls have targeted coverage rather than an exhaustive claim about every possible state.

Local raw verification artifacts are `.data/workspace-build.log`, `.data/workspace-typecheck.log`, `.data/workspace-tests.log`, `.data/workspace-e2e.log`, and `.data/workspace-format.log`. The Playwright report is in `playwright-report/index.html`; ignored artifacts may contain fictional test-account data and should not be published wholesale.

## Live rollout — November 12, 2026

Deployed to **https://wintron-os.tail70d8db.ts.net** after the user reported that the visible app still showed the old design. The earlier source-only delivery had left the three-week-old production container running.

- Rebuilt `app`, `scheduler`, and `migrate` Docker images; retained prior app/scheduler images for rollback.
- Paused writers, saved a private local database/document snapshot, restored the dump in a network-isolated PostgreSQL container, and compared record counts and financial totals. Document checksums also verified.
- Applied the additive migration and verified that pre-existing record counts and financial totals matched before restarting the app and scheduler.
- Live build: `JENwFAwNKblfHB8xJu8Mp`. App container healthy; existing database and document volumes retained.
- Verified the canonical HTTPS login (200), health (`ok`), unauthenticated workspace protection (401), new shared CSS, and exact branding-asset hash. No browser exceptions on the live public login check.
- Full authenticated browser workflows remain verified against the isolated test database. No production test account, outreach, charge, or refund was introduced during rollout.

Recovery snapshot: `.data/rollout-20261112T192324Z/`. This protected local snapshot does not replace an offsite backup configuration. Deployment logs and live verification results are in ignored `.data/workspace-deploy*.log` and `.data/workspace-live-verification.json`.


## Integration status and lead discovery follow-up — November 14, 2026

Unimplemented contact enrichment, inbox, outreach, Stripe, bank, and signature integrations now carry explicit **Under development** labels throughout the workspace. Brave Search business discovery is implemented with source preview, pagination, manual review, and duplicate-aware prospect saving; it shows **Setup required** while the API key is absent. Invoice email has owner-only connection diagnostics, sanitized persisted check results, configuration validation, and separate evidence for actual SMTP acceptance. See [INTEGRATIONS.md](INTEGRATIONS.md) for setup, behavior, endpoints, and test coverage. The static control inventory was regenerated. No new database migration is needed.


Follow-up validation:

- Production build, TypeScript, formatting, and diff checks passed.
- 57 service/unit tests passed across six files, including the Brave adapter with controlled responses and invoice delivery through a local TLS SMTP fixture.
- The final full browser run passed the 12 existing regression cases before its process was interrupted. All three integration cases then passed in a separate targeted run: status/access/setup labels, SMTP failure/retry, and provider search → source review → persisted prospect.
- The static inventory now contains 244 control sites across 24 components. Desktop/mobile integration screenshots and a fictional lead-search preview are in `docs/screenshots/workspace/`.
- Live provider credentials remain absent. No real Brave request, outbound customer email, charge, or processor refund was made during verification. Provider-backed searches show **Setup required** until the server key is configured.

Verification logs: `.data/integrations-build.log`, `.data/integrations-tests.log`, `.data/integrations-e2e.log`, `.data/integrations-final-browser.log`, and `.data/integrations-docker-build.log`. Browser-provider fixtures prove application behavior; they do not establish successful authentication to a live Brave account.


Follow-up deployed on November 14, 2026 to `https://wintron-os.tail70d8db.ts.net`, build `SESsxfCVIVgSfwew5lE3M`. A fresh local recovery snapshot at `.data/rollout-20261114T184219Z/` was restored in an isolated PostgreSQL container and verified against existing record counts, document checksums, and financial totals. No schema change was required. The first attempt safely rolled back when the restore check connected during PostgreSQL's temporary bootstrap-server transition; the retry waited for the permanent server and succeeded.

Live checks passed: HTTPS login 200, health `ok`, new integration and lead-search CSS served, matching branding asset, and unauthenticated workspace/SMTP/lead-status endpoints returning 401. No browser exceptions were observed on the public login check. Authenticated workflows were tested against the isolated database, not by creating production test accounts. Raw deployment and live-check logs are `.data/integrations-deploy.log` and `.data/integrations-live-verification.json`.


## Tavily provider switch — November 14, 2026

Lead discovery now uses Tavily instead of Brave, as requested. `TAVILY_API_KEY` is kept in the private server environment; no credential is committed. Requests use Tavily's authenticated POST search endpoint with basic depth, automatic parameters disabled, and up to 20 source results. Pages of ten results are browsed locally without additional provider calls. Contact enrichment and unimplemented integrations retain their Under development labels.

Verification: 59 service/unit tests passed, including Tavily request/response handling and authentication/quota errors. Three targeted browser tests passed, including failure recovery, review-before-save, and pagination without another provider request. The production build and TypeScript checks passed. One authorized live search returned 20 sources with connection verification recorded under the `system:integration-check` audit actor; the production prospect count did not change. Live search metadata is in protected `.data/tavily-live-search.json`; no raw search results or credentials are included in the report.

Tavily rollout completed with live build `GzTiMg2LFZBs1GwYnmZyj` and verified local recovery snapshot `.data/rollout-20261114T185022Z/`. Existing record counts and financial totals matched. The running container reported `configured: true`, `CONNECTION_VERIFIED`, and one provider request used. HTTPS login/health, protected API access, shared assets, and browser error checks passed. The credential scan found no supplied key in tracked files or browser assets.
