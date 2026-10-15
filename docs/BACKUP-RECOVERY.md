# Backup and recovery

`backup.sh` covers the PostgreSQL dump, all private client attachments, expense receipts, retained document files, versioned migrations, configuration and source commit identifier. PDFs are reproducibly generated from immutable invoice data and identity snapshots, which are included in the database backup. Repository backups are encrypted by restic before upload.

## Offsite configuration

Install a supported restic release on the Linux host. Set up an offsite restic repository (for example S3-compatible object storage or SFTP) with restricted credentials. Create `/etc/wintron/backup.env`, mode 0600, outside the repository and outside the backup destination:

```text
RESTIC_REPOSITORY=s3:https://YOUR_ENDPOINT/YOUR_BUCKET/wintron
RESTIC_PASSWORD_FILE=/etc/wintron/restic-password
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY
```

Use the environment keys required by your selected provider. Create the password file separately (mode 0600), preserve its value in your offline recovery process, and never store it in the repository destination. The application `.env` belongs in the encrypted backup; the restic encryption key does not. Initialize once with `restic init` in an environment containing these variables. See [restic repository documentation](https://restic.readthedocs.io/en/stable/045_working_with_repos.html).

```bash
# In a shell with the protected provider environment loaded:
scripts/backup.sh
scripts/verify-backup.sh
```

`backup.sh` serializes runs with `flock`, briefly stops application writers for a consistent database/files snapshot, resumes them even on errors, uploads the encrypted snapshot, checks repository structure plus a rotating subset of data, and records status when the database is available. The production script rejects local filesystem destinations. It does not prune automatically; establish retention only after a successful rehearsal.

Install the supplied systemd service/timer examples after adjusting `/opt/wintron-os`. The daily timer is 03:00 America/New_York; the weekly restoration check is Sunday 04:00 America/New_York. No system services or schedules are installed automatically by this checkout.

```bash
sudo cp docs/systemd/wintron-* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now wintron-backup.timer wintron-restore-check.timer
systemctl list-timers 'wintron-*'
```

## Automated verification

The weekly check downloads the latest encrypted offsite snapshot, verifies all repository data, validates document SHA-256 hashes, restores into a disposable PostgreSQL container without a network interface or published port, and checks journal/invoice invariants. The disposable instance uses local trust authentication only inside its isolated container and is destroyed on exit. Production retains password authentication.

The local `scripts/test-restore.sh` exercises encryption, restore, document hashes, configuration round-trip, PostgreSQL restoration and journal counts without needing offsite credentials. Passing it demonstrates the recovery mechanics; it does not verify a real offsite provider, scheduled operation, key escrow or target-host disaster recovery.

## Restore to a new server

1. Preserve the original server/volumes. Select a known-good snapshot, inspect its timestamp, source commit and job status.
2. Provision a clean Linux host, Docker, Tailscale and restic. Retrieve offsite access and the encryption key from separate custody.
3. Check out the recorded source revision. Restore the encrypted application `.env` from the snapshot into a protected local location, review it, and set the new Tailscale origin. Reuse `BETTER_AUTH_SECRET` if preserving encrypted MFA credentials; rotating it requires deliberate session/MFA recovery.
4. Build the image, with an empty destination database and document volume. Run:

```bash
docker compose build
scripts/restore.sh --new-installation-only SNAPSHOT_ID
docker compose run --rm migrate
docker compose up -d app scheduler
```

The restore script refuses any nonempty public database schema. It does not drop, truncate or overwrite an existing database. If a partial restore fails, retain the failed environment for diagnosis and retry into a different empty installation.

5. Verify health, HTTPS authentication, MFA, client counts, invoice totals, journal balance, receipt downloads and generated PDFs. Review the latest pending deliveries and scheduled periods before resuming external email or recurring operations.
6. Confirm offsite backups from the new host, then retire the old host only after operator approval.

Keep recovery notes recording snapshot ID, code revision, host, checks and time to recover. The local rehearsal result is recorded in `docs/VERIFICATION.md`; a real offsite rehearsal remains an operator acceptance item until credentials are supplied.
