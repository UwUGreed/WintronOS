# API

All `/api/*` business endpoints require a Better Auth session cookie and active organization membership. `GET /api/health` returns only health, `GET /api/me` returns the signed-in account's own basic identity for MFA enrollment. No organization ID is accepted from callers. JSON monetary fields are decimal strings. Dates use `YYYY-MM-DD`. Monetary outputs are serialized decimal strings.

For POST/PATCH, send `Content-Type: application/json` and an `Origin` exactly matching `APP_URL`. Multipart uploads also require that origin. Auth routes implement their own Better Auth origin/CSRF protection. Error bodies are `{ "error": "message" }` with 400 validation, 401 authentication, 403 authorization/origin, 404 inaccessible record, 409 conflict, 413 size, 502 SMTP, or 503 failed transaction/service.

| Endpoint                             | Behavior                                                         | Role        |
| ------------------------------------ | ---------------------------------------------------------------- | ----------- |
| GET /state?from=&to=                 | Dashboard, records and journal-derived summaries                 | All         |
| GET /search?q=                       | Scoped clients, invoices, projects, notes                        | All         |
| GET /clients/:id                     | Profile, notes/history, contacts, projects, files, timeline      | All         |
| POST /clients[/:id]                  | Create/update client, including inactive archival status         | Staff/Owner |
| POST /notes[/:id]                    | Sanitized rich text + edit history                               | Staff/Owner |
| POST /contacts                       | Add client contact                                               | Staff/Owner |
| POST /projects[/:id]                 | Create/update project                                            | Staff/Owner |
| POST /invoices[/:id]                 | Create/edit draft; line array required                           | Staff/Owner |
| POST /invoices/:id/issue             | Immutable number/snapshot + journal                              | Staff/Owner |
| GET /invoices/:id/pdf                | Branded server-generated PDF                                     | All         |
| POST /invoices/:id/duplicate         | Copy to a new unissued draft                                     | Staff/Owner |
| POST /invoices/:id/send              | Configured SMTP delivery                                         | Staff/Owner |
| POST /invoices/:id/delivery          | Record external delivery event                                   | Staff/Owner |
| POST /invoices/:id/void              | Reason/date; no net allocated payment allowed                    | Owner       |
| POST /payments                       | Amount, client, receipt date/method, idempotencyKey, allocations | Staff/Owner |
| POST /payments/:id/allocate          | invoiceId, amount, date                                          | Staff/Owner |
| POST /payments/:id/refund            | amount, date, reason, optional allocationId                      | Owner       |
| POST /payments/:id/reconcile         | reconciled boolean                                               | Owner       |
| POST /expenses                       | Paid expense with mapped expense account                         | Staff/Owner |
| POST /expenses/:id/reverse           | Reason/date and reversing journal                                | Owner       |
| POST /retainers[/:id]                | Create/update/pause/cancel contract, with audit history          | Staff/Owner |
| POST /retainers/run                  | Idempotent due draft generation                                  | Staff/Owner |
| POST /retainers/:id/time             | Date, minutes, description                                       | Staff/Owner |
| POST /documents                      | Multipart file and authorized parent ID                          | Staff/Owner |
| GET /documents/:id                   | Authenticated attachment download + hash validation              | All         |
| GET /reports?type=&format=&from=&to= | CSV or PDF                                                       | All         |
| POST /owners[/:id]                   | Ownership percentages and residency                              | Owner       |
| POST /owner-transactions             | Contribution/distribution/tax distribution                       | Owner       |
| POST /journals                       | Reviewed balanced journal adjustment                             | Owner       |
| POST /tax-config                     | Append a version of planning assumptions                         | Owner       |
| POST /tax-payments                   | Entity tax payment against liability                             | Owner       |
| POST /notifications/refresh          | Generate due/renewal notifications                               | All         |
| POST /notifications/:id              | Mark read for current user                                       | All         |
| GET /settings                        | Users, safe integration flags, jobs, audit                       | Owner       |
| POST /organization                   | Legal/contact/invoice configuration                              | Owner       |
| POST /users[/:id]                    | Provision account or change role/active state                    | Owner       |
| POST /sessions/:id                   | Revoke a staff session                                           | Owner       |

Reports: `profit-loss`, `balance-sheet`, `cash-flow`, `ledger`, `trial-balance`, `aging`, `clients`, `expenses`, `retainers`, `owners`. Formats `csv` (default) and `pdf`.

Payment idempotency keys are scoped to organization and bound to a canonical parsed request hash. Reusing a key for changed details returns a conflict. Financial endpoints do not accept caller-provided totals or journal account IDs for operational workflows. Journal adjustment endpoints deliberately require owner access and an accountant approval reference in the memo.

See `lib/validation.ts` for precise payload schemas; `tests/integration.test.ts` and `tests/e2e/workflow.spec.ts` contain executable examples.
