-- BRANCHLINE DEVELOPMENT DRAFT ONLY. Do not run on production until authorized.
-- Confirmed by read-only metadata inspection 2026-11-19:
-- public.push_alert_schedule_runs: RLS OFF; anon/authenticated broad table rights.
-- public.claim_push_alert_schedules(date,time): SECURITY DEFINER, owned by postgres,
-- and EXECUTE granted to service_role only.
-- Generate a numbered migration using the Supabase CLI after staging verification.
begin;

do $verify$
declare
  v_fn oid;
begin
  if to_regclass('public.push_alert_schedule_runs') is null then
    raise exception 'Scheduler run table not found; schema differs from reviewed project.';
  end if;
  select p.oid into v_fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='claim_push_alert_schedules'
    and pg_get_function_identity_arguments(p.oid) =
      'p_today date, p_clock time without time zone';
  if v_fn is null then
    raise exception 'Expected server-only scheduler function missing or changed.';
  end if;
  if not exists(select 1 from pg_proc where oid=v_fn and prosecdef) then
    raise exception 'Expected SECURITY DEFINER claim function changed.';
  end if;
  if has_function_privilege('anon',v_fn,'EXECUTE')
    or has_function_privilege('authenticated',v_fn,'EXECUTE')
    or not has_function_privilege('service_role',v_fn,'EXECUTE') then
    raise exception 'Scheduler function permissions changed; review required.';
  end if;
end;
$verify$;

-- Client roles must not forge, clear, read or alter scheduler deduplication records.
revoke all on table public.push_alert_schedule_runs from anon, authenticated;
alter table public.push_alert_schedule_runs enable row level security;
-- Deliberately no anon/authenticated policies. Server-only scheduler uses service_role.

do $postcheck$
begin
  if not (select relrowsecurity from pg_class where oid='public.push_alert_schedule_runs'::regclass) then
    raise exception 'RLS failed to enable on scheduler run records.';
  end if;
  if has_table_privilege('anon','public.push_alert_schedule_runs','SELECT')
    or has_table_privilege('anon','public.push_alert_schedule_runs','INSERT')
    or has_table_privilege('authenticated','public.push_alert_schedule_runs','SELECT')
    or has_table_privilege('authenticated','public.push_alert_schedule_runs','DELETE') then
    raise exception 'Client grant remains after revoke.';
  end if;
end;
$postcheck$;

commit;
-- After staging apply: verify scheduler claim/duplicate behavior and Supabase advisors.
