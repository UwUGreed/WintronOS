# Security model and operating requirements

The application stores customer and financial data. Tailscale is an additional network control; it does not bypass individual application authentication. Owner, Staff and Accountant roles are enforced in the API/service layer.

| Action                                                           | Owner | Staff | Accountant |
| ---------------------------------------------------------------- | ----- | ----- | ---------- |
| Read business data / reports / authorized documents              | Yes   | Yes   | Yes        |
| Client, note, draft, issue, payment, expense, retainer workflows | Yes   | Yes   | No         |
| Void, refund, expense reversal, reconciliation                   | Yes   | No    | No         |
| Ownership, taxes, journals, organization configuration           | Yes   | No    | No         |
| Provision users / roles / revoke staff sessions                  | Yes   | No    | No         |
| Own password, MFA and sessions                                   | Yes   | Yes   | Yes        |

Better Auth maintains scrypt password hashes, opaque sessions with expiration and revocation, HttpOnly same-site cookies, TOTP and recovery codes. MFA enrollment is available from day one; the operator should enable `REQUIRE_MFA=true` after founders enroll. Lockout fields and database rate-limit records are migrated. Accounts are invitation/provisioning only; public signup is disabled. The bootstrap CLI refuses a second owner. New staff receive a strong temporary password out of band and should change it immediately.

Mutations validate exact configured Origin and reject cross-site requests. Auth routes use Better Auth's own origin/CSRF protections. HTTPS origin activates secure cookies and HSTS. PostgreSQL is internal to the Compose network. Private files are served only through authenticated authorization checks, never the public directory. Filenames are replaced with UUID storage keys; uploads are bounded, type-sniffed and extension-checked; downloads force attachment and verify stored hashes. Files remain untrusted: this implementation has no antivirus/content-disarm service.

Zod validates business payloads. Prisma binds query parameters. Notes are sanitized to an allowlist before persistence and displayed as sanitized rich text. CSV export neutralizes formula-leading values. Response security headers include CSP, frame denial, MIME-sniffing protection and restrictive permissions. CSP allows inline script/style for the Next.js runtime; a per-request nonce policy is a remaining hardening improvement.

Issued invoice headers and lines are immutable except controlled void status/reason. Financial corrections retain originals, reversal journals, actor and reasons. PostgreSQL deferred constraint triggers verify journal balancing at commit. Financial operations use serializable transactions and retry serialization conflicts. Idempotency keys bind payment requests and recurring invoice periods. An issued invoice's client/company identity is snapshotted; later CRM edits do not rewrite its PDF billing identity.

Audit rows capture actor, action, entity, timestamp, and change snapshots for important client/settings records. Audit rows cannot be updated/deleted through the database triggers. They are not cryptographically tamper-proof against a database superuser. Database credentials and host administrators remain trusted. Production should use separate migration/runtime roles with appropriate PostgreSQL privileges if stronger separation is required.

Secrets stay in protected environment/configuration, never browser settings responses or Git. Build sanitation removes Next standalone's copied `.env` files. Docker context excludes `.env`, data, tests results and Git. Ordinary request failures log category and route, not payloads, password values, connection strings or SMTP secrets.

## Recovery and incident response

Use saved single-use MFA recovery codes if the authenticator is lost. Use an authenticated second owner for account access/session revocation. For loss of both founders' access, a trusted host administrator must verify identity out of band, record an incident, and follow a controlled database-backed credential reset; do not enable public signup or disable MFA globally as a shortcut. See `scripts/recover-account.ts` once identity verification has been completed. Database backups and the Better Auth secret must be recovered together for encrypted MFA material.

For compromise: disable affected membership, revoke sessions, stop external delivery, preserve audit/backup evidence, rotate relevant provider/session/database credentials with a documented re-enrollment plan, and restore only after investigating the failure. An unavailable database means in-app notifications cannot be relied upon; monitor systemd/Docker externally.

## Release limitations

Automated tests and a clean dependency audit are evidence, not a penetration test or accounting certification. Before real business use, perform independent security review, accountant review, real Tailscale HTTPS checks, MFA enrollment, SMTP test, offsite backup and target-host restoration. Large-scale pagination, more granular client-specific staff permissions, antivirus scanning, nonce-based CSP and formal accounting period locks are not yet implemented. Accounts are currently organization-wide. These are explicit limitations, not hidden frontend-only access controls.
