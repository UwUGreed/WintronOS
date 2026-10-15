# Implementation checklist

Architecture: single-organization modular monolith; Next.js App Router, Better Auth database sessions and TOTP, Prisma/PostgreSQL, local private files, Decimal money, transactional double-entry journals, Docker and Tailscale. Organization access is derived from authenticated membership. No public signup. No production seed.

- [x] Foundation: schema, versioned migrations, authentication, roles, Docker/Compose
- [x] CRM: client records, contacts, sanitized rich notes/history, projects, files, scoped search
- [x] Invoices: drafts, immutable issuance, number/snapshot, PDF, delivery, void/reissue
- [x] Payments: allocations, unapplied funds, idempotency, refunds, reconciliation
- [x] Accounting: database-balanced ledger, paid expenses, owner transactions, CSV/PDF reports
- [x] Tax planning: versioned configurable assumptions, reserves, owner allocations, entity payments
- [x] Retainers: scheduling, renewal dates, time entries, idempotent recurring drafts
- [x] Interface: all nine modules, responsive navigation, dialogs, empty/error/loading states
- [x] Service verification: decimal units and PostgreSQL integration tests
- [x] Operations: encrypted offsite workflow, documented scheduling, successful local encrypted restoration
- [x] Documentation: deployment, recovery, architecture, security and API
- [x] Final browser verification, Docker runtime and restart/persistence checks recorded in VERIFICATION.md

External acceptance items (not assumed completed): actual founder provisioning, MFA enforcement, target-server/tailnet HTTPS verification, configured SMTP delivery, offsite repository credentials and key escrow, target-host disaster recovery drill, accountant review and independent security review. Jurisdiction-specific obligation calculations are disabled until authoritative rules and individual facts are verified.

Explicit implementation limits: no automatic tax filing or statutory obligation engine, no Stripe/bank sync, no separate credit-note document type (refund/void/reissue implemented), no sophisticated multi-bank reconciliation, no virus scanning, no formal period-close lock, no paginated large-data UI or public multi-tenant provisioning. See README and SECURITY.md.
