# Zero-cost production pilot

This is the supported deployment path for the first small GymDesk pilots. It keeps the monthly infrastructure bill at **₹0 while every service remains inside its free allowance**. It is not a free SLA: providers can change limits, Supabase can pause an inactive project, and Oracle can reclaim an idle Always Free VM.

## Stack and limits

| Need                      | Service                                                 |                       Cash cost | Important limit                                                                             |
| ------------------------- | ------------------------------------------------------- | ------------------------------: | ------------------------------------------------------------------------------------------- |
| Next.js app               | Oracle Cloud Always Free Ampere A1 VM                   |                              ₹0 | 2 OCPUs and 12 GB RAM total; capacity is not guaranteed and idle instances may be reclaimed |
| HTTPS                     | Caddy in Docker                                         |                              ₹0 | Ports 80 and 443 must be public                                                             |
| Public address            | DuckDNS subdomain                                       |                              ₹0 | Use a `*.duckdns.org` address until buying a branded domain                                 |
| Postgres, auth, files     | Supabase Free                                           |                              ₹0 | 500 MB database, 1 GB files, 5 GB egress; no automatic backups; inactive projects can pause |
| Encrypted backups         | Cloudflare R2 Standard                                  |                              ₹0 | 10 GB-month free; configure a 14-day lifecycle rule                                         |
| Authentication email      | A low-volume Gmail account through Supabase custom SMTP |                              ₹0 | Best-effort and low-volume; move to a dedicated sender when a branded domain is purchased   |
| Scheduled jobs and uptime | GitHub Actions                                          | ₹0 inside the account allowance | Scheduled workflows can be delayed; failure alerts go to repository watchers                |
| Member messages           | Manual WhatsApp links                                   |               ₹0 infrastructure | A staff member sends each message; WhatsApp Cloud API is optional                           |
| Member payments           | Direct UPI and cash                                     |                 ₹0 platform fee | Cashfree remains optional and has transaction charges when enabled                          |
| Installed experience      | Existing GymDesk PWA                                    |                              ₹0 | Install from the browser; no App Store or Play Store listing                                |

