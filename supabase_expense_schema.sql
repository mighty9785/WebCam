-- Supabase SQL schema for Group Expense Manager
-- Run this entire script in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  username text unique,
  phone text not null unique,
  password_hash text not null,
  role text not null default 'user',
  created_at timestamptz not null default now()
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  title text not null,
  amount numeric(12,2) not null check (amount > 0),
  description text,
  expense_date date not null,
  paid_by uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists expense_participants (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  user_id uuid not null references users(id) on delete restrict,
  share numeric(12,2) not null check (share >= 0),
  unique (expense_id, user_id)
);

create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  paid_by uuid not null references users(id) on delete restrict,
  paid_to uuid not null references users(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'settled',
  settled_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_phone on users(phone);
create index if not exists idx_users_username on users(username);
create index if not exists idx_groups_created_by on groups(created_by);
create index if not exists idx_group_members_group on group_members(group_id);
create index if not exists idx_group_members_user on group_members(user_id);
create index if not exists idx_expenses_group on expenses(group_id);
create index if not exists idx_expenses_paid_by on expenses(paid_by);
create index if not exists idx_participants_expense on expense_participants(expense_id);
create index if not exists idx_participants_user on expense_participants(user_id);
create index if not exists idx_settlements_group on settlements(group_id);
create index if not exists idx_settlements_paid_by on settlements(paid_by);
create index if not exists idx_settlements_paid_to on settlements(paid_to);

insert into users (full_name, username, phone, password_hash, role)
values (
  'Admin User',
  'Mighty9785',
  '9999999999',
  crypt('admin@123', gen_salt('bf')),
  'admin'
);
