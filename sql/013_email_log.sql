-- email_send_log: audit trail of every send attempt
create table public.email_send_log (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  to_email_hash text not null,
  to_email_domain text not null,
  template text not null,
  user_id uuid references auth.users(id) on delete set null,
  status text not null check (status in ('sent','failed','suppressed','duplicate')),
  resend_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create index email_send_log_user_idx on public.email_send_log(user_id, created_at desc);
create index email_send_log_template_status_idx on public.email_send_log(template, status, created_at desc);

alter table public.email_send_log enable row level security;
-- No SELECT policy — service-role only via supabaseAdmin.

-- email_suppressions: blocklist
create table public.email_suppressions (
  email_hash text primary key,
  reason text not null check (reason in ('bounce','complaint','manual','rate_limited')),
  created_at timestamptz not null default now()
);

alter table public.email_suppressions enable row level security;
-- No SELECT policy — service-role only.