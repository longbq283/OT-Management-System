begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001','fixture-root@bidv.com.vn',now(),'{"full_name":"Admin","employee_code":"1"}'),
  ('00000000-0000-0000-0000-000000000002','fixture-delegate@bidv.com.vn',now(),'{"full_name":"Project admin","employee_code":"2"}'),
  ('00000000-0000-0000-0000-000000000003','fixture-member@bidv.com.vn',now(),'{"full_name":"Member","employee_code":"3"}');
update public.ot_profiles set role='admin',status='active',employee_code='00000001'
where id='00000000-0000-0000-0000-000000000001';

create function pg_temp.expect_limit_error(statement text, expected_state text, expected_message text default null)
returns void language plpgsql as $$
begin
  begin execute statement;
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
select ot_review_profile('00000000-0000-0000-0000-000000000003',true,'00000003');
select set_config('ot.project', ot_save_project(null,'P1','Fixture P1','',true)::text,true);
select set_config('ot.other', ot_save_project(null,'P2','Fixture P2','',true)::text,true);
select ot_set_member(current_setting('ot.project')::uuid,'00000000-0000-0000-0000-000000000003',true);
select ot_set_project_admin(current_setting('ot.project')::uuid,'00000000-0000-0000-0000-000000000002',true);
select set_config('ot.days', (select jsonb_agg(case n when 2 then 'L' when 3 then 'NN' else 'NT' end order by n)::text from generate_series(1,30) n),true);
select set_config('ot.limits', (select jsonb_agg(case n when 1 then 180 when 2 then 0 else 240 end order by n)::text from generate_series(1,30) n),true);
select ot_set_calendar(current_setting('ot.project')::uuid,2026,11,0,current_setting('ot.days')::jsonb);
select ot_set_period(current_setting('ot.project')::uuid,2026,11,true,1);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select set_config('ot.entry','[{"employee_code":"00000003","source":"daily","days":[{"date":"2026-11-01","type":"NT","minutes":121}]}]',true);
select pg_temp.expect_limit_error($q$select ot_submit_entries(current_setting('ot.project')::uuid,2026,11,2,0,false,false,current_setting('ot.entry')::jsonb)$q$, 'P0001','OT_DAILY_LIMIT');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.expect_limit_error($q$select ot_set_calendar_with_limits(current_setting('ot.other')::uuid,2026,11,0,current_setting('ot.days')::jsonb,current_setting('ot.limits')::jsonb)$q$, '42501');
select pg_temp.expect_limit_error($q$select ot_set_calendar_with_limits(current_setting('ot.project')::uuid,2026,11,2,current_setting('ot.days')::jsonb,current_setting('ot.limits')::jsonb)$q$, 'P0001','OT_CALENDAR_OPEN');
select ot_set_period(current_setting('ot.project')::uuid,2026,11,false,2);
select pg_temp.expect_limit_error($q$select ot_set_calendar_with_limits(current_setting('ot.project')::uuid,2026,11,3,current_setting('ot.days')::jsonb,jsonb_set(current_setting('ot.limits')::jsonb,'{0}','-1'))$q$, 'P0001','OT_LIMITS_INVALID');
select pg_temp.expect_limit_error($q$select ot_set_calendar_with_limits(current_setting('ot.project')::uuid,2026,11,2,current_setting('ot.days')::jsonb,current_setting('ot.limits')::jsonb)$q$, '40001');
select ot_set_calendar_with_limits(current_setting('ot.project')::uuid,2026,11,3,current_setting('ot.days')::jsonb,current_setting('ot.limits')::jsonb);
select ot_set_period(current_setting('ot.project')::uuid,2026,11,true,4);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select ot_submit_entries(current_setting('ot.project')::uuid,2026,11,5,0,false,false,
  '[{"employee_code":"00000003","source":"daily","days":[{"date":"2026-11-01","type":"NT","minutes":180}]}]');
select pg_temp.expect_limit_error($q$select ot_submit_entries(current_setting('ot.project')::uuid,2026,11,5,1,true,false,
  '[{"employee_code":"00000003","source":"daily","days":[{"date":"2026-11-02","type":"L","minutes":1}]}]')$q$, 'P0001','OT_DAILY_LIMIT');
do $$ begin
  if (select count(*) from public.ot_entries where active and total_minutes=180) <> 1 then
    raise exception 'Rejected replacement changed the saved entry';
  end if;
end $$;
rollback;
