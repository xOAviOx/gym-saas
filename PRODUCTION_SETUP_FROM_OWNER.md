# What is needed from the project owner

Updated 8 November 2026.

GymDesk's zero-cost production code is prepared. The remaining work needs account ownership, a few business decisions, production credentials entered securely, public deployment and testing on real devices.

Do **not** paste passwords, service-role keys, database URLs, SMTP passwords, API tokens, SSH private keys or backup passwords into chat, GitHub issues, screenshots or source files. Enter them directly in the provider dashboards, GitHub Actions secrets or the untracked `.env.production` file.

## 1. Decisions to provide

These answers are not secrets and can be shared with the developer:

1. Public product name: keep **GymDesk** or provide another name.
2. Preferred free hostname, such as `gymdesk-avish.duckdns.org`.
3. Main administrator email.
4. Support email and phone number.
5. First pilot gym's name and city.
6. Preferred production region, normally the closest available region to the clients.
7. Confirm that the pilot starts with direct UPI/cash payments.
8. Confirm that the pilot starts with manual WhatsApp links.
9. Confirm whether a card can be used for Oracle and Cloudflare identity/billing verification. Staying inside the documented free allowances should keep the recurring infrastructure bill at ₹0.
10. Authorize committing and pushing the free-production changes.

Recommended starting choices: keep GymDesk, use DuckDNS, direct UPI/cash, manual WhatsApp and one shared multi-tenant Supabase production project.

## 2. Accounts the owner must control

Turn on multi-factor authentication wherever available and keep recovery codes offline.

### 2.1 Oracle Cloud

Oracle Cloud runs the Next.js application.

Create an Oracle Cloud account and choose the home region carefully. Always Free resources must be created in the home region.

Create this compute instance:

- Name: `gymdesk-production`
- Image: Ubuntu
- Shape: `VM.Standard.A1.Flex`, marked Always Free
- Resources: 1 OCPU and 6 GB RAM
- Network: public subnet
- Public IPv4 address: enabled
- SSH authentication: an existing public key or a newly generated key pair
- Boot volume: the default Always Free-eligible size

