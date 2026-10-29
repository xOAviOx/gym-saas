# Local setup

Everything runs locally against the Supabase CLI stack in Docker. Nothing in this guide touches a hosted project.

## 1. Prerequisites

- Node 22 or newer and pnpm 11 or newer
- Docker Desktop, running (the Supabase CLI starts Postgres, Auth, PostgREST, Storage, Studio and Mailpit as containers; roughly 2 GB of images)

The Supabase CLI is a dev dependency, so run it as `pnpm exec supabase …`.

## 2. Install and start the database

```powershell
pnpm install
pnpm db:start
```

`pnpm db:start` creates the containers, applies every file in `supabase/migrations` in order, then runs `supabase/seed.sql`. When it finishes it prints the local URL and keys. You can print them again at any time:

```powershell
pnpm exec supabase status -o env
```

Local endpoints:

| Service  | URL                                                     |
| -------- | ------------------------------------------------------- |
| API      | http://127.0.0.1:54321                                  |
| Studio   | http://127.0.0.1:54323                                  |
| Mailpit  | http://127.0.0.1:54324                                  |
| Postgres | postgresql://postgres:postgres@127.0.0.1:54322/postgres |

Email confirmations are turned off for local development (`enable_confirmations = false` in `supabase/config.toml`), so a new account is signed in immediately. Password-reset emails are delivered to Mailpit.

## 3. Create `.env.local`

```powershell
Copy-Item .env.example .env.local
```

Fill in the values:

| Variable                        | Local value                                      |
| ------------------------------- | ------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | `http://127.0.0.1:54321`                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `ANON_KEY` from `supabase status -o env`         |
| `SUPABASE_SERVICE_ROLE_KEY`     | `SERVICE_ROLE_KEY` from `supabase status -o env` |
| `NEXT_PUBLIC_APP_URL`           | `http://localhost:3000`                          |
| `PORTAL_TOKEN_SECRET`           | random, 32+ characters (see below)               |
| `SECRETS_ENCRYPTION_KEY`        | random, exactly 32 bytes, base64 (see below)     |
| `CRON_SECRET`                   | random, 32+ characters (see below)               |

Generate the three secrets without OpenSSL:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # PORTAL_TOKEN_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # SECRETS_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # CRON_SECRET
```

Save the file as UTF-8 without a byte-order mark. The app validates every variable at boot (`lib/env.ts`) and fails with a clear message if one is missing.

## 4. Run the app

```powershell
pnpm dev
```

Open http://localhost:3000. You are sent to `/sign-in`; create an account with email and password, then follow the three onboarding steps (gym details, plans, first member).

Google sign-in needs an OAuth client configured in Supabase; it is not set up locally, and the button shows a clear message when it is unavailable.

## 5. Checks

```powershell
pnpm lint
pnpm typecheck
pnpm test          # unit tests, no database needed
pnpm test:rls      # tenant isolation tests; needs pnpm db:start
```

`pnpm test:rls` creates two throwaway gyms through the real sign-up path and proves that neither can read or write the other's rows, that function-only tables reject direct writes, and that anonymous requests are refused. It cleans up after itself.

## 6. Changing the database

SQL is the source of truth. After editing anything in `supabase/migrations`:

```powershell
pnpm db:reset      # recreate the local database from the migrations and seed
pnpm db:types      # regenerate lib/supabase/database.types.ts
pnpm typecheck
```

Commit the regenerated types file. CI starts a fresh Supabase, regenerates the types and fails if the committed file differs.

Conventions in the migrations:

- Every table has RLS enabled and `anon` has no grants at all.
- `EXECUTE` is revoked from `PUBLIC` on every function; functions meant for the app are granted to `authenticated`, internal and privileged ones only to `service_role`.
- Multi-step writes are `security definer` functions that check the caller's role with `assert_org_role` and write their own audit rows.
- Business errors are raised as short keys (`forbidden`, `invoice_void`, `checkin_blocked`, …) and mapped to user-facing text in `lib/errors.ts` through `copy.errors.db`.

## 7. Stopping

```powershell
pnpm db:stop       # keeps the data volume; pnpm db:start resumes where you left off
```

## Windows notes

- PowerShell 5.1 prints stderr from Node tools as `NativeCommandError`; the commands still succeed. Check `$LASTEXITCODE` rather than the red text.
- Docker Desktop stores its WSL disk image under `%LOCALAPPDATA%\Docker\wsl` by default. If the system drive is short on space, move it from Docker Desktop → Settings → Resources → Advanced → Disk image location before starting Supabase.
