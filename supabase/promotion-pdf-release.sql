-- Applied to production as 20261111234747_enable_promotion_pdf_import_and_bundle_sales.
-- Depends on the Sales Tracker promotion migrations through 20261221000000.
begin;

create or replace function public.review_priced_promotion(
  p_branch uuid, p_barcode text, p_description text, p_valid_from date, p_valid_to date,
  p_price_conflict boolean, p_source_name text, p_source_page integer, p_source_excerpt text,
  p_components jsonb, p_memo_srp numeric, p_tag_price numeric
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
  if (p_tag_price is not null and (p_tag_price < 0 or p_tag_price > 9999999999.99
    or p_tag_price in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    or p_tag_price <> round(p_tag_price,2)))
    or (p_memo_srp is not null and (p_memo_srp < 0 or p_memo_srp > 9999999999.99
      or p_memo_srp in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
      or p_memo_srp <> round(p_memo_srp,2))) then
    raise exception 'Enter a valid memo tag price and, if supplied, memo SRP.';
  end if;
  v_id := public.review_promotion(p_branch,p_barcode,p_description,p_valid_from,p_valid_to,
    p_price_conflict,p_source_name,p_source_page,p_source_excerpt,p_components);
  update public.reviewed_promotions set memo_srp=p_memo_srp, tag_price=p_tag_price where id=v_id;
  return v_id;
end $$;
revoke all on function public.review_priced_promotion(uuid,text,text,date,date,boolean,text,integer,text,jsonb,numeric,numeric) from public,anon;
grant execute on function public.review_priced_promotion(uuid,text,text,date,date,boolean,text,integer,text,jsonb,numeric,numeric) to authenticated;

CREATE OR REPLACE FUNCTION public.import_source_priced_promotions(p_branch uuid, p_offers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_offer jsonb;
  v_existing public.reviewed_promotions%rowtype;
  v_code text;
  v_imported integer := 0;
  v_skipped integer := 0;
begin
  if auth.uid() is null or p_branch is null or not public.can_manage_branch(p_branch)
    or not exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin') then
    raise exception 'A Sales Tracker administrator must import these promotions.';
  end if;
  if p_offers is null or jsonb_typeof(p_offers) is distinct from 'array' then
    raise exception 'Provide a promotion offer array.';
  end if;
  if jsonb_array_length(p_offers) not between 1 and 1000 then
    raise exception 'Provide between 1 and 1000 promotion offers.';
  end if;
  for v_offer in
    select value from jsonb_array_elements(p_offers)
    order by value->>'p_source_name',value->>'p_source_page',value->>'p_source_excerpt',value->>'p_barcode'
  loop
    v_code := public.normalize_barcode(v_offer->>'p_barcode');
    perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_branch::text,
      v_code,v_offer->>'p_source_name',v_offer->>'p_source_page',v_offer->>'p_source_excerpt'),0));
    select * into v_existing from public.reviewed_promotions
      where branch_id=p_branch and barcode=v_code and revoked_at is null
        and source_name=v_offer->>'p_source_name'
        and source_page=(v_offer->>'p_source_page')::integer
        and (source_excerpt = v_offer->>'p_source_excerpt'
          or (source_excerpt not like 'barcode: %' and source_excerpt not like '% | barcode: %'
            and regexp_replace(source_excerpt, '[[:space:]]+', '', 'g') = regexp_replace(
              regexp_replace(v_offer->>'p_source_excerpt',
                '(^| [|] )(barcode|description|brand|category|model|memoSrp|tagPrice|cashPayment|remarks|months(6|9|12|18|24)): ',
                '', 'g'), '[[:space:]]+', '', 'g')))
      order by reviewed_at desc,id
      limit 1;
    if found then
      -- The earlier PDF reader stored the same printed cells without column labels.
      -- Preserve that reviewed offer and its stock mapping.
      if v_existing.source_excerpt is distinct from v_offer->>'p_source_excerpt' then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      if v_existing.tag_price is distinct from (v_offer->>'p_tag_price')::numeric
        or v_existing.memo_srp is distinct from (v_offer->>'p_memo_srp')::numeric
        or v_existing.valid_from is distinct from (v_offer->>'p_valid_from')::date
        or v_existing.valid_to is distinct from (v_offer->>'p_valid_to')::date
        or v_existing.components is distinct from v_offer->'p_components'
        or v_existing.description is distinct from btrim(v_offer->>'p_description')
        or v_existing.price_conflict is distinct from (v_offer->>'p_price_conflict')::boolean then
        raise exception 'This source row was already imported with different reviewed details. Review its existing promotion before replacement.';
      end if;
      v_skipped := v_skipped + 1;
    else
      perform public.review_priced_promotion(p_branch,v_code,v_offer->>'p_description',
        (v_offer->>'p_valid_from')::date,(v_offer->>'p_valid_to')::date,
        (v_offer->>'p_price_conflict')::boolean,v_offer->>'p_source_name',
        (v_offer->>'p_source_page')::integer,v_offer->>'p_source_excerpt',
        v_offer->'p_components',(v_offer->>'p_memo_srp')::numeric,(v_offer->>'p_tag_price')::numeric);
      v_imported := v_imported + 1;
    end if;
  end loop;
  return jsonb_build_object('imported',v_imported,'skipped',v_skipped);
