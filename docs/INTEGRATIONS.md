# Integration functionality and status

Wintron OS distinguishes implemented features that need server configuration from integrations that have not been built. Missing adapters are labeled **Under development** in Settings and at the relevant points in Overview, Prospecting, Automations, Money, and client records. There are no Connect or Enable controls for unimplemented adapters.

## Lead discovery: Tavily

**Prospecting → Discover businesses** searches public websites through the [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search). Enter business criteria and an optional location, inspect source links and excerpts, and use **Review & save prospect** to create a record. Results can include directories and articles; they are not automatically qualified leads.

The review form copies the result title and source URL. The business website, contacts, observation date, verified facts, and qualification start blank. Search excerpts remain temporary previews and are not copied into verified evidence. After a reviewed prospect is saved, the result links to its record. Existing records are detected by source URL or matching website domain within the current organization; normal prospect duplicate checks also apply on save.

Set `TAVILY_API_KEY` in the private server environment and restart the application. The app never returns the key to the browser. The provider status begins at **Needs verification**, becomes **Connection verified** after a successful search, and becomes **Connection failed** after a failed request. Missing credentials show **Setup required** with search disabled. Changing the key or checks older than 24 hours requires another search before claiming a verified connection.

Search requires an owner or staff account. Each search requests up to 20 sources at basic depth, with automatic parameter selection disabled. Results are displayed ten per page; page changes stay in memory and do not consume more provider requests. Provider requests run only on explicit searches; there are no background searches, automatic imports, or outreach. Existing manual prospect research remains available without credentials.

`LEAD_SEARCH_DAILY_LIMIT` sets the per-organization request limit (default 100, maximum 1,000; reset at midnight UTC). The application also permits at most ten searches per minute and spaces requests by at least one second. Failed provider attempts count toward the daily allowance. Limits are enforced in database transactions across processes; the provider's own limits and billing still apply. Requests use a fixed HTTPS provider endpoint, no redirects, a 12-second timeout, a bounded response, schema validation, and sanitized errors. Secrets and raw provider errors are excluded from audit history.

Endpoints: authenticated `GET /api/integrations/leads`; owner/staff `POST /api/integrations/leads/search` with `{ "query": "independent dentists", "location": "Charleston", "page": 0 }`. Source pages are opened by the user, not fetched by the application. Automatic contact enrichment remains **Under development**.

## Invoice email: implemented

Issued invoice PDFs can be sent through SMTP. In **Settings → Integrations**, owners can inspect configuration problems, run **Check connection**, see the last completed check, and see the last invoice accepted by SMTP. Manual delivery records do not count as SMTP acceptance.

The check uses [Nodemailer's SMTP verification](https://nodemailer.com/smtp#verifying-the-configuration), which tests the connection and configured authentication without sending mail. It does not verify that the provider approves a particular sender or that a recipient receives a message.

| Status | Meaning |
| --- | --- |
| Setup required | Required server settings are missing or invalid. Invoice email is disabled. |
| Needs verification | Settings are present but have not been checked, changed since the last check, or the check is older than 24 hours. |
| Checking connection | A check is in progress. An interrupted check becomes retryable after one minute. |
| Connection verified | The connection, TLS, and configured authentication passed a recent check. This is not a delivery receipt. |
| Connection failed | The most recent completed check failed. Review server settings and retry. |

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, and `SMTP_PASSWORD` in the private server environment. Use `SMTP_SECURE=false` with required STARTTLS on port 587, or `SMTP_SECURE=true` for immediate TLS on port 465. The sender must be approved by the email provider. Authentication fields must both be present or both absent for a relay that authorizes the server by its network identity. Restart the app after changing these settings, then check the connection.

Credentials are never returned by the diagnostics endpoint or written into diagnostic history. Checks retain only sanitized results and a keyed configuration fingerprint in the existing immutable audit trail. Changing SMTP settings invalidates previous verification. Owners alone can inspect/test SMTP; checks require a trusted request origin and are limited to one attempt per organization per minute across application processes. TLS is required for both checks and actual sends. There is no new schema migration.

Endpoints: owner-only `GET /api/integrations/smtp` and `POST /api/integrations/smtp/check`.

## Apply provider settings on this Docker installation

After editing the private `.env` file, recreate the app container so it receives the new environment:

```sh
docker compose up -d --no-deps --force-recreate app
```

Then open Settings → Integrations to inspect status. Use **Check connection** for SMTP, or run a search in Prospecting for Tavily. Keep the environment file outside version control.

## Under development

| Integration | Available today |
| --- | --- |
| Automatic contact enrichment and verification | Provider-backed discovery, manual source research, qualification, saved filters, and pipeline conversion |
| Communication inbox and reply tracking | Client notes and uploaded correspondence |
| Outreach sequences and reply automations | Manual follow-up dates and existing recurring billing rules |
| Stripe checkout, processor refunds, and payment webhooks | Manual recording of payments/refunds already handled externally |
| Bank synchronization and automatic transaction matching | Expense entry and manual reconciliation |
| Proposal delivery, online acceptance, and electronic signatures | Internal proposal drafts and uploaded signed documents |

Adding credentials does not enable these unfinished integrations. No external discovery, customer outreach, charges, processor refunds, bank synchronization, or signing is performed by these cards.

## Verification

- `tests/leads.test.ts`: provider request formatting, source previews without automatic persistence, unsafe/duplicate URL filtering, organization-scoped duplicate detection, request validation, empty results, provider errors, timeouts, bounded responses, concurrency/quota limits, and credential-change invalidation. External requests use controlled test responses.
- `tests/integrations-status.test.ts`: configuration validation, truthful states, audit persistence, sanitized failures, owner access, organization isolation, changed/expired verification, and concurrent/repeated-check prevention.
- `tests/smtp-transport.test.ts`: real SMTP over loopback TLS with a temporary fixture certificate. Verification sends no message; an explicit fictional invoice send includes its PDF, produces SMTP audit evidence, and is distinguished from manual delivery. Invalid authentication and missing STARTTLS fail. No external provider or real recipient is contacted.
- `tests/e2e/workspace.spec.ts`: visible development/setup labels, direct integration links, owner-only diagnostics, unauthenticated/CSRF rejection, disabled unconfigured check, failure/retry UI, refresh, and desktop/mobile layout. A separate browser flow exercises search failure/retry, pagination, source review, and saving only reviewer-entered facts against the real isolated database, with provider responses intercepted. Browser test servers explicitly clear inherited SMTP and Tavily credentials.

Provider tests use fixtures; deployment verification also checks Tavily with the configured server key. SMTP transport tests use a local TLS server; production email remains setup-dependent.
