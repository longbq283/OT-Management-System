begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000001','admin@bidv.com.vn',now(),'{"full_name":"Admin","employee_code":"1"}'),
 ('00000000-0000-0000-0000-000000000002','lead@bidv.com.vn',now(),'{"full_name":"Lead","employee_code":"2"}'),
 ('00000000-0000-0000-0000-000000000003','worker@bidv.com.vn',now(),'{"full_name":"Worker","employee_code":"3"}'),
 ('00000000-0000-0000-0000-000000000004','direct@bidv.com.vn',now(),'{"full_name":"Direct","employee_code":"4"}'),
 ('00000000-0000-0000-0000-000000000005','unconfirmed@bidv.com.vn',null,'{"full_name":"Unverified","employee_code":"5"}'),
 ('00000000-0000-0000-0000-000000000006','deputy@bidv.com.vn',now(),'{"full_name":"Deputy","employee_code":"6"}'),
 ('00000000-0000-0000-0000-000000000007','duplicate@bidv.com.vn',now(),'{"full_name":"Duplicate","employee_code":"3"}');
update public.ot_profiles set role='admin',status='active',employee_code='00000001'
where id='00000000-0000-0000-0000-000000000001';

create function pg_temp.check_ok(value boolean) returns void language plpgsql as $$
begin
  if value is not true then raise exception 'Approval assertion failed'; end if;
end;
$$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate = expected or sqlerrm = expected then return; end if;
    raise;
  end;
  raise exception 'Unexpected success: %',statement;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
select pg_temp.check_ok(not ot_activate_verified_profile());
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.check_ok(ot_activate_verified_profile());
select pg_temp.check_ok((select status='active' and employee_code='00000003' from public.ot_profiles where id=auth.uid()));
select pg_temp.check_ok((select count(*)=0 from public.ot_projects));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000007',true);
select pg_temp.expect_error('select ot_activate_verified_profile()','23505');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select ot_manage_user('00000000-0000-0000-0000-000000000002','Lead','00000002',true);
select ot_manage_user('00000000-0000-0000-0000-000000000004','Direct','00000004',true);
select ot_manage_user('00000000-0000-0000-0000-000000000006','Deputy','00000006',true);
select ot_admin_account('00000000-0000-0000-0000-000000000002','edit','Lead','00000002','Ban QLPTCB');
select ot_admin_account('00000000-0000-0000-0000-000000000003','edit','Worker','00000003','Ban QLPTCB');
select ot_admin_account('00000000-0000-0000-0000-000000000004','edit','Direct','00000004','Trung tâm CNTT');
select ot_admin_account('00000000-0000-0000-0000-000000000006','edit','Deputy','00000006','Ban QLPTCB');
select set_config('ot.test_project',ot_save_project(null,'AP','Approval','',true)::text,true);
select ot_set_project_admin(current_setting('ot.test_project')::uuid,'00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.check_ok((select count(*)=5 from ot_project_candidates(current_setting('ot.test_project')::uuid)));
select ot_set_members(current_setting('ot.test_project')::uuid,
 '{00000000-0000-0000-0000-000000000002,00000000-0000-0000-0000-000000000003,00000000-0000-0000-0000-000000000004,00000000-0000-0000-0000-000000000006}',true);
select pg_temp.expect_error($q$select ot_save_approval_group(current_setting('ot.test_project')::uuid,null,'Wrong unit',true,
 '00000000-0000-0000-0000-000000000002',null,'{00000000-0000-0000-0000-000000000004}',false)$q$,'OT_GROUP_UNIT');
select ot_save_approval_group(current_setting('ot.test_project')::uuid,null,'Group A',true,
 '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000006',
 '{00000000-0000-0000-0000-000000000002,00000000-0000-0000-0000-000000000003}',false);
select ot_set_calendar_with_limits(current_setting('ot.test_project')::uuid,2026,11,0,
 (select jsonb_agg('NT'::text) from generate_series(1,30)),(select jsonb_agg(120) from generate_series(1,30)));
select ot_set_period(current_setting('ot.test_project')::uuid,2026,11,true,1);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select ot_submit_entries(current_setting('ot.test_project')::uuid,2026,11,2,0,false,false,
 '[{"employee_code":"00000003","source":"daily","unit":"Trung tâm CNTT","days":[{"date":"2026-11-02","type":"NT","minutes":90}]}]');
select pg_temp.check_ok((select count(*)=0 from public.ot_entries));
select pg_temp.check_ok((ot_my_approval_request(current_setting('ot.test_project')::uuid,2026,11)->>'state')='pending');
select pg_temp.check_ok(jsonb_array_length(ot_list_approval_requests(current_setting('ot.test_project')::uuid,2026,11))=0);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select ot_submit_entries(current_setting('ot.test_project')::uuid,2026,11,2,1,false,false,
 '[{"employee_code":"00000004","source":"daily","days":[{"date":"2026-11-02","type":"NT","minutes":60}]}]');
select pg_temp.check_ok((select count(*)=1 and sum(total_minutes)=60 from public.ot_entries));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select ot_submit_entries(current_setting('ot.test_project')::uuid,2026,11,2,2,false,false,
 '[{"employee_code":"00000002","source":"daily","days":[{"date":"2026-11-02","type":"NT","minutes":60}]}]');
select pg_temp.check_ok(jsonb_array_length(ot_list_approval_requests(current_setting('ot.test_project')::uuid,2026,11))=1);
select pg_temp.expect_error($q$select ot_decide_approval_requests(current_setting('ot.test_project')::uuid,2026,11,array[2::bigint],true,null)$q$,'42501');
select pg_temp.expect_error($q$select ot_decide_approval_requests(current_setting('ot.test_project')::uuid,2026,11,array[1::bigint,2::bigint],true,null)$q$,'42501');
select pg_temp.check_ok((ot_list_approval_requests(current_setting('ot.test_project')::uuid,2026,11)->0->>'state')='pending');
select ot_set_period(current_setting('ot.test_project')::uuid,2026,11,false,2);
select ot_decide_approval_requests(current_setting('ot.test_project')::uuid,2026,11,array[1::bigint],true,null);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
select ot_decide_approval_requests(current_setting('ot.test_project')::uuid,2026,11,array[2::bigint],false,'Kiểm tra giờ');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select pg_temp.check_ok((select count(*)=2 and sum(total_minutes)=150 from public.ot_entries where active));
select ot_admin_account('00000000-0000-0000-0000-000000000003','lock',null,null,null);
select ot_admin_account('00000000-0000-0000-0000-000000000003','unlock',null,null,null);
select ot_admin_account('00000000-0000-0000-0000-000000000003','delete',null,null,null);
select pg_temp.check_ok((select status='disabled' and deleted_at is not null from public.ot_profiles
  where id='00000000-0000-0000-0000-000000000003'));
select pg_temp.check_ok((select count(*)=1 from public.ot_entries where active and user_id='00000000-0000-0000-0000-000000000003'));
rollback;
