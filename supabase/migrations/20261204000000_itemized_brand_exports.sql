-- Add export identity and serials without changing existing RPC signatures or price privacy.
create or replace function public.export_brand_branch_sales_v2()
returns table (
  line_id uuid, sold_on date, invoice_number text, ps_name text,
  brand text, category text, sub_category text, model_description text,
  quantity integer, branch_id uuid, ps_id uuid, salesperson_code text,
  barcode text, serial_numbers text[]
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with allowed as materialized (
    select * from public.export_brand_branch_sales()
  ),
  offsets as (
    select l.id, coalesce(sum(l.quantity) over (
      partition by l.sale_id, l.barcode order by l.id
      rows between unbounded preceding and 1 preceding
    ), 0)::integer as first_unit
    from public.sale_lines l
    where l.sale_id in (select sl.sale_id from public.sale_lines sl join allowed a on a.line_id = sl.id)
  )
  select a.line_id, a.sold_on, a.invoice_number, a.ps_name,
    a.brand, a.category, a.sub_category, a.model_description, a.quantity, a.branch_id,
    s.ps_id, coalesce(nullif(btrim(s.salesperson_code), ''), p.salesperson_code), l.barcode,
    coalesce((
      select array_agg(u.serial order by u.position)
      from (
        select ss.serial, ss.position from public.sale_serials ss
        where ss.sale_id = s.id and ss.barcode = l.barcode
        order by ss.position offset o.first_unit limit a.quantity
      ) u
    ), array[]::text[])
  from allowed a
  join public.sale_lines l on l.id = a.line_id
  join offsets o on o.id = l.id
  join public.sales s on s.id = l.sale_id
  left join public.profiles p on p.id = s.ps_id
  order by a.line_id;
$$;
revoke all on function public.export_brand_branch_sales_v2() from public, anon;
grant execute on function public.export_brand_branch_sales_v2() to authenticated;
notify pgrst, 'reload schema';
