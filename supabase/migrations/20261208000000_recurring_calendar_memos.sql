create function public.calendar_occurs_between(p_start date,p_end date,p_weekdays integer[],p_from date,p_to date)
returns boolean language sql immutable set search_path=pg_catalog,public as $$
  select exists(select 1 from generate_series(0,6) n
    where greatest(p_start,p_from)+n <= least(p_end,p_to)
      and (cardinality(p_weekdays)=0 or extract(dow from greatest(p_start,p_from)+n)::integer=any(p_weekdays)));
$$;

create function public.valid_calendar_memo_links(p_links jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog,public as $$
declare v_link jsonb;
begin
  if p_links is null or jsonb_typeof(p_links)<>'array' then return false; end if;
  for v_link in select value from jsonb_array_elements(p_links) loop
    if jsonb_typeof(v_link)<>'object' or jsonb_typeof(v_link->'label') is distinct from 'string'
      or jsonb_typeof(v_link->'url') is distinct from 'string' then return false; end if;
    if length(trim(v_link->>'label')) not between 1 and 120
      or (v_link->>'url') !~ '^https?://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]+)?([/?#][^[:space:]<>"\\]*)?$' then return false; end if;
  end loop;
  return true;
end $$;

alter table public.calendar_events
  add column weekdays integer[] not null default '{}'
    check (weekdays <@ array[0,1,2,3,4,5,6] and array_position(weekdays,null) is null),
  add column campaign_type text not null default '' check (length(trim(campaign_type))<=120),
  add column memo_links jsonb not null default '[]'::jsonb check(public.valid_calendar_memo_links(memo_links)),
  add constraint calendar_event_has_occurrence check(public.calendar_occurs_between(starts_on,ends_on,weekdays,starts_on,ends_on));

create function public.save_calendar_campaign(p_id uuid,p_branches uuid[],p_title text,p_kind text,p_from date,p_to date,p_closed boolean,p_notes text,
  p_weekdays integer[],p_campaign_type text,p_memo_links jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid; v_old public.calendar_events%rowtype;
begin
  if p_weekdays is null or not p_weekdays <@ array[0,1,2,3,4,5,6] or array_position(p_weekdays,null) is not null then
    raise exception 'Event calendar: choose valid weekdays (Sunday 0 through Saturday 6).'; end if;
  if p_campaign_type is null or length(trim(p_campaign_type))>120 then raise exception 'Event calendar: campaign type must be at most 120 characters.'; end if;
  if not public.valid_calendar_memo_links(p_memo_links) then
    raise exception 'Event calendar: each memo needs a name (1-120 characters) and a valid http/https link without credentials or whitespace.'; end if;
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<p_from
    or not public.calendar_occurs_between(p_from,p_to,p_weekdays,p_from,p_to) then
    raise exception 'Event calendar: the date range must include at least one selected weekday.'; end if;
  -- The existing RPC enforces old/new scope, locks edits and revokes their approvals.
  if p_id is not null then
    select * into v_old from public.calendar_events where id=p_id for update;
    if not found or v_old.cancelled_at is not null or not public.can_manage_calendar_scope(v_old.dealer_id,v_old.branch_ids) then
      raise exception 'This event is unavailable or outside your management scope.'; end if;
    update public.calendar_events set weekdays='{}' where id=p_id;
  end if;
  v_id:=public.save_calendar_event(p_id,p_branches,p_title,p_kind,p_from,p_to,p_closed,p_notes);
  update public.calendar_events set weekdays=array(select distinct day from unnest(p_weekdays) day order by day),
    campaign_type=trim(p_campaign_type),memo_links=p_memo_links where id=v_id;
  return v_id;
end $$;

create function public.check_calendar_approval_occurrences()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.calendar_events e where e.id=any(new.event_ids)
    and not public.calendar_occurs_between(e.starts_on,e.ends_on,e.weekdays,new.month,(new.month+interval '1 month')::date-1)) then
    raise exception 'Every selected event must have a scheduled occurrence in the forecast month.'; end if;
  return new;
end $$;
create trigger calendar_approval_occurrences before insert on public.forecast_event_adjustments
  for each row execute function public.check_calendar_approval_occurrences();

revoke all on function public.calendar_occurs_between(date,date,integer[],date,date),public.valid_calendar_memo_links(jsonb),
  public.check_calendar_approval_occurrences(),public.save_calendar_campaign(uuid,uuid[],text,text,date,date,boolean,text,integer[],text,jsonb) from public,anon;
grant execute on function public.calendar_occurs_between(date,date,integer[],date,date),public.valid_calendar_memo_links(jsonb),
  public.save_calendar_campaign(uuid,uuid[],text,text,date,date,boolean,text,integer[],text,jsonb) to authenticated;
