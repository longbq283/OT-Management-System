-- Chạy trong SQL Editor của dự án trước khi áp dụng migration. Kết quả chỉ chứa metadata.
select table_name, column_name, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('ot_profiles','ot_projects','ot_project_members','ot_periods')
order by table_name, ordinal_position;

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('ot_profiles','ot_projects','ot_project_members','ot_periods')
order by tablename, policyname;

select c.relname, c.relrowsecurity, con.conname, pg_get_constraintdef(con.oid)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_constraint con on con.conrelid = c.oid
where n.nspname = 'public' and c.relname in ('ot_profiles','ot_projects','ot_project_members','ot_periods');

select p.oid::regprocedure, p.prosecdef, p.provolatile
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('ot_require_bidv_email','ot_handle_auth_user','ot_is_admin','ot_can_access_project');
