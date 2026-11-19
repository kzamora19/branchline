-- Align existing approved hourly-precision schedules with the Manila clock.
-- Existing cron invoked pace-push only at 10:00 Asia/Manila even though
-- active administrator-chosen slots are 07:00, 16:00 and 19:00.
-- No schedules, subscriptions or messages are created by this change.
do $guard$
declare
  v_job_id bigint;
begin
  if (select count(*) from cron.job where jobname='pace-push-daily') <> 1 then
    raise exception 'Expected exactly one pace-push-daily cron job';
  end if;
  select jobid into v_job_id
  from cron.job where jobname='pace-push-daily' and active and schedule='0 2 * * *';
  if v_job_id is null then
    raise exception 'Existing pace-push cron schedule changed; review before updating';
  end if;
  if not exists(select 1 from public.push_alert_schedules where active) then
    raise exception 'No approved active schedule exists; leave scheduler unchanged';
  end if;
  if exists (
    select 1 from public.push_alert_schedules where active
    and (extract(minute from send_at) <> 0
      or send_at < time '07:00' or send_at > time '20:00')
  ) then
    raise exception 'Unsupported active schedule minute or quiet-hours boundary';
  end if;
  if not exists(
    select 1 from pg_proc p
    where p.oid = to_regprocedure('public.claim_push_alert_schedules(date,time without time zone)')
      and p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
  ) or has_function_privilege('anon',
    'public.claim_push_alert_schedules(date,time without time zone)', 'EXECUTE')
    or has_function_privilege('authenticated',
    'public.claim_push_alert_schedules(date,time without time zone)', 'EXECUTE')
  then
    raise exception 'Scheduler claim RPC must remain postgres-owned and server-only';
  end if;
  -- The Edge function reads its current Asia/Manila hour; zero-minute
  -- hourly cron catches each scheduled hour without duplicating sends.
  perform cron.alter_job(job_id := v_job_id, schedule := '0 * * * *');
  if not exists(select 1 from cron.job where jobid=v_job_id and active
      and schedule='0 * * * *') then
    raise exception 'Scheduler verification failed';
  end if;
end
$guard$;
