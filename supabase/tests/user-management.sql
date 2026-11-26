begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001','fixture-root@bidv.com.vn',now(),'{"full_name":"System admin","employee_code":"1"}'),
  ('00000000-0000-0000-0000-000000000002','fixture-admin@bidv.com.vn',now(),'{"full_name":"Project admin","employee_code":"2"}'),
  ('00000000-0000-0000-0000-000000000003','fixture-invite@bidv.com.vn',null,'{"full_name":"Registration name","employee_code":"3"}');
update public.ot_profiles set role='admin',status='active',employee_code='00000001'
where id='00000000-0000-0000-0000-000000000001';

create function pg_temp.assert_user(ok boolean) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'User management assertion failed'; end if;
end;
$$;
create function pg_temp.deny_user(statement text, expected_state text default '42501')
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
select ot_manage_user('00000000-0000-0000-0000-000000000002','Updated project admin','00000002',true);
select pg_temp.deny_user($q$select ot_manage_user('00000000-0000-0000-0000-000000000003','Unverified','00000003',true)$q$, 'P0001');
select ot_save_user_invitation('Fixture-Invite@bidv.com.vn','Verified roster name','00000003',true);
select ot_save_user_invitation('fixture-cancel@bidv.com.vn','Canceled','00000004',true);
select ot_save_user_invitation('fixture-cancel@bidv.com.vn',null,null,false);
select pg_temp.assert_user((select count(*)=1 from public.ot_user_invitations));
select set_config('ot.p1', ot_save_project(null,'P1','Fixture P1','',true)::text,true);
select set_config('ot.p2', ot_save_project(null,'P2','Fixture P2','',true)::text,true);
select ot_set_project_admin(current_setting('ot.p1')::uuid,'00000000-0000-0000-0000-000000000002',true);
select pg_temp.deny_user($q$select ot_manage_user('00000000-0000-0000-0000-000000000001','Changed admin','00000001',false)$q$);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_user(not ot_consume_user_invitation());
select pg_temp.assert_user((select count(*)=0 from public.ot_user_invitations));
reset role;
update auth.users set email_confirmed_at=now() where id='00000000-0000-0000-0000-000000000003';

set local role authenticated;
select pg_temp.assert_user(ot_consume_user_invitation());
select pg_temp.assert_user(not ot_consume_user_invitation());
select pg_temp.assert_user((select status='active' and full_name='Verified roster name' and employee_code='00000003' from public.ot_profiles));
select pg_temp.deny_user($q$select ot_set_member_by_code(current_setting('ot.p1')::uuid,'00000003',true)$q$);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.deny_user($q$select ot_save_user_invitation('bad@bidv.com.vn','Out of scope','00000099',true)$q$);
select pg_temp.deny_user($q$select ot_set_member_by_code(current_setting('ot.p2')::uuid,'00000003',true)$q$);
select pg_temp.deny_user($q$select ot_list_project_members(current_setting('ot.p2')::uuid)$q$);
select ot_set_member_by_code(current_setting('ot.p1')::uuid,'00000003',true);
select pg_temp.assert_user((select count(*)=1 and bool_and(employee_code='00000003') from ot_list_project_members(current_setting('ot.p1')::uuid)));
select ot_set_member(current_setting('ot.p1')::uuid,'00000000-0000-0000-0000-000000000003',false);
select pg_temp.assert_user((select count(*)=0 from ot_list_project_members(current_setting('ot.p1')::uuid)));

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select ot_set_member(current_setting('ot.p2')::uuid,'00000000-0000-0000-0000-000000000003',true);
select ot_set_calendar(current_setting('ot.p2')::uuid,2026,11,0,(select jsonb_agg('NT'::text) from generate_series(1,30)));
select ot_set_period(current_setting('ot.p2')::uuid,2026,11,true,1);
select ot_submit_entries(current_setting('ot.p2')::uuid,2026,11,2,0,false,true,
  '[{"employee_code":"00000003","source":"daily","days":[{"date":"2026-11-01","type":"NT","minutes":60}]}]');
select pg_temp.deny_user($q$select ot_manage_user('00000000-0000-0000-0000-000000000003','Edited','00000004',true)$q$, 'P0001');
select ot_manage_user('00000000-0000-0000-0000-000000000003','Disabled account',null,false);
select pg_temp.assert_user((select count(*)=1 and bool_and(total_minutes=60) from public.ot_entries));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_user((select count(*)=0 from public.ot_entries));
rollback;
