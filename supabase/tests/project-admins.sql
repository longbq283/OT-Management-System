begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001','fixture-root@bidv.com.vn',now(),'{"full_name":"System admin","employee_code":"1"}'),
  ('00000000-0000-0000-0000-000000000002','fixture-delegate@bidv.com.vn',now(),'{"full_name":"Project admin","employee_code":"2"}'),
  ('00000000-0000-0000-0000-000000000003','fixture-member@bidv.com.vn',now(),'{"full_name":"Team member","employee_code":"3"}'),
  ('00000000-0000-0000-0000-000000000004','fixture-pending@bidv.com.vn',now(),'{"full_name":"Pending","employee_code":"4"}');
update public.ot_profiles set role='admin',status='active',employee_code='00000001'
where id='00000000-0000-0000-0000-000000000001';

create function pg_temp.check_admin_scope(result boolean) returns void language plpgsql as $$
begin
  if result is not true then raise exception 'Project admin scope check failed'; end if;
end;
$$;
create function pg_temp.expect_denied(statement text, expected text default '42501')
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected then return; end if;
    raise;
  end;
  raise exception 'Unexpected authorization: %', statement;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select ot_review_profile('00000000-0000-0000-0000-000000000002',true,'00000002');
select ot_review_profile('00000000-0000-0000-0000-000000000003',true,'00000003');
select set_config('ot.test_project', ot_save_project(null,'P1','Fixture P1','',true)::text,true);
select set_config('ot.test_other', ot_save_project(null,'P2','Fixture P2','',true)::text,true);
select ot_set_member(current_setting('ot.test_project')::uuid,'00000000-0000-0000-0000-000000000003',true);
select ot_set_member(current_setting('ot.test_other')::uuid,'00000000-0000-0000-0000-000000000003',true);
select ot_set_member(current_setting('ot.test_other')::uuid,'00000000-0000-0000-0000-000000000002',true);
select ot_set_period(current_setting('ot.test_project')::uuid,2026,11,true,0);
select ot_set_period(current_setting('ot.test_other')::uuid,2026,11,true,0);
select set_config('ot.test_rows','[{"employee_code":"00000003","source":"summary","days":[],"nt_minutes":120,"nn_minutes":0,"unclassified_minutes":0}]',true);
select ot_submit_entries(current_setting('ot.test_project')::uuid,2026,11,1,0,false,true,current_setting('ot.test_rows')::jsonb);
select ot_submit_entries(current_setting('ot.test_other')::uuid,2026,11,1,0,false,true,current_setting('ot.test_rows')::jsonb);
select pg_temp.expect_denied($q$select ot_set_project_admin(current_setting('ot.test_project')::uuid,'00000000-0000-0000-0000-000000000004', true)$q$, 'P0001');
select ot_set_project_admin(current_setting('ot.test_project')::uuid,'00000000-0000-0000-0000-000000000002',true);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.check_admin_scope((select count(*)=1 and bool_and(project_id=current_setting('ot.test_project')::uuid) from public.ot_project_admins));
select pg_temp.check_admin_scope((select count(*)=1 and bool_and(project_id=current_setting('ot.test_project')::uuid) from public.ot_entries));
select pg_temp.check_admin_scope((select count(*)=1 from public.ot_profiles));
select pg_temp.check_admin_scope((select count(*)=0 from public.ot_audit_events));
select pg_temp.check_admin_scope(ot_set_period(current_setting('ot.test_project')::uuid,2026,11,false,1)=2);
select pg_temp.expect_denied($q$select ot_set_period(current_setting('ot.test_other')::uuid,2026,11,false,1)$q$);
select pg_temp.expect_denied($q$select ot_set_project_admin(current_setting('ot.test_other')::uuid,'00000000-0000-0000-0000-000000000002', true)$q$);
select pg_temp.expect_denied($q$select ot_set_project_admin(current_setting('ot.test_project')::uuid,'00000000-0000-0000-0000-000000000003', true)$q$);
select pg_temp.expect_denied($q$update ot_project_admins set active=true$q$);
select pg_temp.expect_denied($q$select ot_review_profile('00000000-0000-0000-0000-000000000004',true,'00000004')$q$);
select pg_temp.expect_denied($q$select ot_submit_entries(current_setting('ot.test_project')::uuid,2026,11,2,1,true,true,current_setting('ot.test_rows')::jsonb)$q$);
select pg_temp.expect_denied($q$select ot_set_member(current_setting('ot.test_project')::uuid,'00000000-0000-0000-0000-000000000002', true)$q$);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select ot_set_project_admin(current_setting('ot.test_project')::uuid,'00000000-0000-0000-0000-000000000002',false);
select pg_temp.check_admin_scope((select count(*)=2 from public.ot_audit_events where action='project_admin_changed'));

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.check_admin_scope((select count(*)=0 from public.ot_project_admins));
select pg_temp.check_admin_scope((select count(*)=0 from public.ot_entries));
select pg_temp.expect_denied($q$select ot_set_period(current_setting('ot.test_project')::uuid,2026,11,true,2)$q$);
rollback;
