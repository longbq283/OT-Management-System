-- PostgreSQL fixture for the existing Supabase schema described in docs/supabase.md.
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;

create table auth.users (
  id uuid primary key, email text not null, email_confirmed_at timestamptz, raw_user_meta_data jsonb not null default '{}'
);
create type public.profile_role as enum ('user', 'admin');
create type public.profile_status as enum ('pending', 'active', 'disabled');
create type public.project_status as enum ('active', 'inactive');
create table public.ot_profiles (
  id uuid primary key references auth.users(id), email text not null, full_name text not null,
  requested_employee_code text, employee_code text unique, role profile_role not null default 'user',
  status profile_status not null default 'pending', created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.ot_projects (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
  description text, status project_status not null default 'active', created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.ot_project_members (
  project_id uuid references ot_projects(id), user_id uuid references ot_profiles(id), active boolean not null,
  created_at timestamptz default now(), updated_at timestamptz default now(), primary key (project_id, user_id)
);
create table public.ot_periods (
  project_id uuid references ot_projects(id), year smallint, month smallint, is_open boolean not null default false,
  revision integer not null default 0, data_revision integer not null default 0, changed_by uuid references ot_profiles(id),
  changed_at timestamptz default now(), primary key (project_id, year, month)
);
alter table ot_profiles enable row level security;
alter table ot_projects enable row level security;
alter table ot_project_members enable row level security;
alter table ot_periods enable row level security;
create policy fixture_profiles_read on ot_profiles for select to authenticated using (true);
create policy fixture_projects_read on ot_projects for select to authenticated using (true);
create policy fixture_members_read on ot_project_members for select to authenticated using (true);
create policy fixture_periods_read on ot_periods for select to authenticated using (true);
grant select on ot_profiles, ot_projects, ot_project_members, ot_periods to authenticated;

create function ot_require_bidv_email(jsonb) returns jsonb language sql as $$ select '{}'::jsonb $$;
create function ot_handle_auth_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ot_profiles(id,email,full_name,requested_employee_code)
  values (new.id,new.email,new.raw_user_meta_data->>'full_name',lpad(new.raw_user_meta_data->>'employee_code',8,'0'));
  return new;
end;
$$;
create trigger fixture_create_profile after insert on auth.users for each row execute function ot_handle_auth_user();
create function ot_is_admin() returns boolean language sql security definer set search_path = ''
as $$ select false $$;
create function ot_can_access_project(uuid) returns boolean language sql security definer set search_path = ''
as $$ select false $$;
