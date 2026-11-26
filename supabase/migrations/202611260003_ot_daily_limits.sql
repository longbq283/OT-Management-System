begin;

alter table public.ot_period_calendars add column limit_minutes jsonb
  check (limit_minutes is null or (jsonb_typeof(limit_minutes) = 'array'
    and jsonb_array_length(limit_minutes) = jsonb_array_length(days)));

create function public.ot_set_calendar_with_limits(p_project uuid, p_year integer, p_month integer,
  p_expected_revision bigint, p_days jsonb, p_limit_minutes jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  new_revision bigint;
  item jsonb;
begin
  perform ot_private.require_project_admin(p_project);
  if jsonb_typeof(p_days) is distinct from 'array' or jsonb_typeof(p_limit_minutes) is distinct from 'array' then
    raise exception 'OT_LIMITS_INVALID';
  end if;
  if jsonb_array_length(p_limit_minutes) not between 28 and 31 or
    jsonb_array_length(p_limit_minutes) <> jsonb_array_length(p_days) then raise exception 'OT_LIMITS_INVALID'; end if;

  for item in select value from jsonb_array_elements(p_limit_minutes)
  loop
    if jsonb_typeof(item) <> 'number' or item::text !~ '^[0-9]{1,4}$' then raise exception 'OT_LIMITS_INVALID'; end if;
    if item::text::integer > 1440 then raise exception 'OT_LIMITS_INVALID'; end if;
  end loop;

  -- The existing RPC validates the dates and locks the period through the end of this transaction.
  new_revision := public.ot_set_calendar(p_project, p_year, p_month, p_expected_revision, p_days);
  update public.ot_period_calendars set limit_minutes = p_limit_minutes
  where project_id = p_project and year = p_year and month = p_month;
  perform ot_private.audit('period_limits_saved',
    jsonb_build_object('project_id', p_project, 'year', p_year, 'month', p_month, 'revision', new_revision));
  return new_revision;
end;
$$;

revoke all on function public.ot_set_calendar_with_limits(uuid, integer, integer, bigint, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.ot_set_calendar_with_limits(uuid, integer, integer, bigint, jsonb, jsonb) to authenticated;

create function ot_private.enforce_daily_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  limits jsonb;
  types jsonb;
  detail jsonb;
  day_index integer;
  minutes_limit integer;
begin
  -- Historical aggregate imports from the system admin have no dates to compare.
  if new.source <> 'daily' then return new; end if;
  select c.days, c.limit_minutes into types, limits from public.ot_period_calendars c
  where c.project_id = new.project_id and c.year = new.year and c.month = new.month;
  if not found then raise exception 'OT_CALENDAR_REQUIRED'; end if;

  for detail in select value from jsonb_array_elements(new.days)
  loop
    day_index := extract(day from (detail->>'date')::date)::integer - 1;
    minutes_limit := coalesce((limits->>day_index)::integer, case when types->>day_index = 'NT' then 120 else 240 end);
    if (detail->>'minutes')::integer > minutes_limit then
      raise exception using message = 'OT_DAILY_LIMIT',
        detail = jsonb_build_object('date', detail->>'date', 'minutes', minutes_limit)::text;
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function ot_private.enforce_daily_limit() from public, anon, authenticated;
create trigger ot_daily_limit before insert on public.ot_entries
for each row execute function ot_private.enforce_daily_limit();

notify pgrst, 'reload schema';
commit;
