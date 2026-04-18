-- Subscriptions table for Scale (recurring) plan
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  paddle_subscription_id text not null unique,
  paddle_customer_id text not null,
  product_id text not null,
  price_id text not null,
  status text not null default 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  environment text not null default 'sandbox',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, environment)
);

create index idx_subscriptions_user_id on public.subscriptions(user_id);
create index idx_subscriptions_paddle_id on public.subscriptions(paddle_subscription_id);

alter table public.subscriptions enable row level security;

create policy "Users can view own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create policy "Service role can manage subscriptions"
  on public.subscriptions for all
  using (auth.role() = 'service_role');

create or replace function public.has_active_subscription(
  user_uuid uuid,
  check_env text default 'live'
)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = user_uuid
    and environment = check_env
    and status in ('active', 'trialing')
    and (current_period_end is null or current_period_end > now())
  );
$$;

-- Function to add credits idempotently from a Paddle transaction
create or replace function public.add_credits_from_transaction(
  _user_id uuid,
  _credits integer,
  _transaction_id text,
  _amount numeric,
  _env text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Idempotency: skip if this transaction was already processed
  if exists (select 1 from public.payments where stripe_session_id = _transaction_id) then
    return false;
  end if;

  insert into public.payments (user_id, stripe_session_id, amount, credits_added, status)
  values (_user_id, _transaction_id, _amount, _credits, 'completed');

  insert into public.credits (user_id, balance)
  values (_user_id, _credits)
  on conflict (user_id) do update
    set balance = public.credits.balance + _credits,
        updated_at = now();

  return true;
end;
$$;

-- Ensure credits.user_id is unique for the upsert above
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'credits_user_id_key'
  ) then
    alter table public.credits add constraint credits_user_id_key unique (user_id);
  end if;
end $$;