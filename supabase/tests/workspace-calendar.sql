begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001','fixture-root@bidv.com.vn',now(),'{"full_name":"System admin","employee_code":"1"}'),
  ('00000000-0000-0000-0000-000000000002','fixture-member@bidv.com.vn',now(),'{"full_name":"Member","employee_code":"2"}');
update public.ot_profiles set role='admin',status='active',employee_code='00000001'
where id='00000000-0000-0000-0000-000000000001';

create function pg_temp.check_calendar(result boolean) returns void language plpgsql as $$
begin
  if result is not true then raise exception 'Calendar assertion failed'; end if;
end;
$$;
create function pg_temp.expect_calendar_error(statement text, expected_state text, expected_message text default null)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state and (expected_message is null or sqlerrm = expected_message) then return; end if;
    raise;
  end;
  raise exception 'Unexpected success: %', statement;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select ot_review_profile('00000000-0000-0000-0000-000000000002',true,'00000002');
select set_config('ot.project', ot_save_project(null,'P1','Fixture P1','',true)::text,true);
select set_config('ot.other', ot_save_project(null,'P2','Fixture P2','',true)::text,true);
select ot_set_member(current_setting('ot.project')::uuid,'00000000-0000-0000-0000-000000000001',true);
select ot_set_member(current_setting('ot.project')::uuid,'00000000-0000-0000-0000-000000000002',true);
select ot_set_project_admin(current_setting('ot.project')::uuid,'00000000-0000-0000-0000-000000000001',true);
select ot_set_project_admin(current_setting('ot.project')::uuid,'00000000-0000-0000-0000-000000000002',true);
select pg_temp.check_calendar((select count(*)=2 from public.ot_project_admins where active));
select pg_temp.expect_calendar_error($q$select ot_set_period(current_setting('ot.project')::uuid,2028,2,true,0)$q$, 'P0001','OT_CALENDAR_REQUIRED');
select pg_temp.expect_calendar_error($q$select ot_set_calendar(current_setting('ot.project')::uuid,2028,2,0,'["L"]')$q$, 'P0001','OT_CALENDAR_INVALID');
select set_config('ot.days', (select jsonb_agg(case n when 1 then 'L' when 2 then 'NN' else 'NT' end order by n)::text from generate_series(1,29) n),true);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.expect_calendar_error($q$select ot_set_calendar(current_setting('ot.other')::uuid,2028,2,0,current_setting('ot.days')::jsonb)$q$, '42501');
select pg_temp.check_calendar(ot_set_calendar(current_setting('ot.project')::uuid,2028,2,0,current_setting('ot.days')::jsonb)=1);
select pg_temp.expect_calendar_error($q$select ot_set_calendar(current_setting('ot.project')::uuid,2028,2,0,current_setting('ot.days')::jsonb)$q$, '40001');
select pg_temp.check_calendar(ot_set_period(current_setting('ot.project')::uuid,2028,2,true,1)=2);
select pg_temp.expect_calendar_error($q$select ot_set_calendar(current_setting('ot.project')::uuid,2028,2,2,current_setting('ot.days')::jsonb)$q$, 'P0001','OT_CALENDAR_OPEN');
select set_config('ot.summary', '[{"employee_code":"00000002","source":"summary","days":[],"nt_minutes":60,"nn_minutes":0,"unclassified_minutes":0}]',true);
select pg_temp.expect_calendar_error($q$select ot_submit_entries(current_setting('ot.project')::uuid,2028,2,2,0,false,false,current_setting('ot.summary')::jsonb)$q$, 'P0001','OT_DAILY_REQUIRED');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('ot.rows', '[{"employee_code":"00000001","source":"daily","days":[{"date":"2028-02-01","type":"L","minutes":60}]}]',true);
select pg_temp.expect_calendar_error($q$select ot_submit_entries(current_setting('ot.project')::uuid,2028,2,2,0,false,false,replace(current_setting('ot.rows'),'"L"','"NT"')::jsonb)$q$, 'P0001','OT_DAY_TYPE');
select pg_temp.check_calendar(ot_submit_entries(current_setting('ot.project')::uuid,2028,2,2,0,false,false,current_setting('ot.rows')::jsonb)=1);
select pg_temp.check_calendar((select total_minutes=60 and nn_minutes=60 from public.ot_entries where active));

select ot_set_period(current_setting('ot.project')::uuid,2028,2,false,2);
select ot_set_calendar(current_setting('ot.project')::uuid,2028,2,3,jsonb_set(current_setting('ot.days')::jsonb,'{0}','"NT"'));
select ot_set_period(current_setting('ot.project')::uuid,2028,2,true,4);
select pg_temp.expect_calendar_error($q$select ot_submit_entries(current_setting('ot.project')::uuid,2028,2,2,1,true,false,current_setting('ot.rows')::jsonb)$q$, '40001');
select pg_temp.check_calendar((select nn_minutes=60 and days->0->>'type'='L' from public.ot_entries where active));
rollback;