end $function$;
revoke all on function public.import_source_priced_promotions(uuid,jsonb) from public,anon;
grant execute on function public.import_source_priced_promotions(uuid,jsonb) to authenticated;

create or replace function public.save_promotion_sales(p_bundles jsonb, p_customer_name text, p_invoice_number text, p_sold_on date, p_regular_lines jsonb, p_payment_mode text, p_city text, p_barangay text, p_serials jsonb, p_fulfillment_method text, p_dg_amount numeric)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_bundle jsonb;
  v_groups jsonb := '[]'::jsonb;
  v_all_lines jsonb := '[]'::jsonb;
  p_promotion uuid;
  p_bundle_total numeric;
  p_acknowledge_warnings boolean;
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
  if jsonb_typeof(p_bundles) is distinct from 'array' then
    raise exception 'Provide the bundles for this invoice.';
  end if;
  if jsonb_array_length(p_bundles) not between 1 and 50 then
    raise exception 'Provide between 1 and 50 bundles per invoice.';
  end if;
  if p_regular_lines is null or jsonb_typeof(p_regular_lines) is distinct from 'array' then
    raise exception 'Other sale lines must be an array.'; end if;
  if jsonb_array_length(p_regular_lines)>500 then raise exception 'Too many regular sale lines.'; end if;
  perform public.inventory_lock(v_profile.branch_id);
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
    v_all_lines||p_regular_lines,null,p_payment_mode,p_city,p_barangay,p_serials,false,p_fulfillment_method,p_dg_amount);
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
end $$;

revoke all on function public.save_promotion_sales(jsonb,text,text,date,jsonb,text,text,text,jsonb,text,numeric) from public,anon;
grant execute on function public.save_promotion_sales(jsonb,text,text,date,jsonb,text,text,text,jsonb,text,numeric) to authenticated;

CREATE OR REPLACE FUNCTION public.save_promotion_sale(p_promotion uuid, p_bundle_total numeric, p_acknowledge_warnings boolean, p_customer_name text, p_invoice_number text, p_sold_on date, p_regular_lines jsonb, p_payment_mode text, p_city text, p_barangay text, p_serials jsonb, p_fulfillment_method text, p_dg_amount numeric)
returns uuid language sql security invoker set search_path=pg_catalog,public as $$
  select public.save_promotion_sales(
    jsonb_build_array(jsonb_build_object('promotion',p_promotion,'bundle_total',p_bundle_total,
      'acknowledge_warnings',coalesce(p_acknowledge_warnings,false))),
    p_customer_name,p_invoice_number,p_sold_on,p_regular_lines,p_payment_mode,p_city,p_barangay,
    p_serials,p_fulfillment_method,p_dg_amount)
$$;
notify pgrst,'reload schema';

commit;
