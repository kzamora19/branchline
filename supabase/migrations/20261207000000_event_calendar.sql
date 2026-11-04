create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  branch_ids uuid[] not null default '{}',
  title text not null check (length(trim(title)) between 1 and 120),
  kind text not null check (kind in ('promotion','mall_sale','holiday','local_event','closure','other')),
  starts_on date not null check (isfinite(starts_on)),
  ends_on date not null check (isfinite(ends_on) and ends_on >= starts_on),
  closed boolean not null default false,
  notes text not null default '',
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (array_position(branch_ids,null) is null),
  check (kind <> 'closure' or closed)
);

create table public.forecast_event_adjustments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  event_ids uuid[] not null check (cardinality(event_ids)>0 and array_position(event_ids,null) is null),
  event_snapshot jsonb not null,
  category text not null check (category=lower(trim(category)) and category<>''),
  month date not null check (isfinite(month) and extract(day from month)=1),
  percent numeric not null check (percent>=-100 and percent not in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
  reason text not null check (length(trim(reason))>=15),
  approved_by uuid not null references public.profiles(id),
  approved_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id),
  revoked_at timestamptz,
  check ((revoked_by is null)=(revoked_at is null))
);
create unique index forecast_event_adjustment_active on public.forecast_event_adjustments(branch_id,category,month) where revoked_at is null;

create function public.can_manage_calendar_scope(p_dealer uuid,p_branches uuid[])
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select p_branches is not null and array_position(p_branches,null) is null
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.dealer_id=p_dealer
      and public.is_dealer_member(p_dealer) and p.role in ('admin','district_manager','manager')
      and (cardinality(p_branches)>0 or p.role in ('admin','district_manager')))
    and not exists(select 1 from unnest(p_branches) b(id)
      where not exists(select 1 from public.branches x where x.id=b.id and x.dealer_id=p_dealer and public.can_manage_branch(x.id)));
$$;

alter table public.calendar_events enable row level security;
alter table public.forecast_event_adjustments enable row level security;
create policy calendar_event_read on public.calendar_events for select to authenticated using (
  public.is_dealer_member(dealer_id) and (cardinality(branch_ids)=0
    or exists(select 1 from unnest(branch_ids) b(id) where public.can_access_branch(b.id)))
);
create policy forecast_event_adjustment_read on public.forecast_event_adjustments for select to authenticated using(public.can_access_branch(branch_id));
revoke all on public.calendar_events,public.forecast_event_adjustments from public,anon,authenticated;
grant select on public.calendar_events,public.forecast_event_adjustments to authenticated;

