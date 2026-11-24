-- Work Dashboard Initial Schema
-- Single-user private workspace protected by Supabase Auth + Row-Level Security

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1. App settings (1 row per user)
create table if not exists public.app_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_shift_rate integer not null default 500000,
  default_procedure_rate integer not null default 40000,
  default_payout_ratio numeric(5,4) not null default 1.0,
  monthly_income_goal integer,
  show_hospital_salary boolean not null default false,
  calendar_token text not null unique,
  updated_at timestamptz not null default now()
);

create trigger trg_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;
create policy "app_settings_owner" on public.app_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Branches (CN1..CN4 and extensible)
create table if not exists public.branches (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  address text not null default '',
  color text not null default '#059669',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  hours jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, code)
);

create trigger trg_branches_updated_at
before update on public.branches
for each row execute function public.set_updated_at();

alter table public.branches enable row level security;
create policy "branches_owner" on public.branches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Shift slots (Date + Ca 1..3)
create table if not exists public.shift_slots (
  user_id uuid not null references auth.users(id) on delete cascade,
  shift_date date not null,
  shift_number smallint not null check (shift_number between 1 and 3),
  status text not null check (status in ('BV', 'NGHI', 'RANH', 'KFC')),
  branch_code text,
  procedure_count integer not null default 0 check (procedure_count >= 0),
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, shift_date, shift_number),
  constraint shift_slots_kfc_branch_check check (
    (status = 'KFC' and branch_code is not null) or (status <> 'KFC' and branch_code is null)
  )
);

create index if not exists idx_shift_slots_user_date on public.shift_slots (user_id, shift_date);

create trigger trg_shift_slots_updated_at
before update on public.shift_slots
for each row execute function public.set_updated_at();

alter table public.shift_slots enable row level security;
create policy "shift_slots_owner" on public.shift_slots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. Month configs (rate snapshots, payout ratio, bonuses, historical overrides)
create table if not exists public.month_configs (
  user_id uuid not null references auth.users(id) on delete cascade,
  year_month text not null check (year_month ~ '^\d{4}-\d{2}$'),
  shift_rate integer not null default 500000,
  procedure_rate integer not null default 40000,
  payout_ratio numeric(5,4) not null default 1.0,
  procedure_adjustment integer not null default 0,
  procedure_adjustment_note text not null default '',
  bonus_amount integer not null default 0,
  bonus_note text not null default '',
  hospital_salary integer,
  is_historical boolean not null default false,
  clinic_label text not null default 'KFC',
  historical_shift_income integer,
  historical_com_income integer,
  historical_ah_income integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, year_month)
);

create trigger trg_month_configs_updated_at
before update on public.month_configs
for each row execute function public.set_updated_at();

alter table public.month_configs enable row level security;
create policy "month_configs_owner" on public.month_configs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5. AH tasks (scientific writing tasks)
create table if not exists public.ah_tasks (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  amount integer not null default 0 check (amount >= 0),
  status text not null check (status in ('DANG_LAM', 'CHO_THANH_TOAN', 'DA_NHAN')),
  received_month text check (received_month is null or received_month ~ '^\d{4}-\d{2}$'),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists idx_ah_tasks_user_status on public.ah_tasks (user_id, status);

create trigger trg_ah_tasks_updated_at
before update on public.ah_tasks
for each row execute function public.set_updated_at();

alter table public.ah_tasks enable row level security;
create policy "ah_tasks_owner" on public.ah_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
