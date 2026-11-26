begin;

create table public.ot_period_calendars (
  project_id uuid not null,
  year integer not null,
  month integer not null,
  days jsonb not null check (jsonb_typeof(days) = 'array'),
  changed_by uuid not null references public.ot_profiles(id),
  changed_at timestamptz not null default now(),
  primary key (project_id, year, month),
  foreign key (project_id, year, month) references public.ot_periods(project_id, year, month)
);

alter table public.ot_period_calendars enable row level security;
revoke all on public.ot_period_calendars from public, anon, authenticated;
grant select on public.ot_period_calendars to authenticated;
create policy ot_calendar_read on public.ot_period_calendars for select to authenticated
  using ((select ot_private.is_admin()) or ot_private.is_project_admin(project_id) or ot_private.is_member(project_id));

create function public.ot_set_calendar(p_project uuid, p_year integer, p_month integer,
  p_expected_revision bigint, p_days jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  current_period public.ot_periods%rowtype;
  day_count integer;
  new_revision bigint;
begin
  perform ot_private.require_project_admin(p_project);
  if p_year is null or p_year not between 2000 and 2100 or p_month is null or p_month not between 1 and 12
    or p_expected_revision is null or jsonb_typeof(p_days) is distinct from 'array' then
    raise exception 'OT_INVALID';
  end if;
  day_count := extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'));
  if jsonb_array_length(p_days) <> day_count or exists (
    select from jsonb_array_elements(p_days) as d(value)
    where d.value not in ('"NT"'::jsonb, '"NN"'::jsonb, '"L"'::jsonb)
  ) then raise exception 'OT_CALENDAR_INVALID'; end if;
  perform 1 from public.ot_projects where id = p_project and status = 'active' for share;
  if not found then raise exception 'OT_CLOSED'; end if;

  insert into public.ot_periods(project_id, year, month, is_open, revision, data_revision, changed_by, changed_at)
  values (p_project, p_year, p_month, false, 0, 0, auth.uid(), now())
  on conflict (project_id, year, month) do nothing;
  select * into current_period from public.ot_periods
  where project_id = p_project and year = p_year and month = p_month for update;
  if current_period.revision is distinct from p_expected_revision then
    raise exception using errcode = '40001', message = 'Stale calendar';
  end if;
  if current_period.is_open then raise exception 'OT_CALENDAR_OPEN'; end if;

  insert into public.ot_period_calendars(project_id, year, month, days, changed_by)
  values (p_project, p_year, p_month, p_days, auth.uid())
  on conflict (project_id, year, month) do update
  set days = excluded.days, changed_by = auth.uid(), changed_at = now();
  update public.ot_periods set revision = revision + 1, changed_by = auth.uid(), changed_at = now()
  where project_id = p_project and year = p_year and month = p_month returning revision into new_revision;
  perform ot_private.audit('period_calendar_saved',
    jsonb_build_object('project_id', p_project, 'year', p_year, 'month', p_month, 'revision', new_revision));
  return new_revision;
end;
$$;

revoke all on function public.ot_set_calendar(uuid, integer, integer, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.ot_set_calendar(uuid, integer, integer, bigint, jsonb) to authenticated;

create or replace function ot_private.is_project_admin(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select from public.ot_project_admins a
    join public.ot_profiles p on p.id = a.user_id
    join auth.users u on u.id = a.user_id
    where a.user_id = auth.uid() and a.project_id = p_project and a.active
      and p.status = 'active' and p.employee_code is not null
      and u.email_confirmed_at is not null and lower(u.email) ~ '^[^@[:space:]]+@bidv[.]com[.]vn$'
  );
$$;

create or replace function ot_private.require_project_admin(p_project uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if ot_private.is_admin() then
    perform ot_private.require_admin();
    return;
  end if;

  perform 1 from public.ot_profiles
  where id = auth.uid() and status = 'active' and employee_code is not null
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

create or replace function public.ot_set_project_admin(p_project uuid, p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform ot_private.require_admin();
  if p_active is null then raise exception 'OT_INVALID'; end if;

  perform 1 from public.ot_profiles p join auth.users u on u.id = p.id
  where p.id = p_user and (
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
  if p_open then
    perform 1 from public.ot_periods
    where project_id = p_project and year = p_year and month = p_month for update;
    if not found or not exists (
      select from public.ot_period_calendars where project_id = p_project and year = p_year and month = p_month
    ) then raise exception 'OT_CALENDAR_REQUIRED'; end if;
  end if;
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

create or replace function public.ot_submit_entries(
  p_project uuid, p_year integer, p_month integer, p_period_revision bigint, p_data_revision bigint,
  p_replace boolean, p_batch boolean, p_rows jsonb
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target_user uuid;
  target_name text;
  target_code text;
  current_period public.ot_periods%rowtype;
  row_data jsonb;
  day_data jsonb;
  date_text text;
  calendar_days jsonb;
  day_date date;
  day_minutes integer;
  seen_dates text[];
  seen_codes text[] := '{}';
  nt integer;
  nn integer;
  unknown_minutes integer;
  has_entries boolean;
  new_revision bigint;
begin
  if actor is null or p_batch is null or p_replace is null then
    raise exception using errcode = '42501', message = 'Authenticated account required';
  end if;
  if p_batch then
    perform ot_private.require_admin();
  else
    perform 1 from public.ot_profiles where id = actor and status = 'active' for share;
    if not found or not ot_private.is_member(p_project) then
      raise exception using errcode = '42501', message = 'Active project membership required';
    end if;
  end if;
  if p_year is null or p_year not between 2000 and 2100 or p_month is null or p_month not between 1 and 12
    or p_period_revision is null or p_data_revision is null
    or jsonb_typeof(p_rows) is distinct from 'array' or octet_length(p_rows::text) > 2000000 then
    raise exception 'OT_INVALID';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 1000 or (not p_batch and jsonb_array_length(p_rows) <> 1) then
    raise exception 'OT_INVALID';
  end if;

  -- The project, period and membership locks keep writes ordered with deactivation and closing.
  perform 1 from public.ot_projects where id = p_project and status = 'active' for share;
  if not found then raise exception 'OT_CLOSED'; end if;
  select * into current_period from public.ot_periods
    where project_id = p_project and year = p_year and month = p_month for update;
  if not found or current_period.is_open is not true then raise exception 'OT_CLOSED'; end if;
  if current_period.revision is distinct from p_period_revision
    or current_period.data_revision is distinct from p_data_revision then
    raise exception using errcode = '40001', message = 'Stale period data';
  end if;

  select days into calendar_days from public.ot_period_calendars
  where project_id = p_project and year = p_year and month = p_month;
  if not found then raise exception 'OT_CALENDAR_REQUIRED'; end if;

  select exists (
    select from public.ot_entries where project_id = p_project and year = p_year
      and month = p_month and active and (p_batch or user_id = actor)
  ) into has_entries;
  if has_entries and not p_replace then raise exception 'OT_EXISTS'; end if;
  if not has_entries and p_replace then raise exception 'OT_MISSING'; end if;

  new_revision := current_period.data_revision + 1;
  update public.ot_entries set active = false, replaced_at = now()
  where project_id = p_project and year = p_year and month = p_month and active and (p_batch or user_id = actor);

  for row_data in select value from jsonb_array_elements(p_rows)
  loop
    target_code := row_data->>'employee_code';
    if jsonb_typeof(row_data->'employee_code') is distinct from 'string'
      or target_code is null or target_code !~ '^[0-9]{8}$' or target_code = any(seen_codes)
      or coalesce(row_data->>'source', '') not in ('daily', 'summary')
      or jsonb_typeof(row_data->'days') is distinct from 'array'
      or length(coalesce(row_data->>'unit', '')) > 250 then raise exception 'OT_INVALID'; end if;
    seen_codes := array_append(seen_codes, target_code);
    select profile.id, profile.full_name into target_user, target_name
    from public.ot_profiles profile join auth.users u on u.id = profile.id
    join public.ot_project_members member on member.user_id = profile.id and member.project_id = p_project
    where profile.employee_code = target_code and profile.status = 'active'
      and (p_batch or profile.id = actor) and member.active and u.email_confirmed_at is not null
      and lower(u.email) ~ '^[^@[:space:]]+@bidv[.]com[.]vn$'
    for share of profile, member;
    if not found then raise exception 'OT_EMPLOYEE'; end if;

    nt := 0;
    nn := 0;
    unknown_minutes := 0;
    seen_dates := '{}';
    if not p_batch and row_data->>'source' <> 'daily' then raise exception 'OT_DAILY_REQUIRED'; end if;
    if row_data->>'source' = 'daily' then
      if jsonb_array_length(row_data->'days') > 31 then raise exception 'OT_INVALID'; end if;
      for day_data in select value from jsonb_array_elements(row_data->'days')
      loop
        date_text := day_data->>'date';
        if date_text is null or date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          or jsonb_typeof(day_data->'minutes') is distinct from 'number'
          or coalesce(day_data->>'minutes', '') !~ '^[0-9]{1,4}$'
          or coalesce(day_data->>'type', '') not in ('NT', 'NN', 'L')
          or date_text = any(seen_dates) then raise exception 'OT_INVALID'; end if;
        begin
          day_date := date_text::date;
        exception when datetime_field_overflow or invalid_datetime_format then
          raise exception 'OT_INVALID';
        end;
        day_minutes := (day_data->>'minutes')::integer;
        if extract(year from day_date) <> p_year or extract(month from day_date) <> p_month
          or day_minutes not between 1 and 1440 then raise exception 'OT_INVALID'; end if;
        if day_data->>'type' is distinct from (calendar_days->>(extract(day from day_date)::integer - 1)) then
          raise exception 'OT_DAY_TYPE';
        end if;
        seen_dates := array_append(seen_dates, date_text);
        if day_data->>'type' = 'NT' then nt := nt + day_minutes;
        else nn := nn + day_minutes;
        end if;
      end loop;
    else
      if jsonb_array_length(row_data->'days') <> 0
        or jsonb_typeof(row_data->'nt_minutes') is distinct from 'number'
        or jsonb_typeof(row_data->'nn_minutes') is distinct from 'number'
        or jsonb_typeof(row_data->'unclassified_minutes') is distinct from 'number'
        or coalesce(row_data->>'nt_minutes', '') !~ '^[0-9]{1,6}$'
        or coalesce(row_data->>'nn_minutes', '') !~ '^[0-9]{1,6}$'
        or coalesce(row_data->>'unclassified_minutes', '') !~ '^[0-9]{1,6}$' then raise exception 'OT_INVALID'; end if;
      nt := (row_data->>'nt_minutes')::integer;
      nn := (row_data->>'nn_minutes')::integer;
      unknown_minutes := (row_data->>'unclassified_minutes')::integer;
    end if;
    if nt + nn + unknown_minutes > 1440 * extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day')) then
      raise exception 'OT_INVALID';
    end if;

    -- Store only canonical day fields. Extra JSON keys supplied by clients are discarded.
    insert into public.ot_entries(project_id, user_id, year, month, employee_code, full_name, unit,
      nt_minutes, nn_minutes, unclassified_minutes, source, days, period_data_revision, created_by)
    values (p_project, target_user, p_year, p_month, target_code, target_name, coalesce(row_data->>'unit', ''),
      nt, nn, unknown_minutes, row_data->>'source',
      (select coalesce(jsonb_agg(jsonb_build_object('date', d->>'date', 'type', d->>'type', 'minutes', d->'minutes')
        order by d->>'date'), '[]'::jsonb) from jsonb_array_elements(row_data->'days') d),
      new_revision, actor);
  end loop;

  update public.ot_periods set data_revision = new_revision
  where project_id = p_project and year = p_year and month = p_month;
  perform ot_private.audit(case when p_replace then 'entries_replaced' else 'entries_submitted' end,
    jsonb_build_object('project_id', p_project, 'year', p_year, 'month', p_month,
      'revision', new_revision, 'count', jsonb_array_length(p_rows), 'batch', p_batch));
  return new_revision;
end;
$$;

notify pgrst, 'reload schema';
commit;
