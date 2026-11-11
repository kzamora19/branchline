-- Remove campaign-specific PDF intake and restore the original single-bundle sale flow.
do $verify$
begin
  if to_regclass('public.promotion_source_offers') is not null
    and exists (select 1 from public.promotion_source_offers) then
    raise exception 'Promotion source references remain. Review them before removing the temporary table.';
  end if;
end $verify$;
drop table if exists public.promotion_source_offers;
drop function if exists public.import_source_priced_promotions(uuid,jsonb);

create or replace function public.save_promotion_sale(
  p_promotion uuid,p_bundle_total numeric,p_acknowledge_warnings boolean,
  p_customer_name text,p_invoice_number text,p_sold_on date,p_regular_lines jsonb,
  p_payment_mode text,p_city text,p_barangay text,p_serials jsonb,
  p_fulfillment_method text,p_dg_amount numeric
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_promo public.reviewed_promotions%rowtype;
  v_profile public.profiles%rowtype;
  v_component jsonb;
  v_product public.products%rowtype;
  v_weight numeric:=0;
  v_cents numeric;
  v_rows jsonb:='[]'::jsonb;
  v_line jsonb;
  v_lines jsonb;
  v_sale uuid;
  v_group uuid;
  v_line_id uuid;
  v_total numeric;
  v_order integer:=0;
begin
  select * into v_profile from public.profiles where id=auth.uid() and active and role='ps';
  if not found then raise exception 'An active product specialist must record the sale.'; end if;
  select * into v_promo from public.reviewed_promotions where id=p_promotion for share;
  if not found or v_promo.dealer_id<>v_profile.dealer_id or v_promo.branch_id<>v_profile.branch_id
    or v_promo.revoked_at is not null or not public.can_access_branch(v_promo.branch_id) then raise exception 'The promotion is unavailable in your branch.'; end if;
  if p_sold_on is null or not isfinite(p_sold_on)
    or (v_promo.valid_from is not null and p_sold_on<v_promo.valid_from)
    or (v_promo.valid_to is not null and p_sold_on>v_promo.valid_to) then
    raise exception 'The promotion is not active on the sale date.'; end if;
  if (v_promo.valid_from is null or v_promo.valid_to is null or v_promo.price_conflict)
    and p_acknowledge_warnings is distinct from true then
    raise exception 'Confirm the incomplete promotion dates or conflicting source prices before recording this sale.'; end if;
  if p_bundle_total is null or p_bundle_total<0 or p_bundle_total>9999999999.99
    or p_bundle_total in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    or p_bundle_total<>round(p_bundle_total,2) then
    raise exception 'Enter a valid non-negative bundle total with at most two decimals.'; end if;
  if p_regular_lines is null or jsonb_typeof(p_regular_lines) is distinct from 'array' then
    raise exception 'Other sale lines must be an array.'; end if;
  if jsonb_array_length(p_regular_lines)>500 then raise exception 'Too many regular sale lines.'; end if;
  perform public.inventory_lock(v_promo.branch_id);
  for v_component in select value from jsonb_array_elements(v_promo.components) loop
    select * into v_product from public.products where dealer_id=v_promo.dealer_id
      and branch_id=v_promo.branch_id and barcode=v_component->>'barcode' and active;
    if not found then raise exception 'Bundle product % is no longer active.',v_component->>'barcode'; end if;
    if v_product.srp is null or v_product.srp<0 then
      raise exception 'Bundle product % needs a standard SRP under the existing sale rules.',v_product.barcode; end if;
    if not (v_component->>'free')::boolean then
      v_weight:=v_weight+v_product.srp*(v_component->>'quantity')::integer;
    end if;
    v_order:=v_order+1;
    v_rows:=v_rows||jsonb_build_array(v_component||jsonb_build_object('srp',v_product.srp,'ordinal',v_order));
  end loop;
  if v_weight<=0 then raise exception 'Paid bundle products need a positive combined SRP.'; end if;
  v_cents:=p_bundle_total*100;
  with components as (
    select x, (x->>'quantity')::integer qty, (x->>'free')::boolean free,
      (x->>'ordinal')::integer ord,
      case when (x->>'free')::boolean then 0::numeric else (x->>'srp')::numeric end unit_weight
    from jsonb_array_elements(v_rows) x
  ), calculated as (
    select *,floor(v_cents*unit_weight/v_weight) base,
      mod(v_cents*unit_weight,v_weight) remainder from components
  ), ranked as (
    select *,coalesce(sum(qty) filter(where not free) over
      (order by remainder desc,x->>'id' rows between unbounded preceding and 1 preceding),0) previous_qty,
      v_cents-sum(base*qty) over () remaining from calculated
  ), split as (
    select *,case when free then 0 else greatest(0,least(qty,remaining-previous_qty))::integer end extra from ranked
  ), portions as (
    select x,ord,extra qty,(base+1)/100 price,0 part from split where extra>0
    union all
    select x,ord,qty-extra,base/100,1 from split where qty-extra>0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'barcode',x->>'barcode','quantity',qty,'selling_price',price,'srp',x->'srp',
    'component_id',x->>'id','free',x->'free') order by ord,part),'[]'::jsonb)
    into v_lines from portions;
  if exists(select 1 from jsonb_array_elements(p_regular_lines) r join jsonb_array_elements(v_lines) b
    on public.normalize_barcode(r->>'barcode')=b->>'barcode'
       and (r->>'quantity')::numeric=(b->>'quantity')::numeric and (r->>'selling_price')::numeric=(b->>'selling_price')::numeric) then
    raise exception 'An identical regular line cannot also be a bundle component; record it on a separate invoice.';
  end if;
  select sum((x->>'selling_price')::numeric*(x->>'quantity')::integer) into v_total from jsonb_array_elements(v_lines) x;
  if v_total is distinct from p_bundle_total then raise exception 'Bundle price allocation did not balance.'; end if;
  v_sale:=public.save_sale_with_delivery(p_customer_name,p_invoice_number,p_sold_on,
    v_lines||p_regular_lines,null,p_payment_mode,p_city,p_barangay,p_serials,false,p_fulfillment_method,p_dg_amount);
  insert into public.sale_promotion_groups(sale_id,promotion_id,barcode,description,bundle_total,source_snapshot)
  values(v_sale,v_promo.id,v_promo.barcode,v_promo.description,p_bundle_total,to_jsonb(v_promo)) returning id into v_group;
  for v_line in select value from jsonb_array_elements(v_lines) loop
    select l.id into v_line_id from public.sale_lines l
      where l.sale_id=v_sale and l.barcode=v_line->>'barcode'
        and l.quantity=(v_line->>'quantity')::integer and l.selling_price=(v_line->>'selling_price')::numeric
        and not exists(select 1 from public.sale_promotion_lines p where p.line_id=l.id)
      order by l.id limit 1;
    if v_line_id is null then raise exception 'Unable to associate every bundle component with its sale line.'; end if;
    insert into public.sale_promotion_lines(group_id,sale_id,line_id,component_id,free)
    values(v_group,v_sale,v_line_id,v_line->>'component_id',(v_line->>'free')::boolean);
  end loop;
  return v_sale;
end $$;

drop function if exists public.save_promotion_sales(jsonb,text,text,date,jsonb,text,text,text,jsonb,text,numeric);
notify pgrst, 'reload schema';
