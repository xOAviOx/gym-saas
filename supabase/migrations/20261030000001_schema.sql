-- =============================================================================
-- GymDesk · 0001 · schema
-- Extensions, enums, tables, indexes. No policies or functions here.
-- Conventions: every tenant table has id, org_id, created_at, updated_at.
-- Exceptions: organizations (root), profiles (keyed by auth user),
-- organization_secrets (1:1 with org), counters (composite key), rate_limits (keyed by string).
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.team_role                 as enum ('owner', 'manager', 'staff');
create type public.collection_mode           as enum ('upi_direct', 'razorpay');
create type public.collection_provider       as enum ('upi_direct', 'razorpay'); -- 'razorpay_autopay' added later via ALTER TYPE
create type public.member_source             as enum ('walk_in', 'instagram', 'referral', 'google', 'other');
create type public.plan_type                 as enum ('duration', 'sessions');
create type public.membership_status         as enum ('upcoming', 'active', 'frozen', 'expired', 'cancelled');
create type public.invoice_status            as enum ('unpaid', 'partially_paid', 'paid', 'void');
create type public.payment_method            as enum ('cash', 'upi', 'razorpay', 'card', 'bank_transfer');
create type public.collection_request_status as enum ('pending', 'paid', 'expired', 'cancelled');
create type public.payment_claim_status      as enum ('pending', 'confirmed', 'rejected');
create type public.check_in_method           as enum ('manual', 'qr');
create type public.check_in_flag             as enum ('expiring', 'expired', 'dues_pending');
create type public.message_channel           as enum ('whatsapp_manual', 'whatsapp_api');
create type public.message_status            as enum ('prepared', 'sent', 'delivered', 'failed');
create type public.expense_category          as enum ('rent', 'salaries', 'electricity', 'equipment', 'maintenance', 'marketing', 'supplies', 'other');

