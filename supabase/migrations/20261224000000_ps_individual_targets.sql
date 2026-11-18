-- Development-only PS target overrides. Apply after the existing Branchline migrations.
-- Manager/admin writes are restricted to branches the caller can manage.
begin;

create table if not exists public.ps_monthly_targets (
  ps_id uuid not null references public.profiles(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  dealer_id uuid not null,
  month date not null,
  amount numeric(16,2) not null check (amount >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (ps_id, month),
  constraint ps_monthly_targets_month_first check
    (month = date_trunc('month', month::timestamp)::date)
);
create index if not exists ps_monthly_targets_branch_period_idx
  on public.ps_monthly_targets(branch_id, month);

alter table public.ps_monthly_targets enable row level security;
revoke all on public.ps_monthly_targets from public, anon, authenticated;
grant select on public.ps_monthly_targets to authenticated;

drop policy if exists ps_monthly_targets_read on public.ps_monthly_targets;
create policy ps_monthly_targets_read on public.ps_monthly_targets
  for select to authenticated using (
    (select auth.uid()) = ps_id or public.can_manage_branch(branch_id)
  );

create table if not exists public.ps_monthly_target_audit (
  id bigint generated always as identity primary key,
  dealer_id uuid not null,
  branch_id uuid not null,
  ps_id uuid not null,
  month date not null,
  previous_amount numeric(16,2),
  new_amount numeric(16,2) not null,
  edited_by uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists ps_monthly_target_audit_branch_date
  on public.ps_monthly_target_audit(branch_id,created_at desc);
alter table public.ps_monthly_target_audit enable row level security;
revoke all on public.ps_monthly_target_audit from public,anon,authenticated;
grant select on public.ps_monthly_target_audit to authenticated;
drop policy if exists ps_target_audit_manager_read on public.ps_monthly_target_audit;
create policy ps_target_audit_manager_read on public.ps_monthly_target_audit
  for select to authenticated using (public.can_manage_branch(branch_id));

create or replace function public.set_ps_monthly_target(
  p_ps_id uuid, p_month date, p_amount numeric
) returns public.ps_monthly_targets
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles%rowtype;
  v_ps public.profiles%rowtype;
  v_previous numeric(16,2);
  v_result public.ps_monthly_targets%rowtype;
begin
  select * into v_actor from public.profiles
    where id = auth.uid() and active = true;
  if v_actor.id is null or v_actor.role not in ('manager','district_manager','admin') then
    raise exception 'Only active branch or district managers and administrators can set PS targets.';
  end if;
  select * into v_ps from public.profiles where id = p_ps_id for update;
  if v_ps.id is null or v_ps.role <> 'ps' or v_ps.active is distinct from true
    or v_ps.branch_id is null or v_ps.dealer_id <> v_actor.dealer_id
    or not public.can_manage_branch(v_ps.branch_id) then
    raise exception 'PS target is outside the authorized branch scope.';
  end if;
  if p_month is null or p_month <> date_trunc('month',p_month::timestamp)::date then
    raise exception 'Month must be the first calendar day.';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 1000000000000 then
    raise exception 'Target amount is invalid.';
  end if;

  select amount into v_previous from public.ps_monthly_targets
    where ps_id = v_ps.id and month = p_month for update;
  insert into public.ps_monthly_targets
    (ps_id,branch_id,dealer_id,month,amount,updated_by,updated_at)
  values (v_ps.id,v_ps.branch_id,v_ps.dealer_id,p_month,p_amount,auth.uid(),now())
  on conflict (ps_id,month) do update set
    branch_id=excluded.branch_id,
    dealer_id=excluded.dealer_id,
    amount=excluded.amount,
    updated_by=excluded.updated_by,
    updated_at=now()
  returning * into v_result;

  if v_previous is distinct from p_amount then
    insert into public.ps_monthly_target_audit
      (dealer_id,branch_id,ps_id,month,previous_amount,new_amount,edited_by)
    values (v_ps.dealer_id,v_ps.branch_id,v_ps.id,p_month,v_previous,p_amount,auth.uid());
  end if;
  return v_result;
end;
$$;
revoke all on function public.set_ps_monthly_target(uuid,date,numeric)
  from public,anon,authenticated;
grant execute on function public.set_ps_monthly_target(uuid,date,numeric)
  to authenticated;

notify pgrst, 'reload schema';
commit;