create function public.save_calendar_event(p_id uuid,p_branches uuid[],p_title text,p_kind text,p_from date,p_to date,p_closed boolean,p_notes text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_dealer uuid; v_old public.calendar_events%rowtype; v_id uuid;
begin
  select dealer_id into v_dealer from public.profiles where id=auth.uid() and active;
  if not public.can_manage_calendar_scope(v_dealer,p_branches) then raise exception 'Authorized management access to every selected branch is required; only admins and district managers can manage company-wide events.'; end if;
  if p_id is not null then
    select * into v_old from public.calendar_events where id=p_id for update;
    if not found or v_old.cancelled_at is not null or not public.can_manage_calendar_scope(v_old.dealer_id,v_old.branch_ids) then
      raise exception 'This event is unavailable or outside your management scope.'; end if;
  end if;
  if p_title is null or length(trim(p_title)) not between 1 and 120 or p_kind is null
    or p_kind not in ('promotion','mall_sale','holiday','local_event','closure','other')
    or p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<p_from or p_closed is null then
    raise exception 'Provide an event title, valid type and an inclusive start/end date range.'; end if;
  if p_id is null then
    insert into public.calendar_events(dealer_id,branch_ids,title,kind,starts_on,ends_on,closed,notes,created_by,updated_by)
    values(v_dealer,array(select distinct unnest(p_branches)),trim(p_title),p_kind,p_from,p_to,p_closed or p_kind='closure',coalesce(trim(p_notes),''),auth.uid(),auth.uid())
    returning id into v_id;
  else
    update public.calendar_events set branch_ids=array(select distinct unnest(p_branches)),title=trim(p_title),kind=p_kind,
      starts_on=p_from,ends_on=p_to,closed=p_closed or p_kind='closure',notes=coalesce(trim(p_notes),''),updated_by=auth.uid(),updated_at=now()
      where id=p_id returning id into v_id;
    update public.forecast_event_adjustments set revoked_at=now(),revoked_by=auth.uid() where p_id=any(event_ids) and revoked_at is null;
  end if;
  return v_id;
end $$;

create function public.cancel_calendar_event(p_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_event public.calendar_events%rowtype;
begin
  select * into v_event from public.calendar_events where id=p_id for update;
  if not found or not public.can_manage_calendar_scope(v_event.dealer_id,v_event.branch_ids) then raise exception 'Authorized event management access is required.'; end if;
  update public.calendar_events set cancelled_at=coalesce(cancelled_at,now()),updated_by=auth.uid(),updated_at=now() where id=p_id;
  update public.forecast_event_adjustments set revoked_at=now(),revoked_by=auth.uid() where p_id=any(event_ids) and revoked_at is null;
end $$;

create function public.approve_event_adjustment(p_branch uuid,p_events uuid[],p_category text,p_month date,p_percent numeric,p_reason text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_today date:=(now() at time zone 'Asia/Manila')::date; v_dealer uuid; v_snapshot jsonb; v_id uuid;
begin
  if not public.can_manage_branch(p_branch) then raise exception 'Assigned branch manager, district manager or administrator access is required.'; end if;
  select dealer_id into v_dealer from public.branches where id=p_branch for update;
  if p_month is null or not isfinite(p_month) or extract(day from p_month)<>1 or p_month<date_trunc('month',v_today)::date
    or p_month>(date_trunc('month',v_today)+interval '12 months')::date then raise exception 'Choose a current or future month within twelve months.'; end if;
  if p_percent is null or p_percent < -100 or p_percent in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    or p_reason is null or length(trim(p_reason))<15 then raise exception 'Enter a finite percentage of at least -100 and justify the combined event effect (at least 15 characters).'; end if;
  if p_events is null or cardinality(p_events)=0 or array_position(p_events,null) is not null then raise exception 'Select at least one event.'; end if;
  perform 1 from public.calendar_events where id=any(p_events) order by id for update;
  if (select count(distinct e.id) from public.calendar_events e where e.id=any(p_events) and e.dealer_id=v_dealer
    and e.cancelled_at is null and not e.closed and (cardinality(e.branch_ids)=0 or p_branch=any(e.branch_ids))
    and e.starts_on<(p_month+interval '1 month')::date and e.ends_on>=p_month) <> (select count(distinct x) from unnest(p_events) x) then
    raise exception 'Every selected event must be active, open for selling, applicable to this branch and overlap the forecast month.'; end if;
  if not exists(select 1 from public.products where branch_id=p_branch and active and lower(trim(category))=lower(trim(p_category))) then
    raise exception 'Choose an existing active product category in this branch.'; end if;
  select jsonb_agg(to_jsonb(e) order by e.id) into v_snapshot from public.calendar_events e where id=any(p_events);
  update public.forecast_event_adjustments set revoked_at=now(),revoked_by=auth.uid()
    where branch_id=p_branch and category=lower(trim(p_category)) and month=p_month and revoked_at is null;
  insert into public.forecast_event_adjustments(branch_id,event_ids,event_snapshot,category,month,percent,reason,approved_by)
    values(p_branch,array(select distinct unnest(p_events)),v_snapshot,lower(trim(p_category)),p_month,p_percent,trim(p_reason),auth.uid()) returning id into v_id;
  return v_id;
end $$;

create function public.revoke_event_adjustment(p_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_branch uuid;
begin
  select branch_id into v_branch from public.forecast_event_adjustments where id=p_id;
  if v_branch is null or not public.can_manage_branch(v_branch) then raise exception 'Authorized branch approval access is required.'; end if;
  update public.forecast_event_adjustments set revoked_at=now(),revoked_by=auth.uid() where id=p_id and revoked_at is null;
end $$;
revoke all on function public.can_manage_calendar_scope(uuid,uuid[]),public.save_calendar_event(uuid,uuid[],text,text,date,date,boolean,text),
  public.cancel_calendar_event(uuid),public.approve_event_adjustment(uuid,uuid[],text,date,numeric,text),public.revoke_event_adjustment(uuid) from public,anon;
grant execute on function public.can_manage_calendar_scope(uuid,uuid[]),public.save_calendar_event(uuid,uuid[],text,text,date,date,boolean,text),
  public.cancel_calendar_event(uuid),public.approve_event_adjustment(uuid,uuid[],text,date,numeric,text),public.revoke_event_adjustment(uuid) to authenticated;
