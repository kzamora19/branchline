-- Applied to the Branchline Supabase project on 2026-11-21.
-- Migration history version: 20261121025917.
-- Preserve all existing identity, permissions, test-profile filters and sales scope.
-- Sole formula change: monthly store target / eligible active PS (no 50k rounding).

CREATE OR REPLACE FUNCTION public.get_ps_dashboard(p_month date DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date)
 RETURNS TABLE(own_sales numeric, branch_sales numeric, branch_target numeric, personal_target numeric, ps_rank bigint, ps_count bigint, team_share numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_dealer_id uuid;
  v_branch_id uuid;
  v_month date := date_trunc('month', p_month)::date;
begin
  if p_month is null then
    raise exception 'A performance month is required.';
  end if;
  select p.dealer_id, p.branch_id into v_dealer_id, v_branch_id
  from public.profiles p where p.id = v_actor and p.role = 'ps' and p.active;
  if not found or not public.is_dealer_member(v_dealer_id) then
    raise exception 'An active Product Specialist account is required.';
  end if;
  return query
  with active_ps as (
    select p.id from public.profiles p
    where p.dealer_id = v_dealer_id and p.branch_id = v_branch_id and p.role = 'ps' and p.active
      and not public.is_test_profile(p.full_name, p.login_id)
  ),
  ps_totals as (
    select a.id as ps_id, coalesce(sum(sl.selling_price * sl.quantity), 0)::numeric as total
    from active_ps a
    left join public.sales s
      on s.ps_id = a.id and s.branch_id = v_branch_id and s.dealer_id = v_dealer_id
      and s.sold_on >= v_month and s.sold_on < (v_month + interval '1 month')
      and not public.is_test_sale(s.customer_name, s.invoice_number)
    left join public.sale_lines sl on sl.sale_id = s.id
    group by a.id
  ),
  ranked as (
    select pt.ps_id, pt.total, row_number() over (order by pt.total desc, pt.ps_id) as position from ps_totals pt
  ),
  stats as (
    select coalesce(max(r.total) filter (where r.ps_id = v_actor), 0)::numeric as own_total,
      coalesce(sum(r.total), 0)::numeric as team_total,
      count(*)::bigint as total_ps,
      coalesce(max(r.position) filter (where r.ps_id = v_actor), 0)::bigint as own_rank
    from ranked r
  ),
  targets as (
    select coalesce(mt.amount, 0)::numeric as branch_goal
    from (select 1) seed
    left join public.monthly_targets mt
      on mt.dealer_id = v_dealer_id and mt.branch_id = v_branch_id and mt.month = v_month
  )
  select stats.own_total, stats.team_total, targets.branch_goal,
    case when stats.total_ps = 0 then 0 else (targets.branch_goal / stats.total_ps) end::numeric,
    stats.own_rank, stats.total_ps,
    case when stats.team_total = 0 then 0 else stats.own_total / stats.team_total * 100 end::numeric
  from stats cross join targets;
end;
$function$
;
