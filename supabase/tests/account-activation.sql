begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001','fixture-root@bidv.com.vn',now(),'{"full_name":"System admin","employee_code":"1"}'),
  ('00000000-0000-0000-0000-000000000002','fixture-lead@bidv.com.vn',now(),'{"full_name":"Project admin","employee_code":"2"}'),
  ('00000000-0000-0000-0000-000000000003','fixture-join@bidv.com.vn',null,'{"full_name":"Original name","employee_code":"3"}'),
  ('00000000-0000-0000-0000-000000000004','fixture-revoked@bidv.com.vn',now(),'{"full_name":"Other user","employee_code":"4"}');
update public.ot_profiles set role='admin',status='active',employee_code='00000001'
where id='00000000-0000-0000-0000-000000000001';

create function pg_temp.assert_activation(ok boolean) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'Account activation assertion failed'; end if;
end;
$$;
create function pg_temp.deny_activation(statement text, expected_state text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise;
  end;
  raise exception 'Unexpected authorization: %', statement;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select ot_manage_user('00000000-0000-0000-0000-000000000002','Project admin','00000002',true);
select set_config('ot.activation_project',ot_save_project(null,'A1','Activation project','',true)::text,true);
select set_config('ot.other_project',ot_save_project(null,'A2','Other project','',true)::text,true);
select ot_set_project_admin(current_setting('ot.activation_project')::uuid,'00000000-0000-0000-0000-000000000002',true);
select ot_prepare_account_activation('fixture-central@bidv.com.vn','Central pending','00000005',null);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.deny_activation($q$select ot_prepare_account_activation('fixture-join@bidv.com.vn','Invalid scope','00000003',null)$q$,'42501');
select pg_temp.deny_activation($q$select ot_prepare_account_activation('fixture-join@bidv.com.vn','Other project','00000003',current_setting('ot.other_project')::uuid)$q$,'42501');
select pg_temp.deny_activation($q$select ot_prepare_account_activation('fixture-central@bidv.com.vn','Cannot overwrite','00000006',current_setting('ot.activation_project')::uuid)$q$,'P0001');
select ot_prepare_account_activation('fixture-join@bidv.com.vn','Activated member','00000003',current_setting('ot.activation_project')::uuid);
select ot_prepare_account_activation('fixture-join@bidv.com.vn','Activated member','00000003',current_setting('ot.activation_project')::uuid);
select ot_prepare_account_activation('fixture-revoked@bidv.com.vn','Revoked member','00000004',current_setting('ot.activation_project')::uuid);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_activation(not ot_consume_user_invitation());
reset role;
update auth.users set email_confirmed_at=now() where id='00000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.assert_activation(ot_consume_user_invitation());
select pg_temp.assert_activation(not ot_consume_user_invitation());
select pg_temp.assert_activation((select full_name='Activated member' and status='active' and role='user'
  from public.ot_profiles where id=auth.uid()));
select pg_temp.assert_activation((select count(*)=1 from public.ot_project_members
  where user_id=auth.uid() and project_id=current_setting('ot.activation_project')::uuid and active));
select pg_temp.assert_activation((select count(*)=0 from public.ot_project_admins where user_id=auth.uid()));

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select ot_set_project_admin(current_setting('ot.activation_project')::uuid,'00000000-0000-0000-0000-000000000002',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select pg_temp.assert_activation(not ot_consume_user_invitation());
select pg_temp.assert_activation((select status='pending' from public.ot_profiles where id=auth.uid()));
rollback;
