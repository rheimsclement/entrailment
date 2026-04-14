-- ─────────────────────────────────────────────────────────────────────────────
-- En Trailment — user_subscriptions table
-- ─────────────────────────────────────────────────────────────────────────────

create type subscription_tier as enum ('free', 'pdf_watch', 'full');

create table public.user_subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  tier                   subscription_tier not null default 'free',
  stripe_customer_id     text,
  stripe_subscription_id text,           -- null for one-time purchases
  stripe_price_id        text,
  status                 text not null default 'active', -- active | canceled | past_due
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id)
);

-- Updated-at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_user_subscriptions_updated_at
  before update on public.user_subscriptions
  for each row execute procedure public.set_updated_at();

-- ── Row-level security ────────────────────────────────────────────────────────

alter table public.user_subscriptions enable row level security;

-- Users can read their own row
create policy "users can read own subscription"
  on public.user_subscriptions for select
  using (auth.uid() = user_id);

-- Edge Functions use the service-role key → bypass RLS.
-- No direct insert/update policy needed for authenticated users.

-- ── Create a free-tier row automatically when a user signs up ────────────────

create or replace function public.handle_new_user_subscription()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_subscriptions (user_id, tier)
  values (new.id, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger trg_new_user_subscription
  after insert on auth.users
  for each row execute procedure public.handle_new_user_subscription();
