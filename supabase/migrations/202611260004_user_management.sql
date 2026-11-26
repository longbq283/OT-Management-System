begin;

create table public.ot_user_invitations (
  email text primary key,
  full_name text not null,
  employee_code text not null unique,
  created_by uuid not null references public.ot_profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.ot_user_invitations enable row level security;
revoke all on public.ot_user_invitations from public, anon, authenticated;
grant select on public.ot_user_invitations to authenticated;
create policy ot_user_invitations_read on public.ot_user_invitations for select to authenticated
  using ((select ot_private.is_admin()));

create function public.ot_save_user_invitation(p_email text, p_full_name text, p_employee_code text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  email_address text := lower(btrim(p_email));
begin
  perform ot_private.require_admin();
  if email_address is null or email_address !~ '^[^@[:space:]]+@bidv[.]com[.]vn$'
    or length(email_address) > 254 or p_active is null then raise exception 'OT_INVALID'; end if;
  if p_active then
    if p_full_name is null or length(btrim(p_full_name)) not between 1 and 200
      or p_employee_code is null or p_employee_code !~ '^[0-9]{8}$' then raise exception 'OT_INVALID'; end if;
    if exists (select from public.ot_profiles p where lower(p.email) = email_address
      and (p.status <> 'pending' or p.role <> 'user')) then raise exception 'OT_PROFILE_EXISTS'; end if;
    if exists (select from public.ot_profiles p where p.employee_code = p_employee_code) then
      raise exception using errcode = '23505', message = 'Duplicate employee code';
    end if;
    insert into public.ot_user_invitations(email, full_name, employee_code, created_by)
    values (email_address, btrim(p_full_name), p_employee_code, auth.uid())
    on conflict (email) do update set full_name = excluded.full_name, employee_code = excluded.employee_code, updated_at = now();
  else
    delete from public.ot_user_invitations where email = email_address;
    if not found then raise exception 'OT_INVALID'; end if;
  end if;
  perform ot_private.audit('user_invitation_changed', jsonb_build_object('email', email_address, 'active', p_active));
end;
$$;

create function public.ot_consume_user_invitation()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  invited public.ot_user_invitations%rowtype;
  login_email text;
begin
  select lower(u.email) into login_email
  from public.ot_profiles p join auth.users u on u.id = p.id
  where p.id = auth.uid() and p.role = 'user' and p.status = 'pending'
    and lower(p.email) = lower(u.email) and u.email_confirmed_at is not null
  for update of p;
  if not found then return false; end if;

  delete from public.ot_user_invitations where email = login_email returning * into invited;
  if not found then return false; end if;
  update public.ot_profiles set employee_code = invited.employee_code, full_name = invited.full_name,
    status = 'active', updated_at = now() where id = auth.uid();
  perform ot_private.audit('user_invitation_accepted', jsonb_build_object('approved_by', invited.created_by));
  return true;
end;
$$;

create function public.ot_manage_user(p_user uuid, p_full_name text, p_employee_code text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  original public.ot_profiles%rowtype;
begin
  perform ot_private.require_admin();
  select * into original from public.ot_profiles where id = p_user and role = 'user' for update;
  if not found then raise exception using errcode = '42501', message = 'Invalid account'; end if;
  if p_active is null or p_full_name is null or length(btrim(p_full_name)) not between 1 and 200 then
    raise exception 'OT_INVALID';
  end if;
  if p_active then
    if p_employee_code is null or p_employee_code !~ '^[0-9]{8}$' then raise exception 'OT_INVALID'; end if;
    if not exists (select from auth.users u where u.id = p_user and u.email_confirmed_at is not null
      and lower(u.email) ~ '^[^@[:space:]]+@bidv[.]com[.]vn$') then raise exception 'OT_CONFIRM'; end if;
    if original.employee_code is distinct from p_employee_code and exists (select from public.ot_entries where user_id = p_user) then
      raise exception 'OT_CODE_HAS_HISTORY';
    end if;
    update public.ot_profiles set full_name = btrim(p_full_name), employee_code = p_employee_code,
      status = 'active', updated_at = now() where id = p_user;
  else
    update public.ot_profiles set full_name = btrim(p_full_name), status = 'disabled', updated_at = now() where id = p_user;
  end if;
  delete from public.ot_user_invitations where email = lower(original.email);
  perform ot_private.audit('profile_review', jsonb_build_object('user_id', p_user, 'active', p_active));
end;
$$;

create or replace function public.ot_set_member(p_project uuid, p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform ot_private.require_project_admin(p_project);
  if p_active is null then raise exception 'OT_INVALID'; end if;
  perform 1 from public.ot_profiles p join auth.users u on u.id = p.id
  where p.id = p_user and (not p_active or (p.status = 'active' and p.employee_code is not null
    and u.email_confirmed_at is not null and lower(u.email) ~ '^[^@[:space:]]+@bidv[.]com[.]vn$')) for share of p;
  if not found then raise exception 'OT_EMPLOYEE'; end if;
  perform 1 from public.ot_projects where id = p_project and (not p_active or status = 'active') for share;
  if not found then raise exception 'OT_CLOSED'; end if;
  if p_active then
    insert into public.ot_project_members(project_id, user_id, active)
    values (p_project, p_user, true)
    on conflict (project_id, user_id) do update set active = true, updated_at = now();
  else
    update public.ot_project_members set active = false, updated_at = now()
    where project_id = p_project and user_id = p_user and active;
    if not found then raise exception 'OT_MEMBER_MISSING'; end if;
  end if;
  perform ot_private.audit('membership_changed', jsonb_build_object('project_id', p_project, 'user_id', p_user, 'active', p_active));
end;
$$;

create function public.ot_set_member_by_code(p_project uuid, p_employee_code text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
begin
  perform ot_private.require_project_admin(p_project);
  select id into target from public.ot_profiles
  where employee_code = p_employee_code and (not p_active or status = 'active') for share;
  if not found then raise exception 'OT_EMPLOYEE'; end if;
  perform public.ot_set_member(p_project, target, p_active);
end;
$$;

create function public.ot_list_project_members(p_project uuid)
returns table (user_id uuid, full_name text, employee_code text, status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (ot_private.is_admin() or ot_private.is_project_admin(p_project)) then
    raise exception using errcode = '42501', message = 'Project administrator required';
  end if;
  return query select p.id, p.full_name::text, p.employee_code::text, p.status::text
  from public.ot_project_members m join public.ot_profiles p on p.id = m.user_id
  where m.project_id = p_project and m.active order by p.full_name, p.id;
end;
$$;

revoke all on function public.ot_save_user_invitation(text, text, text, boolean),
  public.ot_consume_user_invitation(), public.ot_manage_user(uuid, text, text, boolean),
  public.ot_set_member_by_code(uuid, text, boolean), public.ot_list_project_members(uuid) from public, anon, authenticated;
grant execute on function public.ot_save_user_invitation(text, text, text, boolean),
  public.ot_consume_user_invitation(), public.ot_manage_user(uuid, text, text, boolean),
  public.ot_set_member_by_code(uuid, text, boolean), public.ot_list_project_members(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
