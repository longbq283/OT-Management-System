-- Trong Supabase SQL Editor, thay hai giá trị bên dưới bằng đúng email BIDV
-- và mã 8 chữ số của một tài khoản cụ thể đã nhập OTP thật.
begin;

do $$
declare
  target_email constant text := 'THAY_BANG_EMAIL_BIDV_DA_XAC_NHAN';
  target_code constant text := 'THAY_BANG_MA_8_CHU_SO';
  target_id uuid;
  assigned_code text;
begin
  if target_email !~ '^[^@[:space:]]+@bidv[.]com[.]vn$' or target_code !~ '^[0-9]{8}$' then
    raise exception 'Điền đúng email BIDV và mã cán bộ 8 chữ số trước khi chạy.';
  end if;

  lock table public.ot_profiles in share row exclusive mode;
  if exists (select from public.ot_profiles where role = 'admin' and status = 'active') then
    raise exception 'Đã có quản trị viên hoạt động.';
  end if;

  select p.id, p.employee_code into strict target_id, assigned_code
  from auth.users u join public.ot_profiles p on p.id = u.id
  where lower(u.email) = lower(target_email) and lower(p.email) = lower(target_email)
    and u.email_confirmed_at is not null
  for update of p;
  if assigned_code is not null and assigned_code <> target_code then
    raise exception 'Tài khoản đã được gán mã khác. Kiểm tra hồ sơ trước khi tiếp tục.';
  end if;

  update public.ot_profiles
  set role = 'admin', status = 'active', employee_code = target_code, updated_at = now()
  where id = target_id;

  insert into public.ot_audit_events(actor_id, action, detail)
  values (target_id, 'first_admin_bootstrap', jsonb_build_object('user_id', target_id, 'source', 'sql_editor'));
end $$;

commit;