-- -----------------------------------------------------------------------------
-- Tenancy
-- -----------------------------------------------------------------------------
create table public.organizations (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null check (char_length(name) between 2 and 80),
  vertical                text not null default 'gym',
  phone                   text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  email                   text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address_line            text,
  city                    text,
  state                   text,
  pincode                 text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  gstin                   text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  gst_enabled             boolean not null default false,
  gst_rate                numeric(5,2) not null default 5 check (gst_rate >= 0 and gst_rate <= 28),
  invoice_prefix          text not null check (invoice_prefix ~ '^[A-Z]{3,4}$'),
  logo_url                text,
  kiosk_pin_hash          text,
  -- Same rule as UPI_ID_REGEX in lib/upi.ts ({2,256}); Postgres caps a repetition bound at 255, hence the split.
  upi_vpa                 text check (upi_vpa is null or upi_vpa ~ '^[a-zA-Z0-9._-]{2,255}[a-zA-Z0-9._-]?@[a-zA-Z]{2,64}$'),
  upi_payee_name          text check (upi_payee_name is null or char_length(upi_payee_name) between 2 and 60),
  default_collection_mode public.collection_mode not null default 'upi_direct',
  settings                jsonb not null default '{"reminder_days_before": [7, 3, 0], "dues_reminder_days_after": [3, 7], "block_expired_checkin": false, "default_language": "en", "messaging_provider": "manual"}'::jsonb,
  timezone                text not null default 'Asia/Kolkata',
  deletion_scheduled_for  timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint organizations_gst_requires_gstin check (gst_enabled = false or gstin is not null),
  constraint organizations_upi_pair check ((upi_vpa is null) = (upi_payee_name is null)),
  constraint organizations_upi_mode_needs_vpa check (default_collection_mode <> 'upi_direct' or upi_vpa is not null)
);

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text,
  phone         text,
  avatar_url    text,
  active_org_id uuid references public.organizations (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Per-gym gateway and messaging credentials. *_enc columns hold AES-256-GCM
-- ciphertext produced by the app with SECRETS_ENCRYPTION_KEY; never plaintext.
create table public.organization_secrets (
  org_id                      uuid primary key references public.organizations (id) on delete cascade,
  razorpay_key_id             text,
  razorpay_key_secret_enc     text,
  razorpay_webhook_secret_enc text,
  whatsapp_phone_number_id    text,
  whatsapp_access_token_enc   text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create table public.team_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.team_role not null default 'staff',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id) where is_active;

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  email       text not null check (email = lower(email) and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role        public.team_role not null default 'staff' check (role <> 'owner'),
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  invited_by  uuid references public.team_members (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index invitations_org_email_idx on public.invitations (org_id, email);

-- Atomic sequences per org: 'member' and 'invoice:<FY>'.
create table public.counters (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  key        text not null,
  next_value bigint not null default 1,
  primary key (org_id, key)
);

-- -----------------------------------------------------------------------------
-- Members, plans, memberships
-- -----------------------------------------------------------------------------
create table public.members (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations (id) on delete cascade,
  member_code             text not null default '', -- assigned by trigger (M-0001)
  full_name               text not null check (char_length(full_name) between 1 and 100),
  phone                   text not null check (phone ~ '^\+[0-9]{8,15}$'),
  alt_phone               text check (alt_phone is null or alt_phone ~ '^\+[0-9]{8,15}$'),
  email                   text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  gender                  text check (gender is null or gender in ('male', 'female', 'other')),
  dob                     date,
  photo_url               text,
  address                 text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  joined_on               date not null default (timezone('Asia/Kolkata', now()))::date,
  source                  public.member_source not null default 'walk_in',
  referred_by_member_id   uuid references public.members (id) on delete set null,
  notes                   text,
  tags                    text[] not null default '{}',
  consent_messaging       boolean not null default false,
  consent_recorded_at     timestamptz,
  status                  text not null default 'new' check (status in ('new', 'active', 'expiring', 'expired', 'frozen')),
  deleted_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (org_id, member_code)
);
create unique index members_org_phone_unique on public.members (org_id, phone) where deleted_at is null;
create index members_org_status_idx on public.members (org_id, status) where deleted_at is null;
create index members_org_deleted_idx on public.members (org_id, deleted_at) where deleted_at is not null;
create index members_name_trgm_idx on public.members using gin (full_name extensions.gin_trgm_ops);
create index members_phone_trgm_idx on public.members using gin (phone extensions.gin_trgm_ops);

create table public.plans (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  type          public.plan_type not null default 'duration',
  duration_days integer not null check (duration_days between 1 and 3660),
  session_count integer check (session_count is null or session_count between 1 and 1000),
  price         numeric(10,2) not null check (price >= 0),
  description   text,
  color         text,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint plans_sessions_need_count check (type <> 'sessions' or session_count is not null)
);
create index plans_org_idx on public.plans (org_id, sort_order);

create table public.memberships (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  member_id        uuid not null references public.members (id) on delete cascade,
  plan_id          uuid not null references public.plans (id) on delete restrict,
  start_date       date not null,
  end_date         date not null,
  sessions_total   integer check (sessions_total is null or sessions_total > 0),
  sessions_used    integer not null default 0 check (sessions_used >= 0),
  list_price       numeric(10,2) not null check (list_price >= 0),
  discount_amount  numeric(10,2) not null default 0 check (discount_amount >= 0),
  final_amount     numeric(10,2) not null check (final_amount >= 0),
  status           public.membership_status not null default 'upcoming',
  frozen_from      date,
  frozen_to        date,
  freeze_days_used integer not null default 0 check (freeze_days_used >= 0),
  notes            text,
  created_by       uuid references public.team_members (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint memberships_dates check (end_date >= start_date),
  constraint memberships_amounts check (final_amount = list_price - discount_amount),
  constraint memberships_freeze_window check (
    (frozen_from is null and frozen_to is null)
    or (frozen_from is not null and frozen_to is not null and frozen_to >= frozen_from)
  )
);
create index memberships_member_idx on public.memberships (member_id, end_date desc);
create index memberships_org_status_idx on public.memberships (org_id, status, end_date);

-- -----------------------------------------------------------------------------
-- Billing
-- -----------------------------------------------------------------------------
create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  member_id       uuid not null references public.members (id),
  membership_id   uuid references public.memberships (id) on delete set null,
  invoice_number  text not null,
  fiscal_year     text not null check (fiscal_year ~ '^[0-9]{2}-[0-9]{2}$'),
  issue_date      date not null,
  due_date        date not null,
  subtotal        numeric(10,2) not null check (subtotal >= 0),
  discount_amount numeric(10,2) not null default 0 check (discount_amount >= 0),
  taxable_value   numeric(10,2) not null check (taxable_value >= 0),
  gst_rate        numeric(5,2) not null default 0 check (gst_rate >= 0),
  cgst_amount     numeric(10,2) not null default 0 check (cgst_amount >= 0),
  sgst_amount     numeric(10,2) not null default 0 check (sgst_amount >= 0),
  total_amount    numeric(10,2) not null check (total_amount >= 0),
  amount_paid     numeric(10,2) not null default 0,
  balance_due     numeric(10,2) not null check (balance_due >= 0),
  status          public.invoice_status not null default 'unpaid',
  void_reason     text,
  voided_at       timestamptz,
  voided_by       uuid references public.team_members (id) on delete set null,
  notes           text,
  created_by      uuid references public.team_members (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, invoice_number),
  constraint invoices_total check (total_amount = subtotal - discount_amount),
  constraint invoices_tax_sum check (taxable_value + cgst_amount + sgst_amount = total_amount),
  constraint invoices_void_reason check (status <> 'void' or void_reason is not null)
);
create index invoices_member_idx on public.invoices (member_id, issue_date desc);
create index invoices_org_issue_idx on public.invoices (org_id, issue_date desc);
create index invoices_org_dues_idx on public.invoices (org_id, due_date) where balance_due > 0 and status <> 'void';

create table public.invoice_items (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  sac_hsn    text not null default '999723',
  quantity   integer not null default 1 check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  amount     numeric(10,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id);

-- Immutable ledger. Reversals are separate rows with a negative amount, so
-- sum(amount) is always the net collected.
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  invoice_id          uuid not null references public.invoices (id) on delete cascade,
  member_id           uuid not null references public.members (id),
  amount              numeric(10,2) not null,
  method              public.payment_method not null,
  utr                 text check (utr is null or utr ~ '^[0-9]{12}$'),
  reference           text,
  paid_at             timestamptz not null default now(),
  collected_by        uuid references public.team_members (id) on delete set null,
  razorpay_payment_id text,
  is_reversal         boolean not null default false,
  reverses_payment_id uuid references public.payments (id),
  reversal_reason     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint payments_shape check (
    (is_reversal = false and amount > 0 and reverses_payment_id is null and reversal_reason is null)
    or (is_reversal = true and amount < 0 and reverses_payment_id is not null and reversal_reason is not null)
  ),
  constraint payments_razorpay_id check (method <> 'razorpay' or is_reversal or razorpay_payment_id is not null)
);
create unique index payments_org_utr_unique on public.payments (org_id, utr) where utr is not null and is_reversal = false;
create unique index payments_one_reversal on public.payments (reverses_payment_id) where reverses_payment_id is not null;
create unique index payments_razorpay_id_unique on public.payments (org_id, razorpay_payment_id) where razorpay_payment_id is not null and is_reversal = false;
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_org_paid_at_idx on public.payments (org_id, paid_at desc);

create table public.collection_requests (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  invoice_id           uuid not null references public.invoices (id) on delete cascade,
  member_id            uuid not null references public.members (id) on delete cascade,
  provider             public.collection_provider not null,
  amount               numeric(10,2) not null check (amount > 0),
  upi_uri              text,
  provider_link_id     text,
  short_url            text,
  status               public.collection_request_status not null default 'pending',
  expires_at           timestamptz not null,
  confirmed_payment_id uuid references public.payments (id) on delete set null,
  created_by           uuid references public.team_members (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint collection_requests_provider_fields check (
    (provider = 'upi_direct' and upi_uri is not null)
    or (provider = 'razorpay' and provider_link_id is not null and short_url is not null)
  )
);
create unique index collection_requests_one_open on public.collection_requests (invoice_id, provider) where status = 'pending';
create unique index collection_requests_link_id on public.collection_requests (provider_link_id) where provider_link_id is not null;
create index collection_requests_org_status_idx on public.collection_requests (org_id, status, expires_at);

-- Member-submitted "I have paid" notes. Never changes an invoice by itself.
create table public.payment_claims (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  invoice_id    uuid not null references public.invoices (id) on delete cascade,
  member_id     uuid not null references public.members (id) on delete cascade,
  amount        numeric(10,2) not null check (amount > 0),
  utr           text not null check (utr ~ '^[0-9]{12}$'),
  note          text check (note is null or char_length(note) <= 200),
  claimed_at    timestamptz not null default now(),
  status        public.payment_claim_status not null default 'pending',
  reviewed_by   uuid references public.team_members (id) on delete set null,
  reviewed_at   timestamptz,
  reject_reason text,
  payment_id    uuid references public.payments (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint payment_claims_review check (status = 'pending' or reviewed_at is not null),
  constraint payment_claims_reject_reason check (status <> 'rejected' or reject_reason is not null)
);
create index payment_claims_org_status_idx on public.payment_claims (org_id, status, claimed_at desc);
create index payment_claims_invoice_idx on public.payment_claims (invoice_id, claimed_at desc);

-- -----------------------------------------------------------------------------
-- Attendance, messaging, expenses, portal
-- -----------------------------------------------------------------------------
create table public.check_ins (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  member_id     uuid not null references public.members (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  method        public.check_in_method not null default 'manual',
  checked_in_by uuid references public.team_members (id) on delete set null,
  flag          public.check_in_flag,
  override_by   uuid references public.team_members (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index check_ins_org_time_idx on public.check_ins (org_id, checked_in_at desc);
create index check_ins_member_time_idx on public.check_ins (member_id, checked_in_at desc);

create table public.message_logs (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  member_id           uuid not null references public.members (id) on delete cascade,
  invoice_id          uuid references public.invoices (id) on delete set null,
  channel             public.message_channel not null,
  template_key        text not null,
  body                text not null,
  status              public.message_status not null default 'prepared',
  scheduled_for       timestamptz,
  reminder_date       date, -- set for reminders only; enforces one reminder per member per day
  sent_at             timestamptz,
  sent_by             uuid references public.team_members (id) on delete set null,
  provider_message_id text,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index message_logs_one_reminder_per_day on public.message_logs (member_id, reminder_date) where reminder_date is not null;
create index message_logs_org_status_idx on public.message_logs (org_id, status, scheduled_for);
create index message_logs_member_idx on public.message_logs (member_id, created_at desc);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  category     public.expense_category not null default 'other',
  amount       numeric(10,2) not null check (amount > 0),
  expense_date date not null,
  vendor       text,
  notes        text,
  receipt_url  text,
  created_by   uuid references public.team_members (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index expenses_org_date_idx on public.expenses (org_id, expense_date desc);

create table public.portal_tokens (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  member_id  uuid not null references public.members (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index portal_tokens_member_idx on public.portal_tokens (member_id, expires_at desc);

-- -----------------------------------------------------------------------------
-- Audit, webhooks, rate limiting
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action        text not null,
  entity_type   text not null,
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs (org_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

-- org_id is null only for verified events we could not attribute to a gym.
create table public.razorpay_events (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references public.organizations (id) on delete cascade,
  event_id     text not null unique,
  event_type   text not null,
  payload      jsonb not null,
  processed_at timestamptz,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 0,
  updated_at   timestamptz not null default now()
);
