# Current server

Server: `alienwareserver`, Tailscale IPv4 `100.95.159.90`.
Checkout: `/home/greed/wintron-os`.
Application: **https://wintron-os.tail70d8db.ts.net**.

The current Tailscale service `svc:wintron-os` proxies this canonical HTTPS address to `http://127.0.0.1:3000`. `APP_URL` uses this address. The older `:8443` Serve route remains an alias; use the canonical hostname for sign-in and mutation-origin checks.

Connect the browser device to Tailscale and use the HTTPS hostname; the certificate is issued for the hostname, not the numerical IP. Ports 80 and 443 already serve other applications. Wintron uses 8443; the existing port-443 proxy to localhost:3001 is preserved. No Funnel is configured for Wintron.

## Reboot persistence

Verified `docker.service` and `tailscaled.service` are both enabled and active. The app, database and scheduler containers use `restart: unless-stopped`. Their database and document data reside in Docker named volumes. A normal weekly reboot requires no manual launch. Manually stopping the containers keeps them stopped until explicitly started.

Tailscale Serve was configured persistently with:

```bash
tailscale serve --bg --https=8443 http://127.0.0.1:3000
```

The background proxy resumes after reboot, as documented by [Tailscale](https://tailscale.com/docs/reference/tailscale-cli/serve#effects-of-rebooting-and-restarting). The protected `.env` now has `APP_URL=https://wintron-os.tail70d8db.ts.net`; the app and scheduler use that canonical service origin. Do not replace the secret values.

## Verify or recover after maintenance

```bash
cd /home/greed/wintron-os
systemctl is-enabled docker tailscaled
systemctl is-active docker tailscaled
docker compose ps
tailscale serve status
curl --fail https://alienwareserver.tail70d8db.ts.net:8443/api/health
# If the existing containers were manually stopped:
docker compose start db app scheduler
```

If the Serve route was explicitly removed, reapply the command above. Do not use `tailscale serve reset`, which would remove other applications’ routes. Do not use `docker compose down -v`, which deletes stored business data.

## First sign-in

No bootstrap account has been invented. Run this once in an interactive terminal, substituting the actual owner identity:

```bash
cd /home/greed/wintron-os
docker compose run --rm --no-deps app npx tsx scripts/create-admin.ts --email YOUR_EMAIL --name 'YOUR NAME'
```

Enter a password of at least 14 characters at the hidden prompt. Sign in using the HTTPS link and enroll MFA.

## Checks performed

HTTPS login and health returned 200 with a valid certificate, resolving to `100.95.159.90`. Unauthenticated business data returned 401. All three Wintron containers were restarted and the HTTPS health check recovered successfully. Startup policies were inspected; the shared host itself was not rebooted as part of verification. Other tailnet devices still need network policy permission to reach port 8443.

## Workspace rollout — November 12, 2026

The redesigned workspace was deployed to the existing app and scheduler. Migration `202611110001_workspace` was applied successfully. Before migration, application writers were paused and a protected local database/document recovery snapshot was taken; the database dump was restored in a network-isolated PostgreSQL container and compared against record counts and financial totals. Those same invariants matched after migration. Document checksums verified. Prior Docker images were retained for application rollback.

Local recovery material: `.data/rollout-20261112T192324Z/` (mode 0700), with a Compose rollback override and prior image identifiers. This is a local recovery snapshot, not an offsite backup configuration.

The canonical live HTTPS login and health endpoint returned 200, anonymous `/api/workspace` returned 401, the served redesign CSS and Wintron mark matched the new build, and the public login browser check reported no exceptions. Authenticated workflows were verified in the isolated test application, without creating test accounts or business records in production.
