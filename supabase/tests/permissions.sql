begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001','fixture-admin@bidv.com.vn',now(),'{"full_name":"Fixture Admin","employee_code":"1"}'),
  ('00000000-0000-0000-0000-000000000002','fixture-a@bidv.com.vn',now(),'{"full_name":"Fixture A","employee_code":"2","role":"admin"}'),
  ('00000000-0000-0000-0000-000000000003','fixture-b@bidv.com.vn',now(),'{"full_name":"Fixture B","employee_code":"3"}'),
  ('00000000-0000-0000-0000-000000000004','fixture-pending@bidv.com.vn',null,'{"full_name":"Fixture Pending","employee_code":"4"}');
update ot_profiles set role='admin',status='active',employee_code='00000001'
where id='00000000-0000-0000-0000-000000000001';

create function pg_temp.assert_ok(actual boolean, label text) returns void language plpgsql as $$
begin
  if actual is not true then raise exception 'Assertion failed: %', label; end if;
end;
$$;

create function pg_temp.expect_error(statement text, expected_state text, expected_message text default null)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state and (expected_message is null or sqlerrm = expected_message) then return; end if;
    raise;
  end;
  raise exception 'Expected SQLSTATE %, command unexpectedly succeeded', expected_state;
end;
$$;

set local role anon;
select pg_temp.expect_error('select * from public.ot_profiles', '42501');
select pg_temp.expect_error('select public.ot_set_period(null, 2026, 11, true, 0)', '42501');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_ok((select count(*)=1 and bool_and(role='user' and status='pending' and employee_code is null) from ot_profiles), 'self only, pending even with role metadata');
select pg_temp.expect_error('update public.ot_profiles set role = ''admin''', '42501');
select pg_temp.expect_error('select public.ot_save_project(null, ''P1'', ''Fixture P1'', '''', true)', '42501');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select pg_temp.expect_error($q$select public.ot_review_profile('00000000-0000-0000-0000-000000000004',true,'00000004')$q$, 'P0001','OT_CONFIRM');
select ot_review_profile('00000000-0000-0000-0000-000000000002',true,'00000002');
select pg_temp.expect_error($q$select public.ot_review_profile('00000000-0000-0000-0000-000000000003',true,'00000002')$q$, '23505');
select ot_review_profile('00000000-0000-0000-0000-000000000003',true,'00000003');
select set_config('ot.test_project', ot_save_project(null,'P1','Fixture P1','',true)::text,true);
select set_config('ot.test_other', ot_save_project(null,'P2','Fixture P2','',true)::text,true);
select ot_set_member(current_setting('ot.test_project')::uuid,'00000000-0000-0000-0000-000000000002',true);
select ot_set_member(current_setting('ot.test_project')::uuid,'00000000-0000-0000-0000-000000000003',true);
select ot_set_member(current_setting('ot.test_other')::uuid,'00000000-0000-0000-0000-000000000002',true);

select set_config('ot.test_a','[{"employee_code":"00000002","source":"daily","days":[{"date":"2026-11-01","type":"NT","minutes":120},{"date":"2026-11-02","type":"L","minutes":60}],"nt_minutes":999}]',true);
select set_config('ot.test_b','[{"employee_code":"00000003","source":"summary","days":[],"nt_minutes":120,"nn_minutes":0,"unclassified_minutes":0}]',true);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.expect_error($q$select public.ot_submit_entries(current_setting('ot.test_project')::uuid,2026,11,0,0,false,false,current_setting('ot.test_a')::jsonb)$q$, 'P0001','OT_CLOSED');
select pg_temp.expect_error('insert into ot_entries (project_id) values (null)', '42501');
select pg_temp.expect_error($q$select public.ot_set_period(current_setting('ot.test_project')::uuid,2026,11,true,0)$q$, '42501');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select ot_set_period(current_setting('ot.test_project')::uuid,2026,11,true,0);
select ot_set_period(current_setting('ot.test_other')::uuid,2026,11,true,0);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.expect_error($q$select public.ot_submit_entries(current_setting('ot.test_project')::uuid,2026,11,1,0,false,true,current_setting('ot.test_a')::jsonb)$q$, '42501');
select pg_temp.expect_error($q$select public.ot_submit_entries(current_setting('ot.test_project')::uuid,2026,11,1,0,false,false,current_setting('ot.test_b')::jsonb)$q$, 'P0001','OT_EMPLOYEE');
select ot_submit_entries(current_setting('ot.test_project')::uuid,2026,11,1,0,false,false,current_setting('ot.test_a')::jsonb);
select ot_submit_entries(current_setting('ot.test_other')::uuid,2026,11,1,0,false,false,current_setting('ot.test_a')::jsonb);
select pg_temp.assert_ok((select count(*)=2 and sum(nt_minutes)=240 and sum(nn_minutes)=120 and sum(total_minutes)=360 from ot_entries), 'canonical NT, L, total across projects');
select pg_temp.expect_error($q$select public.ot_submit_entries(current_setting('ot.test_project')::uuid,2026,11,1,0,true,false,current_setting('ot.test_a')::jsonb)$q$, '40001');
select pg_temp.expect_error($q$select public.ot_submit_entries(current_setting('ot.test_project')::uuid,2026,11,1,1,false,false,current_setting('ot.test_a')::jsonb)$q$, 'P0001','OT_EXISTS');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_ok((select count(*)=1 from ot_projects), 'unassigned project is not visible');
select pg_temp.assert_ok((select count(*)=0 from ot_entries), 'another member rows are invisible');
select ot_submit_entries(current_setting('ot.test_project')::uuid,2026,11,1,1,false,false,current_setting('ot.test_b')::jsonb);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select ot_submit_entries(current_setting('ot.test_project')::uuid,2026,11,1,2,true,false,current_setting('ot.test_a')::jsonb);
select pg_temp.assert_ok((select count(*)=3 and count(*) filter(where active)=2 and bool_and(employee_code='00000002') from ot_entries), 'replacement keeps history and RLS scope');
select pg_temp.assert_ok((select count(*)=0 from ot_audit_events), 'no admin audit for user');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select pg_temp.expect_error($q$select public.ot_submit_entries(current_setting('ot.test_project')::uuid,2026,11,1,3,true,true,current_setting('ot.test_a')::jsonb || current_setting('ot.test_a')::jsonb)$q$, 'P0001','OT_INVALID');
select pg_temp.assert_ok((select count(*)=3 from ot_entries where active), 'bad batch rolled back archive and insert');
select ot_submit_entries(current_setting('ot.test_project')::uuid,2026,11,1,3,true,true,current_setting('ot.test_a')::jsonb);
select pg_temp.assert_ok((select count(*)=2 from ot_entries where active), 'admin replacement archives omitted rows');
select ot_set_period(current_setting('ot.test_project')::uuid,2026,11,false,1);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.expect_error($q$select public.ot_submit_entries(current_setting('ot.test_project')::uuid,2026,11,2,4,true,false,current_setting('ot.test_a')::jsonb)$q$, 'P0001','OT_CLOSED');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select ot_set_member(current_setting('ot.test_other')::uuid,'00000000-0000-0000-0000-000000000002',false);
select pg_temp.assert_ok((select count(*)>=12 from ot_audit_events), 'admin audit records exist');
select ot_review_profile('00000000-0000-0000-0000-000000000003',false,null);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_ok((select count(*)=0 from ot_entries where project_id=current_setting('ot.test_other')::uuid), 'revoked assignment hides data');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_ok((select count(*)=0 from ot_entries), 'disabled account cannot read even its versions');
rollback;