Official limits: [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Supabase pricing](https://supabase.com/pricing), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [DuckDNS](https://www.duckdns.org/faqs.jsp), [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https), and [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## What this repository now supplies

- A multi-architecture, non-root Next.js production image in `Dockerfile`.
- `deploy/free/compose.yml` for the app and Caddy HTTPS proxy.
- `scripts/deploy-free.sh` for validated, repeatable releases.
- `/api/health` for container and external uptime checks.
- GitHub Actions for the 10:00 IST daily job, hourly uptime and encrypted daily database backups.
- Browser-side member photo reduction before private Supabase upload.
- `robots.txt` that keeps the private business app out of search indexes.

## 1. Create the accounts

Create one account/project in each service:

1. An Oracle Cloud tenancy in a region where Ampere A1 Always Free capacity is available. Oracle can request card verification, but its documentation says the card is not charged unless the account is upgraded.
2. One Supabase Free production project. The schema is already multi-tenant, so do not create one project per gym.
3. One DuckDNS subdomain, for example `gymdesk-name.duckdns.org`.
4. One private Cloudflare R2 Standard bucket named `gymdesk-backups`.
5. A separate Gmail account used only as the low-volume authentication sender.

Keep recovery codes for every account offline. Turn on MFA everywhere it is offered.

## 2. Prepare Supabase

From a trusted development computer:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref YOUR_PROJECT_REF
pnpm db:push
```

Then configure the project dashboard:

1. In **Authentication → URL Configuration**, set the Site URL to the final `https://...duckdns.org` URL and add `https://...duckdns.org/auth/callback` to allowed redirects.
2. In **Authentication → SMTP**, configure Gmail SMTP with a dedicated account, two-factor authentication and an app password. Do not store that app password in this repository.
3. Keep the `uploads` bucket private. The migrations create its policies; do not make it public to fix an image issue.
4. Copy the project URL, anon key, service-role key and database pooler connection string. The service-role key and database URL are secrets.

Never run `pnpm db:reset` against this project. Apply migrations only after a backup has completed.

## 3. Create the free VM

Create an Ubuntu Ampere A1 instance with an **Always Free eligible** shape. One OCPU and 6 GB RAM is enough to begin. Attach a public IPv4 address and open:

- TCP 22 only from the administrator's IP when possible.
- TCP 80 from the internet for certificate issuance and HTTP redirects.
- TCP and UDP 443 from the internet for HTTPS.

Install Docker Engine and the Compose plugin using Docker's official Ubuntu instructions. Add the deployment user to the `docker` group, then reconnect the SSH session.

Point the DuckDNS subdomain at the VM's public IPv4 address. If the address changes, update DuckDNS before the next deployment.

## 4. Configure and deploy GymDesk

Clone the repository on the VM and create the untracked production environment file:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Fill every value. `APP_DOMAIN` is the hostname only; `NEXT_PUBLIC_APP_URL` is the matching HTTPS origin with no trailing slash. Generate fresh production secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -base64 32
```

Use the first two outputs for `PORTAL_TOKEN_SECRET` and `CRON_SECRET`; use the base64 output for `SECRETS_ENCRYPTION_KEY`. Never reuse local secrets.

Deploy:

```bash
./scripts/deploy-free.sh
```

The production environment is passed to the Next.js build as a BuildKit secret, so server credentials are not retained in an image layer. Caddy obtains and renews the public certificate automatically.

Verify:

```bash
curl --fail https://YOUR_SUBDOMAIN.duckdns.org/api/health
docker compose --env-file .env.production -f deploy/free/compose.yml ps
docker compose --env-file .env.production -f deploy/free/compose.yml logs --tail=100 app caddy
```

The health response must be `{"status":"ok"}` and both containers must be healthy/running.

## 5. Turn on scheduled operations

Add these GitHub repository secrets:

| Secret                       | Value                                              |
| ---------------------------- | -------------------------------------------------- |
| `PRODUCTION_URL`             | Final HTTPS origin, with no trailing slash         |
| `CRON_SECRET`                | Same value as the VM environment                   |
| `SUPABASE_DB_URL`            | Supabase session-pooler database URL with password |
| `BACKUP_ENCRYPTION_PASSWORD` | A unique value from `openssl rand -base64 48`      |
| `R2_ACCOUNT_ID`              | Cloudflare account ID                              |
| `R2_ACCESS_KEY_ID`           | R2 token access key                                |
| `R2_SECRET_ACCESS_KEY`       | R2 token secret                                    |
| `R2_BACKUP_BUCKET`           | `gymdesk-backups` or the selected bucket name      |

Create the R2 API token with object read/write access to only the backup bucket. Keep the bucket private and add a lifecycle rule that deletes objects under `database/` after 14 days. The backup workflow encrypts each dump before upload.

Run each workflow manually once from the GitHub Actions page:

1. **Production database backup** must upload a non-empty encrypted object.
2. **Production daily job** must return an `ok` response.
3. **Production uptime** must pass.

GitHub emails the repository owner when a scheduled workflow fails. This is basic monitoring, not an uptime SLA.

## 6. Prove backups can be restored

Download one `.dump.enc` object to a trusted computer. Decrypt it without writing the password in the command:

```bash
read -s BACKUP_ENCRYPTION_PASSWORD
export BACKUP_ENCRYPTION_PASSWORD
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in gymdesk.dump.enc -out gymdesk.dump \
  -pass env:BACKUP_ENCRYPTION_PASSWORD
pg_restore --list gymdesk.dump >/dev/null
unset BACKUP_ENCRYPTION_PASSWORD
```

For the restore rehearsal, restore into a new empty local PostgreSQL database and verify row counts and sign-in flows. Never test a restore over the live database. Delete the decrypted dump securely when the rehearsal is complete.

Repeat this rehearsal monthly and before any risky database migration.

## 7. Pilot release gate

Infrastructure being live is not enough. Before storing real client data, complete all of these:

- Test owner sign-in, password reset and staff invitation through the configured SMTP sender.
- Test member creation, compressed photo upload, membership, invoice, receipt and data export.
- Test QR check-in and PWA installation on the actual Android/iPhone/tablet used by the gym.
- Test the WhatsApp link and QR link from a different phone; neither may contain `localhost`.
- Confirm two test gyms cannot see each other's members, payments, photos or reports.
- Complete a backup and restore rehearsal.
- Publish privacy, terms, support, retention and deletion policies.
- Name the person responsible for incidents and client data requests.

Use direct UPI/cash and manual WhatsApp in the free pilot. Enable Cashfree or the WhatsApp Cloud API only when a client explicitly needs them and accepts their usage charges.

## Capacity guardrails

Review usage every week during the pilot. Plan a paid upgrade or data migration before any of these:

- Supabase database reaches 400 MB.
- Supabase files reach 800 MB or monthly egress reaches 4 GB.
- R2 backups approach 8 GB after lifecycle cleanup.
- Authentication mail approaches the sender's safe daily limit.
- VM restarts, reclamation or capacity availability make reliability unacceptable.
- Clients require contractual uptime, guaranteed recovery time or priority support.

At that point, paid hosting is not a technical failure; it is the cost of reliability the free tier does not promise.
