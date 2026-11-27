begin;

alter table public.ot_profiles add column organization_unit text,
  add column deleted_at timestamptz,
  add constraint ot_profile_unit_length check (length(organization_unit) <= 250),
  add constraint ot_deleted_profile_disabled check (deleted_at is null or status = 'disabled');

update public.ot_profiles p set organization_unit = (
  select nullif(btrim(e.unit), '') from public.ot_entries e
  where e.user_id = p.id and e.active and nullif(btrim(e.unit), '') is not null
  order by e.year desc, e.month desc, e.id desc limit 1
) where p.organization_unit is null;

create function public.ot_activate_verified_profile()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  profile public.ot_profiles%rowtype;
  confirmed_email text;
begin
  select p.* into profile from public.ot_profiles p where p.id = auth.uid() for update;
  if not found or profile.status <> 'pending' or profile.role <> 'user' then return false; end if;
  select lower(u.email) into confirmed_email from auth.users u
  where u.id = profile.id and u.email_confirmed_at is not null;
  if confirmed_email is null or confirmed_email is distinct from lower(profile.email)
    or confirmed_email !~ '^[^@[:space:]]+@bidv[.]com[.]vn$'
    or coalesce(profile.requested_employee_code,'') !~ '^[0-9]{8}$'
    or exists (select from public.ot_user_invitations where email = confirmed_email) then return false; end if;
  update public.ot_profiles set employee_code = profile.requested_employee_code, status = 'active', updated_at = now()
  where id = profile.id;
  perform ot_private.audit('verified_profile_activated', jsonb_build_object('user_id',profile.id));
  return true;
end;
$$;

