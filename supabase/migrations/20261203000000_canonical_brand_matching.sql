-- Match consignment labels without rewriting catalog, sales, profiles or targets.
create or replace function public.brand_key(p_brand text)
returns text language sql immutable
set search_path = pg_catalog
as $$
  select lower(trim(regexp_replace(trim(coalesce(p_brand, '')), '^con[[:space:]]*-[[:space:]]*', '', 'i')));
$$;
revoke all on function public.brand_key(text) from public, anon, authenticated;

create or replace function public.ps_brand_parts(p_assigned text, p_dealer uuid)
returns table (base text, scope text)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select
    case when position('-' in part) > 0 and not known then lower(trim(split_part(part, '-', 1))) else part end,
    case when position('-' in part) > 0 and not known then nullif(lower(trim(substr(part, position('-' in part) + 1))), '') end
  from (
    select p.part, exists (
      select 1 from public.products pr
      where pr.dealer_id = p_dealer and public.brand_key(pr.brand) = p.part
    ) as known
    from (
      select public.brand_key(x) as part
      from unnest(string_to_array(coalesce(p_assigned, ''), '/')) as x
    ) p where p.part <> ''
  ) t;
$$;
revoke all on function public.ps_brand_parts(text, uuid) from public, anon, authenticated;

-- Retain each RPC's access checks, source fields, pagination and existing grants.
do $$
declare
  v_name text;
  v_definition text;
begin
  foreach v_name in array array['brand_branch_sales', 'brand_sales_contribution', 'export_brand_branch_sales'] loop
    select pg_get_functiondef(to_regprocedure('public.' || v_name || '()')) into v_definition;
    if v_definition is null or strpos(v_definition, 'm.base = lower(trim(l.brand))') = 0 then
      raise exception 'Unexpected definition for public.%(); canonical brand matching was not applied.', v_name;
    end if;
    execute replace(v_definition, 'm.base = lower(trim(l.brand))', 'm.base = public.brand_key(l.brand)');
  end loop;
end;
$$;
notify pgrst, 'reload schema';