Oracle documents this 1 OCPU/6 GB Ampere configuration in its [first Linux instance guide](https://docs.oracle.com/en-us/iaas/Content/Compute/tutorials/first-linux-instance/overview.htm). Free capacity may be temporarily unavailable, and idle Always Free instances can be reclaimed under Oracle's [Always Free rules](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

Open these network ports:

- TCP 22: only from the administrator's IP when practical
- TCP 80: public, for certificate issuance and HTTP redirects
- TCP 443: public, for HTTPS
- UDP 443: public, for HTTP/3

Keep the SSH private key on the administrator's computer. The developer needs the public IP address and SSH username, but the private key must never be sent through chat.

### 2.2 Supabase

Supabase provides PostgreSQL, authentication and private member-photo storage.

Create one Free project:

- Project name: `gymdesk-production`
- Region: the closest available region to the first clients
- Database password: strong, unique and saved permanently in a password manager

Do not create one project per gym. The existing schema is multi-tenant and isolates gyms with row-level security.

Record these values securely:

- Project reference
- Project URL
- Anon/public key
- Service-role key
- Database session-pooler connection URL

The GitHub backup workflow must use the shared pooler in **session mode on port 5432**, because GitHub-hosted runners need IPv4 connectivity. Copy the URL from Supabase's **Connect** dialog instead of constructing it manually. Percent-encode reserved characters in the database password. See [Supabase's connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

After the DuckDNS address exists, configure Supabase Authentication:

- Site URL: `https://YOUR-NAME.duckdns.org`
- Allowed redirect: `https://YOUR-NAME.duckdns.org/auth/callback`

The `uploads` storage bucket must remain private. Do not make it public to work around an image problem.

### 2.3 DuckDNS

DuckDNS provides the initial free public hostname.

1. Sign in at [DuckDNS](https://www.duckdns.org/).
2. Create a unique subdomain.
3. Point it to the Oracle VM's public IPv4 address.
4. Record the complete hostname, such as `iron-temple-desk.duckdns.org`.

The DuckDNS token is secret. If the VM's public IP remains unchanged, GymDesk does not need the token.

### 2.4 Cloudflare R2

R2 stores encrypted database backups separately from the VM and Supabase. Cloudflare requires R2 to be enabled before API credentials can be generated; its dashboard may require billing details even when usage remains inside the free allowance.

Create:

- Bucket name: `gymdesk-backups`
- Storage class: **Standard**
- Public access: disabled
- Location hint: APAC if available

Create a bucket-scoped API token:

- Permission: **Object Read & Write**
- Scope: only `gymdesk-backups`
- Save the Access Key ID and Secret Access Key immediately
- Record the Cloudflare Account ID

Cloudflare only shows the secret access key once. Follow its [R2 token instructions](https://developers.cloudflare.com/r2/api/tokens/).

Add a lifecycle rule:

- Prefix: `database/`
- Delete after: 14 days
- Status: enabled

The setting is under **R2 → bucket → Settings → Object Lifecycle Rules**. See [R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

### 2.5 Dedicated Gmail account

Supabase's default email sender is not suitable for real production users. Its default service restricts recipients and is intended for testing. See [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

For the zero-cost, low-volume pilot:

1. Create a separate Gmail account used only by GymDesk.
2. Enable Google two-step verification.
3. Create a Google App Password for SMTP.
4. Store the app password in a password manager.

Google requires two-step verification before creating an app password. See [Google's App Password instructions](https://support.google.com/mail/answer/185833).

Configure Supabase Authentication SMTP:

- Host: `smtp.gmail.com`
- Port: 465 with SSL, or 587 with STARTTLS
- Username: the complete Gmail address
- Password: the generated app password, not the normal Google password
- Sender address: the same Gmail address
- Sender name: `GymDesk`

This is a pilot solution. Replace it with a branded transactional-email sender after purchasing a custom domain.

### 2.6 GitHub

The repository owner must be able to manage GitHub Actions secrets. The current free-production changes must be committed and pushed before the new workflows can run.

GitHub's documented path is:

**Repository → Settings → Secrets and variables → Actions → New repository secret**

See [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

## 3. Production application environment

The Oracle VM needs an untracked `.env.production` file. Start from `.env.production.example` and set file permissions to owner-only.

| Variable                        | Source                                      | Secret  |
| ------------------------------- | ------------------------------------------- | ------- |
| `APP_DOMAIN`                    | DuckDNS hostname only                       | No      |
| `ACME_EMAIL`                    | Administrator email                         | No      |
| `NEXT_PUBLIC_APP_URL`           | `https://APP_DOMAIN` with no trailing slash | No      |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project                            | No      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project                            | No      |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase project                            | **Yes** |
| `PORTAL_TOKEN_SECRET`           | Newly generated                             | **Yes** |
| `SECRETS_ENCRYPTION_KEY`        | Newly generated                             | **Yes** |
| `CRON_SECRET`                   | Newly generated                             | **Yes** |

Generate the application secrets independently on a trusted machine or the VM:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -base64 32
```

Use the outputs as follows:

- First hexadecimal output: `PORTAL_TOKEN_SECRET`
- Second hexadecimal output: `CRON_SECRET`
- Base64 output: `SECRETS_ENCRYPTION_KEY`

Save them in a password manager. Losing `SECRETS_ENCRYPTION_KEY` prevents recovery of Cashfree or WhatsApp credentials encrypted with that key.

## 4. GitHub Actions secrets

Add these repository secrets after the workflows are pushed:

| GitHub secret                | Value                                       |
| ---------------------------- | ------------------------------------------- |
| `PRODUCTION_URL`             | Final HTTPS origin without a trailing slash |
| `CRON_SECRET`                | Same value stored on the VM                 |
| `SUPABASE_DB_URL`            | Session-pooler database URL on port 5432    |
| `BACKUP_ENCRYPTION_PASSWORD` | Output of `openssl rand -base64 48`         |
| `R2_ACCOUNT_ID`              | Cloudflare account ID                       |
| `R2_ACCESS_KEY_ID`           | Bucket-scoped R2 access key                 |
| `R2_SECRET_ACCESS_KEY`       | Bucket-scoped R2 secret access key          |
| `R2_BACKUP_BUCKET`           | `gymdesk-backups`                           |

Do not add the Supabase service-role key to GitHub. It belongs only in the VM's `.env.production` file.

## 5. Deployment work after the accounts are ready

Once the accounts exist and the non-secret decisions are answered, the remaining technical sequence is:

1. Commit and push the free-production code.
2. Link the production Supabase project.
3. Apply all database migrations.
4. Install Docker Engine and the Compose plugin on the Oracle VM.
5. Clone the repository onto the VM.
6. Create and protect `.env.production`.
7. Run `./scripts/deploy-free.sh`.
8. Verify Caddy obtained an HTTPS certificate.
9. Verify `/api/health` returns `{"status":"ok"}`.
10. Manually trigger the production backup, daily job and uptime workflows.
11. Download and validate one encrypted backup.
12. Restore the backup into a separate local test database.
13. Create the first owner account and organization.
14. Confirm every shared link uses the public HTTPS address rather than `localhost`.

The full technical procedure is in [docs/free-production.md](docs/free-production.md).

## 6. Information needed from each client gym

Collect:

- Legal or business name
- Display name
- Address and state
- Owner name
- Owner email and phone
- GSTIN, if registered
- Invoice prefix
- UPI VPA
- UPI payee name
- Membership plans and prices
- Existing member spreadsheet
- Staff names, emails and roles
- Attendance rules
- Whether expired members may check in
- WhatsApp consent process
- Support contact
- Data-retention and deletion requirements

The owner must confirm that the gym is authorized to provide and process member names, phone numbers, photographs, attendance and payment information.

## 7. Real-device testing required from the owner

Use fake members during testing.

- Android phone: install the PWA, take a member photo and open a QR link.
- iPhone: test Safari photo capture, QR download and the WhatsApp link.
- Front-desk tablet: test QR scanning, kiosk pairing and PWA installation.
- Separate phone/network: open member portal, payment and QR links and confirm none contain `localhost`.
- Desktop computer: open invoice and receipt PDFs.
- Printer, if the gym prints receipts: verify one real print.

## 8. Legal and operating decisions

Before accepting real client data, prepare:

- Privacy policy
- Terms of service
- Support email and phone
- Data-retention and deletion policy
- Backup-retention policy
- Named person responsible for incidents
- Procedure for exporting a gym's data
- Procedure for permanently deleting a gym or member
- Written agreement covering the gym's authority and member consent
- Support hours and expected response time

These documents can be simple for a controlled pilot, but they must exist before storing real member data.

## 9. Not required for the zero-cost pilot

- Vercel Pro
- Supabase Pro
- Google Play publication
- Apple App Store publication
- Paid custom domain
- Cashfree
- WhatsApp Cloud API
- Google OAuth
- Separate infrastructure for every gym

Direct UPI/cash, manual WhatsApp and the installable PWA are sufficient for the first controlled pilot.

## 10. Immediate owner checklist

- [ ] Answer the ten non-secret decisions in section 1.
- [ ] Create or sign in to Oracle, Supabase, DuckDNS, Cloudflare and the dedicated Gmail account.
- [ ] Enable MFA and save recovery codes.
- [ ] Create the Oracle VM and record its public IP.
- [ ] Create the Supabase production project and retain its database password.
- [ ] Choose and point the DuckDNS hostname.
- [ ] Create the private R2 bucket, scoped token and 14-day lifecycle rule.
- [ ] Configure Gmail SMTP in Supabase.
- [ ] Authorize committing and pushing the repository changes.
- [ ] Add the GitHub secrets after the workflows appear on GitHub.
- [ ] Keep an Android phone, iPhone and front-desk tablet available for final testing.

When these items are ready, the handoff message is: **“Accounts are ready; deploy it.”**
