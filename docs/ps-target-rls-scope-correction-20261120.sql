-- PROPOSED SECURITY PATCH — NOT APPLIED TO LIVE SUPABASE.
-- Correct the correlated PS lookup in the already-deployed target policies.
-- The previous unqualified "dealer_id" and "branch_id" inside the subquery
-- can resolve to profiles p instead of the outer target row.
-- This script is for review and later migration generation/apply.
begin;

drop policy if exists ps_monthly_targets_insert on public.ps_monthly_targets;
create policy ps_monthly_targets_insert on public.ps_monthly_targets
  for insert to authenticated
  with check (
    public.is_dealer_member(ps_monthly_targets.dealer_id)
    and public.can_manage_branch(ps_monthly_targets.branch_id)
    and exists (
      select 1 from public.profiles target_ps
      where target_ps.id = ps_monthly_targets.ps_id
        and target_ps.dealer_id = ps_monthly_targets.dealer_id
        and target_ps.branch_id = ps_monthly_targets.branch_id
        and target_ps.role = 'ps'
        and target_ps.active = true
    )
  );

drop policy if exists ps_monthly_targets_update on public.ps_monthly_targets;
create policy ps_monthly_targets_update on public.ps_monthly_targets
  for update to authenticated
  using (
    public.is_dealer_member(ps_monthly_targets.dealer_id)
    and public.can_manage_branch(ps_monthly_targets.branch_id)
  )
  with check (
    public.is_dealer_member(ps_monthly_targets.dealer_id)
    and public.can_manage_branch(ps_monthly_targets.branch_id)
    and exists (
      select 1 from public.profiles target_ps
      where target_ps.id = ps_monthly_targets.ps_id
        and target_ps.dealer_id = ps_monthly_targets.dealer_id
        and target_ps.branch_id = ps_monthly_targets.branch_id
        and target_ps.role = 'ps'
        and target_ps.active = true
    )
  );

commit;

-- Post-apply verification (read-only):
-- SELECT polname, pg_get_expr(polwithcheck,polrelid)
-- FROM pg_policy
-- WHERE polrelid='public.ps_monthly_targets'::regclass
-- AND polname IN ('ps_monthly_targets_insert','ps_monthly_targets_update');
