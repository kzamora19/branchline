-- Apply after the promotion PDF release.
begin;

create schema if not exists branchline_private;
revoke all on schema branchline_private from public, anon, authenticated;

create function branchline_private.save_promotion_sales(p_bundles jsonb, p_customer_name text, p_invoice_number text, p_sold_on date, p_regular_lines jsonb, p_payment_mode text, p_city text, p_barangay text, p_serials jsonb, p_fulfillment_method text, p_dg_amount numeric, p_sale_id uuid, p_reconcile boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_bundle jsonb;
  v_groups jsonb := '[]'::jsonb;
  v_all_lines jsonb := '[]'::jsonb;
  p_promotion uuid;
  p_bundle_total numeric;
  p_acknowledge_warnings boolean;
  v_promo public.reviewed_promotions%rowtype;
  v_actor public.profiles%rowtype;
  v_branch uuid;
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
  select * into v_actor from public.profiles where id=auth.uid() and active;
  if not found then
    raise exception 'An active account is required.';
  end if;
  if p_sale_id is null then
    if v_actor.role <> 'ps' then
      raise exception 'An active product specialist must record the sale.';
    end if;
    v_branch := v_actor.branch_id;
  else
    select s.branch_id into v_branch
    from public.sales s
    where s.id = p_sale_id and s.dealer_id = v_actor.dealer_id
      and (
        (v_actor.role = 'ps' and s.ps_id = v_actor.id and s.branch_id = v_actor.branch_id)
        or (v_actor.role = 'manager' and public.can_edit_branch_sale(s.branch_id, s.created_at))
        or v_actor.role = 'admin'
      );
    if v_branch is null then
      raise exception 'The sale is not editable by this account or assignment.';
    end if;
  end if;
  if jsonb_typeof(p_bundles) is distinct from 'array' then
    raise exception 'Provide the bundles for this invoice.';
  end if;
  if jsonb_array_length(p_bundles) not between 1 and 50 then
    raise exception 'Provide between 1 and 50 bundles per invoice.';
  end if;
  if p_regular_lines is null or jsonb_typeof(p_regular_lines) is distinct from 'array' then
    raise exception 'Other sale lines must be an array.'; end if;
  if jsonb_array_length(p_regular_lines)>500 then raise exception 'Too many regular sale lines.'; end if;
  perform public.inventory_lock(v_branch);
  if p_sale_id is not null then
    perform 1 from public.sales where id = p_sale_id for update;
    if not found then raise exception 'The sale is no longer available. Refresh the sales view.'; end if;
  end if;
  for v_bundle in select value from jsonb_array_elements(p_bundles) loop
    if jsonb_typeof(v_bundle) is distinct from 'object'
      or jsonb_typeof(v_bundle->'promotion') is distinct from 'string'
      or jsonb_typeof(v_bundle->'bundle_total') is distinct from 'number'
      or jsonb_typeof(v_bundle->'acknowledge_warnings') is distinct from 'boolean' then
      raise exception 'Each bundle needs a promotion, selling price and confirmation status.';
    end if;
    p_promotion := (v_bundle->>'promotion')::uuid;
    p_bundle_total := (v_bundle->>'bundle_total')::numeric;
    p_acknowledge_warnings := (v_bundle->>'acknowledge_warnings')::boolean;
    select * into v_promo from public.reviewed_promotions where id=p_promotion for share;
    if not found or v_promo.dealer_id<>v_actor.dealer_id or v_promo.branch_id<>v_branch
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
    v_rows := '[]'::jsonb;
    v_weight := 0;
    v_order := 0;
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
    v_all_lines := v_all_lines || v_lines;
    v_groups := v_groups || jsonb_build_array(jsonb_build_object(
      'promotion', to_jsonb(v_promo), 'total', p_bundle_total, 'lines', v_lines));
  end loop;
  v_sale := public.save_sale_with_delivery(p_customer_name,p_invoice_number,p_sold_on,
    v_all_lines||p_regular_lines,p_sale_id,p_payment_mode,p_city,p_barangay,p_serials,p_reconcile,p_fulfillment_method,p_dg_amount);
  for v_bundle in select value from jsonb_array_elements(v_groups) loop
    v_promo := jsonb_populate_record(null::public.reviewed_promotions, v_bundle->'promotion');
    p_bundle_total := (v_bundle->>'total')::numeric;
    v_lines := v_bundle->'lines';
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
  end loop;
  return v_sale;
end $function$
;

revoke all on function branchline_private.save_promotion_sales(jsonb,text,text,date,jsonb,text,text,text,jsonb,text,numeric,uuid,boolean)
  from public, anon, authenticated;

create or replace function public.save_promotion_sales(
  p_bundles jsonb, p_customer_name text, p_invoice_number text, p_sold_on date,
  p_regular_lines jsonb, p_payment_mode text, p_city text, p_barangay text, p_serials jsonb,
  p_fulfillment_method text, p_dg_amount numeric
) returns uuid language sql security definer set search_path=pg_catalog,public as $$
  select branchline_private.save_promotion_sales(
    p_bundles,p_customer_name,p_invoice_number,p_sold_on,p_regular_lines,p_payment_mode,
    p_city,p_barangay,p_serials,p_fulfillment_method,p_dg_amount,null,false)
$$;
revoke all on function public.save_promotion_sales(jsonb,text,text,date,jsonb,text,text,text,jsonb,text,numeric) from public, anon;
grant execute on function public.save_promotion_sales(jsonb,text,text,date,jsonb,text,text,text,jsonb,text,numeric) to authenticated;

create function public.edit_sale_with_promotions(
  p_sale_id uuid, p_bundles jsonb, p_customer_name text, p_invoice_number text, p_sold_on date,
  p_regular_lines jsonb, p_payment_mode text, p_city text, p_barangay text, p_serials jsonb,
  p_fulfillment_method text, p_dg_amount numeric, p_reconcile boolean
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_sale_id is null then raise exception 'Choose the sale to edit.'; end if;
  return branchline_private.save_promotion_sales(
    p_bundles,p_customer_name,p_invoice_number,p_sold_on,p_regular_lines,p_payment_mode,
    p_city,p_barangay,p_serials,p_fulfillment_method,p_dg_amount,p_sale_id,p_reconcile);
end
$$;
revoke all on function public.edit_sale_with_promotions(uuid,jsonb,text,text,date,jsonb,text,text,text,jsonb,text,numeric,boolean)
  from public, anon;
grant execute on function public.edit_sale_with_promotions(uuid,jsonb,text,text,date,jsonb,text,text,text,jsonb,text,numeric,boolean)
  to authenticated;

notify pgrst,'reload schema';
commit;
