-- Status incident tables. Run in the Supabase SQL editor for a hosted board.
-- Access tokens stay OAuth bearer tokens. This file does not create API keys.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'none',
  subscription_status text not null default 'none',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.status_boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.incident_states (
  id uuid primary key,
  board_id uuid not null references public.status_boards (id) on delete cascade,
  name text not null,
  summary text not null,
  wording text not null,
  status text not null check (status in ('APPROVED', 'RETIRED')),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.approved_causes (
  id uuid primary key,
  board_id uuid not null references public.status_boards (id) on delete cascade,
  name text not null,
  match_terms text[] not null check (cardinality(match_terms) >= 1),
  decision text not null check (decision in ('STATE', 'WITHHOLD')),
  wording text not null,
  status text not null check (status in ('APPROVED', 'RETIRED')),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.statement_limits (
  id uuid primary key,
  board_id uuid not null references public.status_boards (id) on delete cascade,
  name text not null,
  channel text not null,
  audience_ladder text[] not null check (cardinality(audience_ladder) >= 1),
  max_audience text not null,
  allow_cause boolean not null default false,
  allow_timeline boolean not null default false,
  allow_workaround boolean not null default false,
  notes text not null default '',
  status text not null check (status in ('APPROVED', 'RETIRED')),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.approved_statements (
  id uuid primary key,
  board_id uuid not null references public.status_boards (id) on delete cascade,
  kind text not null check (kind in ('TIMELINE', 'WORKAROUND')),
  name text not null,
  statement text not null,
  status text not null check (status in ('APPROVED', 'RETIRED')),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.status_support_requests (
  id uuid primary key,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists incident_states_identity on public.incident_states (board_id, lower(name));
create unique index if not exists approved_causes_identity on public.approved_causes (board_id, lower(name));
create unique index if not exists statement_limits_channel on public.statement_limits (board_id, lower(channel));
create unique index if not exists statements_identity on public.approved_statements (board_id, kind, lower(name));

alter table public.profiles enable row level security;
alter table public.status_boards enable row level security;
alter table public.incident_states enable row level security;
alter table public.approved_causes enable row level security;
alter table public.statement_limits enable row level security;
alter table public.approved_statements enable row level security;
alter table public.status_support_requests enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());

create policy status_boards_owner on public.status_boards for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy incident_states_owner on public.incident_states for all to authenticated
  using (exists (select 1 from public.status_boards b where b.id = board_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.status_boards b where b.id = board_id and b.owner_id = auth.uid()));

create policy approved_causes_owner on public.approved_causes for all to authenticated
  using (exists (select 1 from public.status_boards b where b.id = board_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.status_boards b where b.id = board_id and b.owner_id = auth.uid()));

create policy statement_limits_owner on public.statement_limits for all to authenticated
  using (exists (select 1 from public.status_boards b where b.id = board_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.status_boards b where b.id = board_id and b.owner_id = auth.uid()));

create policy statements_owner on public.approved_statements for all to authenticated
  using (exists (select 1 from public.status_boards b where b.id = board_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.status_boards b where b.id = board_id and b.owner_id = auth.uid()));

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.status_boards to authenticated;
grant select, insert, update, delete on public.incident_states to authenticated;
grant select, insert, update, delete on public.approved_causes to authenticated;
grant select, insert, update, delete on public.statement_limits to authenticated;
grant select, insert, update, delete on public.approved_statements to authenticated;

create or replace function public.handle_new_status_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_status on auth.users;
create trigger on_auth_user_created_status
  after insert on auth.users
  for each row execute function public.handle_new_status_user();