create function public.ot_admin_account(p_user uuid, p_action text, p_name text, p_code text, p_unit text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.ot_profiles%rowtype;
begin
  perform ot_private.require_admin();
  select * into target from public.ot_profiles where id = p_user and role = 'user' and deleted_at is null for update;
  if not found then raise exception using errcode = '42501', message = 'Account unavailable'; end if;
  case p_action
    when 'edit' then
      if p_name is null or length(btrim(p_name)) not between 1 and 200 or coalesce(p_code,'') !~ '^[0-9]{8}$'
        or length(coalesce(p_unit,'')) > 250 then raise exception 'OT_INVALID'; end if;
      if target.employee_code is not null and target.employee_code is distinct from p_code
        and exists (select from public.ot_entries where user_id = p_user) then raise exception 'OT_CODE_HAS_HISTORY'; end if;
      update public.ot_profiles set full_name = btrim(p_name), requested_employee_code = p_code,
        employee_code = case when target.status = 'pending' then null else p_code end,
        organization_unit = nullif(btrim(p_unit),''), updated_at = now() where id = p_user;
    when 'lock' then
      update public.ot_profiles set status = 'disabled', updated_at = now() where id = p_user;
    when 'unlock' then
      perform public.ot_manage_user(p_user,target.full_name,coalesce(target.employee_code,target.requested_employee_code),true);
    when 'delete' then
      update public.ot_profiles set status = 'disabled', deleted_at = now(), updated_at = now() where id = p_user;
      update public.ot_project_members set active = false, updated_at = now() where user_id = p_user and active;
      update public.ot_project_admins set active = false, changed_at = now(), changed_by = auth.uid() where user_id = p_user and active;
    else raise exception 'OT_INVALID';
  end case;
  perform ot_private.audit('account_' || p_action,jsonb_build_object('user_id',p_user));
end;
$$;

create function public.ot_project_candidates(p_project uuid)
returns table (user_id uuid, full_name text, employee_code text, organization_unit text, assigned boolean)
language plpgsql security definer set search_path = '' as $$
begin
  perform ot_private.require_project_admin(p_project);
  return query select p.id,p.full_name::text,p.employee_code::text,
    case when m.active then p.organization_unit end,coalesce(m.active,false)
  from public.ot_profiles p join auth.users u on u.id = p.id
  left join public.ot_project_members m on m.user_id = p.id and m.project_id = p_project
  where p.status = 'active' and p.employee_code is not null and u.email_confirmed_at is not null
    and lower(u.email) ~ '^[^@[:space:]]+@bidv[.]com[.]vn$'
  order by p.full_name,p.id;
end;
$$;

create function public.ot_set_members(p_project uuid, p_users uuid[], p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  member_id uuid;
begin
  perform ot_private.require_project_admin(p_project);
  if coalesce(cardinality(p_users),0) not between 1 and 1000 or p_active is null then raise exception 'OT_INVALID'; end if;
  for member_id in select distinct id from unnest(p_users) id order by id loop
    perform public.ot_set_member(p_project,member_id,p_active);
  end loop;
end;
$$;

create table public.ot_approval_groups (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.ot_projects(id),
  name text not null check (length(name) between 1 and 70),
  enabled boolean not null,
  reviewer_id uuid references public.ot_profiles(id),
  backup_id uuid references public.ot_profiles(id),
  unique (project_id,name),
  unique (id,project_id),
  check (not enabled or reviewer_id is not null),
  check (backup_id is null or backup_id is distinct from reviewer_id)
);
create table public.ot_approval_members (
  project_id uuid not null,
  user_id uuid not null references public.ot_profiles(id),
  group_id bigint not null,
  primary key (project_id,user_id),
  foreign key (group_id,project_id) references public.ot_approval_groups(id,project_id) on delete cascade
);
create table public.ot_approval_requests (
  id bigint generated always as identity primary key,
  group_id bigint not null,
  project_id uuid not null,
  year integer not null,
  month integer not null,
  user_id uuid not null references public.ot_profiles(id),
  row_data jsonb not null,
  calendar_days jsonb not null,
  calendar_limits jsonb,
  entry_before bigint references public.ot_entries(id),
  state text not null default 'pending' check (state in ('pending','approved','returned','superseded')),
  submitted_by uuid not null references public.ot_profiles(id),
  submitted_at timestamptz not null default now(),
  decided_by uuid references public.ot_profiles(id),
  reason text,
  decided_at timestamptz,
  foreign key (group_id,project_id) references public.ot_approval_groups(id,project_id)
);
create unique index ot_one_pending_request on public.ot_approval_requests(project_id,year,month,user_id) where state = 'pending';
alter table public.ot_approval_groups enable row level security;
alter table public.ot_approval_members enable row level security;
alter table public.ot_approval_requests enable row level security;
revoke all on public.ot_approval_groups, public.ot_approval_members, public.ot_approval_requests from public, anon, authenticated;

create function public.ot_list_approval_groups(p_project uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform ot_private.require_project_admin(p_project);
  return coalesce((select jsonb_agg(to_jsonb(g) || jsonb_build_object('members', coalesce((
    select jsonb_agg(m.user_id order by m.user_id) from public.ot_approval_members m where m.group_id = g.id
  ),'[]'::jsonb)) order by g.name) from public.ot_approval_groups g where g.project_id = p_project),'[]'::jsonb);
end;
$$;

create function public.ot_save_approval_group(p_project uuid,p_group bigint,p_name text,p_enabled boolean,
  p_reviewer uuid,p_backup uuid,p_members uuid[],p_transfer boolean)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  group_key bigint;
begin
  perform ot_private.require_project_admin(p_project);
  perform 1 from public.ot_projects where id = p_project and status = 'active' for update;
  if not found then raise exception 'OT_PROJECT_INACTIVE'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 70 or p_enabled is null
    or (p_enabled and p_reviewer is null) or (p_backup is not null and p_backup = p_reviewer)
    or coalesce(cardinality(p_members),0) not between 1 and 1000 then raise exception 'OT_INVALID'; end if;
  if exists (select from unnest(p_members || array_remove(array[p_reviewer,p_backup],null)) as candidate(member_id)
    where not exists (select from public.ot_project_members m join public.ot_profiles p on p.id=m.user_id
      join auth.users u on u.id=p.id where m.project_id=p_project and m.active and p.id=candidate.member_id
      and p.status='active' and p.organization_unit='Ban QLPTCB' and u.email_confirmed_at is not null))
    then raise exception 'OT_GROUP_UNIT'; end if;
  if p_group is null then
    insert into public.ot_approval_groups(project_id,name,enabled,reviewer_id,backup_id)
    values(p_project,btrim(p_name),p_enabled,p_reviewer,p_backup) returning id into group_key;
  else
    update public.ot_approval_groups set name=btrim(p_name),enabled=p_enabled,reviewer_id=p_reviewer,backup_id=p_backup
    where project_id=p_project and id=p_group returning id into group_key;
    if not found then raise exception 'OT_INVALID'; end if;
  end if;
  if p_transfer is distinct from true and exists(select from public.ot_approval_members
    where project_id=p_project and user_id=any(p_members) and group_id<>group_key) then raise exception 'OT_GROUP_TRANSFER'; end if;
  delete from public.ot_approval_members where group_id=group_key and not(user_id=any(p_members));
  insert into public.ot_approval_members(project_id,user_id,group_id)
    select distinct p_project,id,group_key from unnest(p_members) id
    on conflict(project_id,user_id) do update set group_id=excluded.group_id;
  perform ot_private.audit('approval_group_saved',jsonb_build_object('project_id',p_project,'group_id',group_key));
  return group_key;
end;
$$;

create function ot_private.can_review(p_group bigint,p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() <> p_owner and exists (
    select from public.ot_approval_groups g where g.id=p_group and auth.uid() in (g.reviewer_id,g.backup_id)
      and ot_private.is_member(g.project_id)
  );
$$;

create function public.ot_approval_home()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'review_projects',coalesce((select jsonb_agg(distinct g.project_id) from public.ot_approval_groups g
      where auth.uid() in (g.reviewer_id,g.backup_id) and ot_private.is_member(g.project_id)),'[]'::jsonb),
    'submit_projects',coalesce((select jsonb_agg(g.project_id) from public.ot_approval_groups g join public.ot_approval_members m on m.group_id=g.id
      join public.ot_profiles p on p.id=m.user_id where m.user_id=auth.uid() and g.enabled
      and p.organization_unit='Ban QLPTCB' and ot_private.is_member(g.project_id)),'[]'::jsonb))
$$;

create function public.ot_list_approval_requests(p_project uuid,p_year integer,p_month integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'row',r.row_data,'state',r.state,'reason',r.reason,
    'group',g.name,'days',r.calendar_days,'limits',r.calendar_limits) order by r.id),'[]'::jsonb)
  from public.ot_approval_requests r join public.ot_approval_groups g on g.id=r.group_id
  where r.project_id=p_project and r.year=p_year and r.month=p_month and r.state<>'superseded'
    and ot_private.can_review(r.group_id,r.user_id)
$$;

create function public.ot_my_approval_request(p_project uuid,p_year integer,p_month integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('state',r.state,'reason',r.reason)
  from public.ot_approval_requests r where r.project_id=p_project and r.year=p_year and r.month=p_month
    and r.user_id=auth.uid() and r.state<>'superseded' and ot_private.is_member(p_project)
  order by r.id desc limit 1
$$;

create function public.ot_decide_approval_requests(p_project uuid,p_year integer,p_month integer,p_ids bigint[],
  p_approve boolean,p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  period public.ot_periods%rowtype;
  request public.ot_approval_requests%rowtype;
  calendar public.ot_period_calendars%rowtype;
  row_value jsonb;
  previous bigint;
  count_done integer := 0;
begin
  if coalesce(cardinality(p_ids),0) not between 1 and 1000 or p_approve is null
    or (not p_approve and length(coalesce(btrim(p_reason),'')) not between 1 and 500) then raise exception 'OT_INVALID'; end if;
  perform 1 from public.ot_profiles p join public.ot_project_members m on m.user_id=p.id
  where p.id=auth.uid() and p.status='active' and m.project_id=p_project and m.active for share of p,m;
  if not found or not ot_private.is_member(p_project) then raise exception using errcode='42501',message='Reviewer required'; end if;
  perform 1 from public.ot_projects where id=p_project and status='active' for share;
  if not found then raise exception 'OT_PROJECT_INACTIVE'; end if;
  select * into period from public.ot_periods where project_id=p_project and year=p_year and month=p_month for update;
  if not found then raise exception 'OT_CLOSED'; end if;
  select * into calendar from public.ot_period_calendars where project_id=p_project and year=p_year and month=p_month;
  for request in select * from public.ot_approval_requests where id=any(p_ids)
    and project_id=p_project and year=p_year and month=p_month and state='pending' order by id for update
  loop
    if not ot_private.can_review(request.group_id,request.user_id) then
      raise exception using errcode='42501',message='Reviewer required';
    end if;
    if p_approve then
      if calendar.days is distinct from request.calendar_days or calendar.limit_minutes is distinct from request.calendar_limits
        then raise exception 'OT_APPROVAL_CALENDAR'; end if;
      perform 1 from public.ot_project_members m join public.ot_profiles p on p.id=m.user_id join auth.users u on u.id=p.id
      where m.project_id=p_project and m.user_id=request.user_id and m.active and p.status='active'
        and p.employee_code=request.row_data->>'employee_code' and u.email_confirmed_at is not null
        and lower(u.email) ~ '^[^@[:space:]]+@bidv[.]com[.]vn$' for share of p,m;
      if not found then raise exception 'OT_EMPLOYEE'; end if;
      select id into previous from public.ot_entries where project_id=p_project and year=p_year and month=p_month
        and user_id=request.user_id and active;
      if previous is distinct from request.entry_before then raise exception 'OT_APPROVAL_STALE'; end if;
      update public.ot_entries set active=false,replaced_at=now() where id=previous;
      row_value := request.row_data;
      insert into public.ot_entries(project_id,user_id,year,month,employee_code,full_name,unit,nt_minutes,nn_minutes,
        unclassified_minutes,source,days,period_data_revision,created_by)
      values(p_project,request.user_id,p_year,p_month,row_value->>'employee_code',row_value->>'full_name',row_value->>'unit',
        (row_value->>'nt_minutes')::integer,(row_value->>'nn_minutes')::integer,0,'daily',row_value->'days',period.data_revision+1,auth.uid());
    end if;
    update public.ot_approval_requests set state=case when p_approve then 'approved' else 'returned' end,
      decided_by=auth.uid(),decided_at=now(),reason=case when not p_approve then btrim(p_reason) end where id=request.id;
    count_done := count_done+1;
  end loop;
  if count_done <> cardinality(p_ids) then raise exception 'OT_APPROVAL_STALE'; end if;
  if p_approve then update public.ot_periods set data_revision=data_revision+1
    where project_id=p_project and year=p_year and month=p_month; end if;
  perform ot_private.audit(case when p_approve then 'ot_approved' else 'ot_returned' end,
    jsonb_build_object('project_id',p_project,'year',p_year,'month',p_month,'requests',p_ids));
  return count_done;
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
  calendar_limits jsonb;
  canonical_days jsonb;
  approval_group public.ot_approval_groups%rowtype;
  previous_entry bigint;
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

  select days, limit_minutes into calendar_days, calendar_limits from public.ot_period_calendars
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
  where project_id = p_project and year = p_year and month = p_month and active and (p_batch or user_id = actor)
  and not exists (select from public.ot_approval_members am join public.ot_approval_groups g on g.id=am.group_id
    join public.ot_profiles p on p.id=am.user_id
    where am.project_id=p_project and am.user_id=ot_entries.user_id and g.enabled and p.organization_unit='Ban QLPTCB');

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

    select g.* into approval_group from public.ot_approval_members m join public.ot_approval_groups g on g.id=m.group_id
    join public.ot_profiles p on p.id=m.user_id
    where m.project_id=p_project and m.user_id=target_user and g.enabled and p.organization_unit='Ban QLPTCB';
    if approval_group.id is not null and not exists (
      select from public.ot_project_members m join public.ot_profiles p on p.id=m.user_id
      join auth.users u on u.id=p.id
      where m.project_id=p_project and m.active and p.status='active' and p.employee_code is not null
        and u.email_confirmed_at is not null and lower(u.email) ~ '^[^@[:space:]]+@bidv[.]com[.]vn$'
        and m.user_id <> target_user and m.user_id in (approval_group.reviewer_id,approval_group.backup_id)
    ) then raise exception 'OT_APPROVAL_REVIEWER'; end if;

    nt := 0;
    nn := 0;
    unknown_minutes := 0;
    seen_dates := '{}';
    if (not p_batch or approval_group.id is not null) and row_data->>'source' <> 'daily' then raise exception 'OT_DAILY_REQUIRED'; end if;
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
        if day_minutes > coalesce((calendar_limits->>(extract(day from day_date)::integer - 1))::integer,
          case when day_data->>'type' = 'NT' then 120 else 240 end) then raise exception 'OT_DAILY_LIMIT'; end if;
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

    select coalesce(jsonb_agg(jsonb_build_object('date', d->>'date', 'type', d->>'type', 'minutes', d->'minutes')
      order by d->>'date'), '[]'::jsonb) into canonical_days from jsonb_array_elements(row_data->'days') d;
    update public.ot_approval_requests set state='superseded'
    where project_id=p_project and year=p_year and month=p_month and user_id=target_user and state='pending';
    if approval_group.id is not null then
      select id into previous_entry from public.ot_entries
      where project_id=p_project and year=p_year and month=p_month and user_id=target_user and active;
      insert into public.ot_approval_requests(group_id,project_id,year,month,user_id,row_data,calendar_days,calendar_limits,entry_before,submitted_by)
      values (approval_group.id,p_project,p_year,p_month,target_user,
        jsonb_build_object('employee_code',target_code,'full_name',target_name,'unit',coalesce(row_data->>'unit',''),
          'nt_minutes',nt,'nn_minutes',nn,'unclassified_minutes',0,'days',canonical_days),
        calendar_days,calendar_limits,previous_entry,actor);
      perform ot_private.audit('ot_queued_for_approval',
        jsonb_build_object('project_id',p_project,'year',p_year,'month',p_month,'user_id',target_user,'group_id',approval_group.id));
    else
      insert into public.ot_entries(project_id,user_id,year,month,employee_code,full_name,unit,nt_minutes,nn_minutes,
        unclassified_minutes,source,days,period_data_revision,created_by)
      values (p_project,target_user,p_year,p_month,target_code,target_name,coalesce(row_data->>'unit',''),nt,nn,
        unknown_minutes,row_data->>'source',canonical_days,new_revision,actor);
    end if;
  end loop;

  update public.ot_periods set data_revision = new_revision
  where project_id = p_project and year = p_year and month = p_month;
  perform ot_private.audit(case when p_replace then 'entries_replaced' else 'entries_submitted' end,
    jsonb_build_object('project_id', p_project, 'year', p_year, 'month', p_month,
      'revision', new_revision, 'count', jsonb_array_length(p_rows), 'batch', p_batch));
  return new_revision;
end;
$$;

revoke all on function public.ot_activate_verified_profile(), public.ot_admin_account(uuid,text,text,text,text),
  public.ot_project_candidates(uuid), public.ot_set_members(uuid,uuid[],boolean),
  public.ot_list_approval_groups(uuid), public.ot_save_approval_group(uuid,bigint,text,boolean,uuid,uuid,uuid[],boolean),
  public.ot_approval_home(), public.ot_list_approval_requests(uuid,integer,integer),
  public.ot_my_approval_request(uuid,integer,integer), public.ot_decide_approval_requests(uuid,integer,integer,bigint[],boolean,text) from public, anon, authenticated;
grant execute on function public.ot_activate_verified_profile(), public.ot_admin_account(uuid,text,text,text,text),
  public.ot_project_candidates(uuid), public.ot_set_members(uuid,uuid[],boolean),
  public.ot_list_approval_groups(uuid), public.ot_save_approval_group(uuid,bigint,text,boolean,uuid,uuid,uuid[],boolean),
  public.ot_approval_home(), public.ot_list_approval_requests(uuid,integer,integer),
  public.ot_my_approval_request(uuid,integer,integer), public.ot_decide_approval_requests(uuid,integer,integer,bigint[],boolean,text) to authenticated;
revoke all on function ot_private.can_review(bigint,uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
