create table public.forecast_locations (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  city text not null check (length(trim(city)) > 0),
  province text not null check (length(trim(province)) > 0),
  latitude numeric not null check (latitude between -90 and 90),
  longitude numeric not null check (longitude between -180 and 180),
  verified_by uuid not null references public.profiles(id),
  verified_at timestamptz not null default now()
);

create table public.forecast_climate_evidence (
  id uuid primary key default gen_random_uuid(),
  source_url text not null check (source_url = 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml'),
  issued_on date not null,
  phase text not null check (phase in ('El Nino', 'La Nina', 'Neutral', 'Watch')),
  checked_at timestamptz not null default now(),
  valid_until date not null,
  unique (source_url, issued_on),
  check (valid_until = issued_on + 45)
);

create table public.forecast_monitor_status (
  id boolean primary key default true check (id),
  checked_at timestamptz not null,
  error text,
  local_weather_status text not null default 'Unavailable: no verified official local forecast integration.'
);

create table public.forecast_adjustments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  evidence_id uuid not null references public.forecast_climate_evidence(id),
  category text not null check (category = lower(trim(category)) and category <> ''),
  month date not null check (extract(day from month) = 1),
  percent numeric not null check (percent >= -100 and percent not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  reason text not null check (length(trim(reason)) >= 15),
  approved_by uuid not null references public.profiles(id),
  approved_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id),
  revoked_at timestamptz,
  check ((revoked_by is null) = (revoked_at is null))
);
create unique index forecast_adjustment_active on public.forecast_adjustments(branch_id, category, month) where revoked_at is null;

alter table public.forecast_locations enable row level security;
alter table public.forecast_climate_evidence enable row level security;
alter table public.forecast_monitor_status enable row level security;
alter table public.forecast_adjustments enable row level security;
create policy forecast_location_read on public.forecast_locations for select to authenticated using (public.can_access_branch(branch_id));
create policy forecast_adjustment_read on public.forecast_adjustments for select to authenticated using (public.can_access_branch(branch_id));
create policy forecast_evidence_read on public.forecast_climate_evidence for select to authenticated using (
  exists(select 1 from public.profiles where id = (select auth.uid()) and active and public.is_dealer_member(dealer_id))
);
create policy forecast_monitor_read on public.forecast_monitor_status for select to authenticated using (
  exists(select 1 from public.profiles where id = (select auth.uid()) and active and public.is_dealer_member(dealer_id))
);
revoke all on public.forecast_locations, public.forecast_climate_evidence, public.forecast_monitor_status, public.forecast_adjustments from public, anon, authenticated;
grant select on public.forecast_locations, public.forecast_climate_evidence, public.forecast_monitor_status, public.forecast_adjustments to authenticated;
grant all on public.forecast_climate_evidence, public.forecast_monitor_status to service_role;

create function public.save_forecast_location(p_branch uuid, p_city text, p_province text, p_latitude numeric, p_longitude numeric)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and active and role = 'admin')
    or not public.can_access_branch(p_branch) then raise exception 'Administrator access to this branch is required.'; end if;
  if p_city is null or p_province is null or p_latitude is null or p_longitude is null
    or p_latitude = 'NaN'::numeric or p_longitude = 'NaN'::numeric then raise exception 'Provide a verified city, province and valid coordinates.'; end if;
  insert into public.forecast_locations(branch_id,city,province,latitude,longitude,verified_by)
  values(p_branch,trim(p_city),trim(p_province),p_latitude,p_longitude,auth.uid())
  on conflict(branch_id) do update set city=excluded.city, province=excluded.province,
    latitude=excluded.latitude, longitude=excluded.longitude, verified_by=excluded.verified_by, verified_at=now();
  update public.forecast_adjustments set revoked_at=now(),revoked_by=auth.uid() where branch_id=p_branch and revoked_at is null;
end $$;

create function public.approve_forecast_adjustment(p_branch uuid, p_evidence uuid, p_category text, p_month date, p_percent numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid; v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if not public.can_manage_branch(p_branch) then raise exception 'Assigned branch manager, district manager or administrator access is required.'; end if;
  perform 1 from public.forecast_locations where branch_id=p_branch for update;
  if not found then raise exception 'An administrator must verify this branch location first.'; end if;
  if not exists(select 1 from public.forecast_climate_evidence where id=p_evidence and issued_on<=v_today and valid_until>=v_today) then
    raise exception 'Fresh official climate evidence is required.'; end if;
  if not exists(select 1 from public.forecast_monitor_status where error is null and checked_at>=now()-interval '48 hours') then
    raise exception 'The official-source monitor must have a successful check within 48 hours.'; end if;
  if p_month is null or p_month < date_trunc('month',v_today)::date or p_month > (date_trunc('month',v_today) + interval '12 months')::date
    or extract(day from p_month) <> 1 then raise exception 'Choose a current or future forecast month within twelve months.'; end if;
  if p_percent is null or p_percent < -100 or p_percent in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then
    raise exception 'Enter a finite adjustment of at least -100 percent.'; end if;
  if p_reason is null or length(trim(p_reason))<15 then raise exception 'Explain the local evidence and numerical adjustment (at least 15 characters).'; end if;
  if not exists(select 1 from public.products where branch_id=p_branch and active and lower(trim(category))=lower(trim(p_category))) then
    raise exception 'Choose an existing active product category in this branch.'; end if;
  update public.forecast_adjustments set revoked_at=now(),revoked_by=auth.uid()
    where branch_id=p_branch and category=lower(trim(p_category)) and month=p_month and revoked_at is null;
  insert into public.forecast_adjustments(branch_id,evidence_id,category,month,percent,reason,approved_by)
  values(p_branch,p_evidence,lower(trim(p_category)),p_month,p_percent,trim(p_reason),auth.uid()) returning id into v_id;
  return v_id;
end $$;

create function public.revoke_forecast_adjustment(p_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_branch uuid;
begin
  select branch_id into v_branch from public.forecast_adjustments where id=p_id;
  if v_branch is null or not public.can_manage_branch(v_branch) then raise exception 'Authorized branch approval access is required.'; end if;
  update public.forecast_adjustments set revoked_at=now(),revoked_by=auth.uid() where id=p_id and revoked_at is null;
end $$;
revoke all on function public.save_forecast_location(uuid,text,text,numeric,numeric), public.approve_forecast_adjustment(uuid,uuid,text,date,numeric,text), public.revoke_forecast_adjustment(uuid) from public, anon;
grant execute on function public.save_forecast_location(uuid,text,text,numeric,numeric), public.approve_forecast_adjustment(uuid,uuid,text,date,numeric,text), public.revoke_forecast_adjustment(uuid) to authenticated;
notify pgrst, 'reload schema';
