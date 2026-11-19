-- Narrow server-only scheduler hardening.
-- Expected setup: claim_push_alert_schedules is SECURITY DEFINER, owned by postgres,
-- and executable by service_role only. This does not disable scheduled alerts.
do $$
declare
  f oid := to_regprocedure('public.claim_push_alert_schedules(date,time without time zone)');
begin
  if to_regclass('public.push_alert_schedule_runs') is null then
    raise exception 'Scheduler runs table does not exist';
  end if;
  if f is null or not exists (
    select 1 from pg_proc
    where oid=f and prosecdef and pg_get_userbyid(proowner)='postgres'
  ) then
    raise exception 'Scheduler function privileges/owner changed; stop rollout';
  end if;
  if has_function_privilege('anon', f, 'EXECUTE')
    or has_function_privilege('authenticated', f, 'EXECUTE')
    or not has_function_privilege('service_role', f, 'EXECUTE') then
    raise exception 'Scheduler RPC is not service-role only';
  end if;
end $$;

revoke all on table public.push_alert_schedule_runs from public, anon, authenticated;
alter table public.push_alert_schedule_runs enable row level security;

do $$
begin
  if not (select relrowsecurity from pg_class where oid='public.push_alert_schedule_runs'::regclass)
    or has_table_privilege('anon','public.push_alert_schedule_runs','SELECT')
    or has_table_privilege('anon','public.push_alert_schedule_runs','INSERT')
    or has_table_privilege('authenticated','public.push_alert_schedule_runs','SELECT')
    or has_table_privilege('authenticated','public.push_alert_schedule_runs','DELETE')
    or not has_table_privilege('service_role','public.push_alert_schedule_runs','INSERT') then
    raise exception 'Post-migration scheduler-run privilege verification failed';
  end if;
end $$;