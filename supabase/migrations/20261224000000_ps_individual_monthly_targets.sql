-- STAGED ONLY: DO NOT APPLY TO PRODUCTION BEFORE THE COORDINATED RELEASE.
-- Explicit individual monthly sales targets. Never infer an "individual" goal
-- from total branch targets or divide a branch goal without clear labeling.
create table if not exists public.ps_monthly_targets (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  ps_id uuid not null references public.profiles(id) on delete restrict,
  month date not null check (extract(day from month) = 1),
  amount numeric(16,2) not null check (amount >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, ps_id, month)
);
create index if not exists ps_monthly_targets_scope_idx
  on public.ps_monthly_targets (dealer_id, branch_id, month);
alter table public.ps_monthly_targets enable row level security;
revoke all on table public.ps_monthly_targets from public, anon, authenticated;
grant select, insert, update, delete on table public.ps_monthly_targets to authenticated;
grant all on table public.ps_monthly_targets to service_role;

-- A member may see their own goal; managers only see assigned branches.
drop policy if exists ps_monthly_targets_read on public.ps_monthly_targets;
create policy ps_monthly_targets_read
  on public.ps_monthly_targets for select to authenticated
  using (
    is_dealer_member(dealer_id)
    and (ps_id = (select auth.uid()) or can_manage_branch(branch_id))
  );

-- Goals are manager-controlled. Restrict the target to a real PS currently
-- assigned to the exact dealer and branch in the new target row.
drop policy if exists ps_monthly_targets_insert on public.ps_monthly_targets;
create policy ps_monthly_targets_insert
  on public.ps_monthly_targets for insert to authenticated
  with check (
    is_dealer_member(dealer_id) and can_manage_branch(branch_id)
    and exists (
      select 1 from public.profiles p
      where p.id = ps_id and p.dealer_id = dealer_id
        and p.branch_id = branch_id and p.role = 'ps' and p.active = true
    )
  );
drop policy if exists ps_monthly_targets_update on public.ps_monthly_targets;
create policy ps_monthly_targets_update
  on public.ps_monthly_targets for update to authenticated
  using (is_dealer_member(dealer_id) and can_manage_branch(branch_id))
  with check (
    is_dealer_member(dealer_id) and can_manage_branch(branch_id)
    and exists (
      select 1 from public.profiles p
      where p.id = ps_id and p.dealer_id = dealer_id
        and p.branch_id = branch_id and p.role = 'ps' and p.active = true
    )
  );
drop policy if exists ps_monthly_targets_delete on public.ps_monthly_targets;
create policy ps_monthly_targets_delete
  on public.ps_monthly_targets for delete to authenticated
  using (is_dealer_member(dealer_id) and can_manage_branch(branch_id));

comment on table public.ps_monthly_targets is
  'Explicit PS monthly targets, configured by authorized branch managers. No production migration before coordinated release.';
