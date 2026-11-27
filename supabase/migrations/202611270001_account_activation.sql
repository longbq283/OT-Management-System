begin;

alter table public.ot_user_invitations
  add column project_id uuid references public.ot_projects(id);

create function public.ot_prepare_account_activation(
  p_email text, p_full_name text, p_employee_code text, p_project uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  email_address text := lower(btrim(p_email));
begin
  if p_project is null then
    perform public.ot_save_user_invitation(p_email, p_full_name, p_employee_code, true);
    update public.ot_user_invitations set project_id = null, created_by = auth.uid() where email = email_address;
    return;
  end if;

  perform ot_private.require_project_admin(p_project);
  perform 1 from public.ot_projects where id = p_project and status = 'active' for share;
  if not found then raise exception 'OT_PROJECT_INACTIVE'; end if;
  if email_address is null or email_address !~ '^[^@[:space:]]+@bidv[.]com[.]vn$'
    or length(email_address) > 254 or p_full_name is null or length(btrim(p_full_name)) not between 1 and 200
    or p_employee_code is null or p_employee_code !~ '^[0-9]{8}$' then raise exception 'OT_INVALID'; end if;
  if exists (select from public.ot_profiles p where lower(p.email) = email_address
    and (p.status <> 'pending' or p.role <> 'user')) then raise exception 'OT_PROFILE_EXISTS'; end if;
  if exists (select from public.ot_profiles p where p.employee_code = p_employee_code) then
    raise exception using errcode = '23505', message = 'Duplicate employee code';
  end if;

  insert into public.ot_user_invitations(email, full_name, employee_code, created_by, project_id)
  values (email_address, btrim(p_full_name), p_employee_code, auth.uid(), p_project)
  on conflict (email) do update
    set full_name = excluded.full_name, employee_code = excluded.employee_code, updated_at = now()
    where ot_user_invitations.project_id = excluded.project_id
      and ot_user_invitations.created_by = excluded.created_by;
  if not found then raise exception 'OT_ACTIVATION_RESERVED'; end if;
  perform ot_private.audit('user_invitation_changed',
    jsonb_build_object('email', email_address, 'active', true, 'project_id', p_project));
end;
$$;

create or replace function public.ot_consume_user_invitation()
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

  select * into invited from public.ot_user_invitations where email = login_email for update;
  if not found then return false; end if;
  if invited.project_id is not null then
    perform 1 from public.ot_projects where id = invited.project_id and status = 'active' for share;
    if not found then return false; end if;
    perform 1 from public.ot_profiles p join auth.users u on u.id = p.id
    where p.id = invited.created_by and p.status = 'active' and u.email_confirmed_at is not null
      and lower(u.email) ~ '^[^@[:space:]]+@bidv[.]com[.]vn$'
      and (p.role = 'admin' or p.employee_code is not null)
    for share of p;
    if not found then return false; end if;
    if not exists (select from public.ot_profiles where id = invited.created_by and role = 'admin') then
      perform 1 from public.ot_project_admins
      where user_id = invited.created_by and project_id = invited.project_id and active for share;
      if not found then return false; end if;
    end if;
  end if;

  update public.ot_profiles set employee_code = invited.employee_code, full_name = invited.full_name,
    status = 'active', updated_at = now() where id = auth.uid();
  if invited.project_id is not null then
    insert into public.ot_project_members(project_id, user_id, active)
    values (invited.project_id, auth.uid(), true)
    on conflict (project_id, user_id) do update set active = true, updated_at = now();
  end if;
  delete from public.ot_user_invitations where email = login_email;
  perform ot_private.audit('user_invitation_accepted',
    jsonb_build_object('approved_by', invited.created_by, 'project_id', invited.project_id));
  return true;
end;
$$;

revoke all on function public.ot_prepare_account_activation(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.ot_prepare_account_activation(text, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
