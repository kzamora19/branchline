create or replace function public.branch_sale_customer_suggestions(p_branch uuid, p_query text)
returns table (customer_name text, barangay text, city text, sold_on date)
language sql
stable
security definer
set search_path = ''
as $function$
  with input as (
    select lower(regexp_replace(btrim(coalesce(p_query, '')), '[’'']', '', 'g')) as needle
  ), customers as (
    select btrim(s.customer_name) as name, coalesce(btrim(s.barangay), '') as barangay,
      coalesce(btrim(s.city), '') as city, s.sold_on,
      lower(regexp_replace(btrim(s.customer_name), '[’'']', '', 'g')) as name_key
    from public.sales s
    join public.branches b on b.id = s.branch_id and b.dealer_id = s.dealer_id
    left join public.profiles ps on ps.id = s.ps_id
    cross join input i
    where b.id = p_branch
      and (public.is_active_ps_for_branch(p_branch) or public.can_manage_branch(p_branch))
      and length(i.needle) between 2 and 100
      and strpos(lower(regexp_replace(btrim(s.customer_name), '[’'']', '', 'g')), i.needle) > 0
      and s.invoice_number !~* '^(RET-|[[:space:]]*test([^a-z]|$))'
      and s.customer_name !~* '^[[:space:]]*test([^a-z]|$)'
      and coalesce(ps.full_name, '') !~* '^[[:space:]]*test([^a-z]|$)'
      and coalesce(ps.login_id, '') !~* '^[[:space:]]*test([^a-z]|$)'
  ), newest as (
    select distinct on (name_key, lower(c.barangay), lower(c.city)) c.*
    from customers c
    order by name_key, lower(c.barangay), lower(c.city), c.sold_on desc, c.name
  )
  select n.name, n.barangay, n.city, n.sold_on
  from newest n cross join input i
  order by (n.name_key = i.needle) desc, (n.barangay <> '' and n.city <> '') desc, n.sold_on desc, n.name
  limit 20;
$function$;

revoke all on function public.branch_sale_customer_suggestions(uuid, text) from public, anon;
grant execute on function public.branch_sale_customer_suggestions(uuid, text) to authenticated;
notify pgrst, 'reload schema';
