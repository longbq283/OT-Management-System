begin;

create table public.ot_project_admins (
  project_id uuid not null references public.ot_projects(id),
  user_id uuid not null references public.ot_profiles(id),
  active boolean not null,
  changed_by uuid not null references public.ot_profiles(id),
  changed_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index ot_project_admins_active_user on public.ot_project_admins(user_id, project_id) where active;
alter table public.ot_project_admins enable row level security;
revoke all on public.ot_project_admins from public, anon, authenticated;
grant select on public.ot_project_admins to authenticated;

create function ot_private.is_project_admin(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select from public.ot_project_admins a
    join public.ot_profiles p on p.id = a.user_id
    join auth.users u on u.id = a.user_id
    where a.user_id = auth.uid() and a.project_id = p_project and a.active
      and p.role = 'user' and p.status = 'active' and p.employee_code is not null
      and u.email_confirmed_at is not null and lower(u.email) ~ '^[^@[:space:]]+@bidv[.]com[.]vn$'
  );
$$;

create function ot_private.require_project_admin(p_project uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if ot_private.is_admin() then
    perform ot_private.require_admin();
    return;
  end if;

  perform 1 from public.ot_profiles
  where id = auth.uid() and role = 'user' and status = 'active' and employee_code is not null
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'Project administrator required';
  end if;

  -- Serialize period changes with revocation of the project's grant.
  perform 1 from public.ot_project_admins
  where project_id = p_project and user_id = auth.uid() and active for share;
  if not found or not ot_private.is_project_admin(p_project) then
    raise exception using errcode = '42501', message = 'Project administrator required';
  end if;
end;
$$;

revoke all on function ot_private.is_project_admin(uuid), ot_private.require_project_admin(uuid)
from public, anon, authenticated;
grant execute on function ot_private.is_project_admin(uuid) to authenticated;

create policy ot_project_admins_read on public.ot_project_admins for select to authenticated
  using ((select ot_private.is_admin()) or (user_id = (select auth.uid()) and active
    and ot_private.is_project_admin(project_id)));

alter policy ot_workspace_projects_guard on public.ot_projects
  using ((select ot_private.is_admin()) or ot_private.is_member(id) or ot_private.is_project_admin(id));
alter policy ot_workspace_projects_read on public.ot_projects
  using ((select ot_private.is_admin()) or ot_private.is_member(id) or ot_private.is_project_admin(id));
alter policy ot_workspace_periods_guard on public.ot_periods
  using ((select ot_private.is_admin()) or ot_private.is_member(project_id) or ot_private.is_project_admin(project_id));
alter policy ot_workspace_periods_read on public.ot_periods
  using ((select ot_private.is_admin()) or ot_private.is_member(project_id) or ot_private.is_project_admin(project_id));
alter policy ot_workspace_entries_read on public.ot_entries
  using ((select ot_private.is_admin()) or ot_private.is_project_admin(project_id)
    or (user_id = (select auth.uid()) and ot_private.is_member(project_id)));

create function public.ot_set_project_admin(p_project uuid, p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform ot_private.require_admin();
  if p_active is null then raise exception 'OT_INVALID'; end if;

  perform 1 from public.ot_profiles p join auth.users u on u.id = p.id
  where p.id = p_user and p.role = 'user' and (
    not p_active or (p.status = 'active' and p.employee_code is not null
      and u.email_confirmed_at is not null and lower(u.email) ~ '^[^@[:space:]]+@bidv[.]com[.]vn$')
  ) for share of p;
  if not found then raise exception 'OT_EMPLOYEE'; end if;

  if p_active then
    perform 1 from public.ot_projects where id = p_project and status = 'active' for share;
    if not found then raise exception 'OT_CLOSED'; end if;
  end if;

  -- Existing revocations remain visible to the system admin and in the audit log.
  if p_active then
    insert into public.ot_project_admins(project_id, user_id, active, changed_by)
    values (p_project, p_user, true, auth.uid())
    on conflict (project_id, user_id) do update
    set active = true, changed_by = auth.uid(), changed_at = now();
  else
    update public.ot_project_admins set active = false, changed_by = auth.uid(), changed_at = now()
    where project_id = p_project and user_id = p_user and active;
    if not found then raise exception 'OT_INVALID'; end if;
  end if;
  perform ot_private.audit('project_admin_changed',
    jsonb_build_object('project_id', p_project, 'user_id', p_user, 'active', p_active));
end;
$$;

revoke all on function public.ot_set_project_admin(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.ot_set_project_admin(uuid, uuid, boolean) to authenticated;

create or replace function public.ot_set_period(p_project uuid, p_year integer, p_month integer, p_open boolean, p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  next_revision bigint;
begin
  perform ot_private.require_project_admin(p_project);
  if p_year is null or p_year not between 2000 and 2100 or p_month is null or p_month not between 1 and 12
    or p_open is null or p_expected_revision is null then raise exception 'OT_INVALID'; end if;
  perform 1 from public.ot_projects where id = p_project and (not p_open or status = 'active') for share;
  if not found then raise exception 'OT_CLOSED'; end if;
  if p_expected_revision = 0 then
    insert into public.ot_periods(project_id, year, month, is_open, revision, data_revision, changed_by, changed_at)
    values (p_project, p_year, p_month, p_open, 1, 0, auth.uid(), now())
    on conflict (project_id, year, month) do nothing returning revision into next_revision;
  end if;
  if next_revision is null then
    update public.ot_periods set is_open = p_open, revision = revision + 1, changed_by = auth.uid(), changed_at = now()
    where project_id = p_project and year = p_year and month = p_month and revision = p_expected_revision
    returning revision into next_revision;
    if not found then raise exception using errcode = '40001', message = 'Stale period'; end if;
  end if;
  perform ot_private.audit('period_changed', jsonb_build_object('project_id', p_project, 'year', p_year, 'month', p_month, 'open', p_open, 'revision', next_revision));
  return next_revision;
end;
$$;

notify pgrst, 'reload schema';
commit;
