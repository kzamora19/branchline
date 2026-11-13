begin;

create or replace function public.can_edit_branch_sale(p_branch_id uuid, p_created_at timestamptz)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select p_created_at is not null and public.can_manage_branch(p_branch_id);
$$;

-- Use the same branch permission for every stage of a sale correction.
do $patch$
declare
  v_def text;
  v_old text;
begin
  select pg_get_functiondef('public.save_ps_sale(text,text,date,jsonb,uuid,text)'::regprocedure) into v_def;
  v_old := 'v_role not in (''ps'', ''manager'', ''admin'')';
  if strpos(v_def,v_old)=0 then raise exception 'Sale writer role check changed.'; end if;
  v_def := replace(v_def,v_old,'v_role not in (''ps'', ''manager'', ''district_manager'', ''admin'')');
  v_old := 'v_role = ''manager'' and';
  if strpos(v_def,v_old)=0 then raise exception 'Sale writer branch check changed.'; end if;
  execute replace(v_def,v_old,'v_role in (''manager'', ''district_manager'') and');

  select pg_get_functiondef('public.save_sale_extras(uuid,text,text,jsonb)'::regprocedure) into v_def;
  v_old := 'v_role not in (''ps'', ''manager'', ''admin'')';
  if strpos(v_def,v_old)=0 then raise exception 'Sale details role check changed.'; end if;
  v_def := replace(v_def,v_old,'v_role not in (''ps'', ''manager'', ''district_manager'', ''admin'')');
  v_old := 'v_role = ''manager'' and';
  if strpos(v_def,v_old)=0 then raise exception 'Sale details branch check changed.'; end if;
  execute replace(v_def,v_old,'v_role in (''manager'', ''district_manager'') and');

  select pg_get_functiondef('public.save_sale_with_delivery(text,text,date,jsonb,uuid,text,text,text,jsonb,boolean,text,numeric)'::regprocedure) into v_def;
  v_old := 'p.role=''manager'' and public.can_edit_branch_sale';
  if strpos(v_def,v_old)=0 then raise exception 'Inventory sale writer branch check changed.'; end if;
  execute replace(v_def,v_old,'p.role in (''manager'', ''district_manager'') and public.can_edit_branch_sale');
end
$patch$;

CREATE OR REPLACE FUNCTION branchline_private.save_promotion_sales(p_bundles jsonb, p_customer_name text, p_invoice_number text, p_sold_on date, p_regular_lines jsonb, p_payment_mode text, p_city text, p_barangay text, p_serials jsonb, p_fulfillment_method text, p_dg_amount numeric, p_sale_id uuid, p_reconcile boolean)
 RETURNS uuid
 LANGUAGE plpgsql
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
  v_saved_group public.sale_promotion_groups%rowtype;
  v_saved_group_id uuid;
  v_seen_groups uuid[] := '{}';
  v_previous_groups jsonb := '[]';
  v_previous_history uuid[];
  v_previous_serials jsonb;
  v_previous_address jsonb;
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
        or (v_actor.role in ('manager', 'district_manager') and public.can_edit_branch_sale(s.branch_id, s.created_at))
        or v_actor.role = 'admin'
      );
    if v_branch is null then
      raise exception 'The sale is not editable by this account or assignment.';
    end if;
  end if;
  if jsonb_typeof(p_bundles) is distinct from 'array' then
    raise exception 'Provide the bundles for this invoice.';
  end if;
  if (p_sale_id is null and jsonb_array_length(p_bundles)=0) or jsonb_array_length(p_bundles)>50 then
    raise exception 'Provide between 1 and 50 bundles per invoice.';
  end if;
  if p_regular_lines is null or jsonb_typeof(p_regular_lines) is distinct from 'array' then
    raise exception 'Other sale lines must be an array.'; end if;
  if jsonb_array_length(p_regular_lines)>500 then raise exception 'Too many regular sale lines.'; end if;
  perform public.inventory_lock(v_branch);
  if p_sale_id is not null then
    perform 1 from public.sales where id = p_sale_id for update;
    if not found then raise exception 'The sale is no longer available. Refresh the sales view.'; end if;
    select coalesce(jsonb_agg(to_jsonb(g) || jsonb_build_object('lines', (
      select jsonb_agg(to_jsonb(l) || jsonb_build_object('component_id', pl.component_id, 'free', pl.free) order by l.id)
      from public.sale_promotion_lines pl join public.sale_lines l on l.id=pl.line_id
      where pl.group_id=g.id and pl.sale_id=g.sale_id
    )) order by g.id),'[]') into v_previous_groups
    from public.sale_promotion_groups g where g.sale_id=p_sale_id;
    if jsonb_array_length(v_previous_groups)>0 then
      if v_actor.role='ps' then raise exception 'Ask your manager to correct this bundle sale.'; end if;
      if exists(select 1 from public.sales_returns r where r.source_sale_id=p_sale_id or r.return_sale_id=p_sale_id) then
        raise exception 'This invoice is linked to a posted return and cannot be edited.';
      end if;
      select coalesce(array_agg(id),'{}') into v_previous_history from public.sale_edit_history where sale_id=p_sale_id;
      select coalesce(jsonb_agg(to_jsonb(ss) order by ss.position),'[]') into v_previous_serials
        from public.sale_serials ss where ss.sale_id=p_sale_id;
      select jsonb_build_object('city',city,'barangay',barangay) into v_previous_address from public.sales where id=p_sale_id;
    end if;
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
    v_saved_group_id := (v_bundle->>'group_id')::uuid;
    if v_saved_group_id is not null then
      if p_sale_id is null or v_saved_group_id=any(v_seen_groups) then
        raise exception 'Choose each saved bundle only once on its original invoice.';
      end if;
      select * into v_saved_group from public.sale_promotion_groups
        where id=v_saved_group_id and sale_id=p_sale_id and promotion_id=p_promotion;
      if not found then raise exception 'The saved bundle is no longer on this invoice. Reopen the sale.'; end if;
      v_seen_groups := array_append(v_seen_groups,v_saved_group_id);
      v_promo := jsonb_populate_record(null::public.reviewed_promotions,v_saved_group.source_snapshot);
    else
      select * into v_promo from public.reviewed_promotions where id=p_promotion for share;
      if not found or v_promo.revoked_at is not null then raise exception 'The promotion is unavailable in your branch.'; end if;
    end if;
    if v_promo.id is distinct from p_promotion or v_promo.dealer_id is distinct from v_actor.dealer_id
      or v_promo.branch_id is distinct from v_branch or not public.can_access_branch(v_branch) then
      raise exception 'The promotion is unavailable in your branch.';
    end if;
    if p_sold_on is null or not isfinite(p_sold_on)
      or (v_promo.valid_from is not null and p_sold_on<v_promo.valid_from)
      or (v_promo.valid_to is not null and p_sold_on>v_promo.valid_to) then
      raise exception 'The promotion is not active on the sale date.'; end if;
    if v_saved_group_id is null and (v_promo.valid_from is null or v_promo.valid_to is null or v_promo.price_conflict)
      and p_acknowledge_warnings is distinct from true then
      raise exception 'Confirm the incomplete promotion dates or conflicting source prices before recording this sale.'; end if;
    if p_bundle_total is null or p_bundle_total<0 or p_bundle_total>9999999999.99
      or p_bundle_total in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
      or p_bundle_total<>round(p_bundle_total,2) then
      raise exception 'Enter a valid non-negative bundle total with at most two decimals.'; end if;
    if v_saved_group_id is not null and p_bundle_total=v_saved_group.bundle_total then
      select jsonb_agg(jsonb_build_object('barcode',l.barcode,'quantity',l.quantity,'selling_price',l.selling_price,
        'srp',l.srp,'component_id',pl.component_id,'free',pl.free) order by l.id)
        into v_lines
        from public.sale_promotion_lines pl join public.sale_lines l on l.id=pl.line_id
        where pl.group_id=v_saved_group_id and pl.sale_id=p_sale_id;
      if v_lines is null then raise exception 'The saved bundle has no product lines.'; end if;
    else
      v_rows := '[]'::jsonb;
      v_weight := 0;
      v_order := 0;
      for v_component in select value from jsonb_array_elements(v_promo.components) loop
        select * into v_product from public.products where dealer_id=v_promo.dealer_id
          and branch_id=v_promo.branch_id and barcode=v_component->>'barcode' and active;
        if not found then raise exception 'Bundle product % is no longer active.',v_component->>'barcode'; end if;
        if v_saved_group_id is not null then
          select min(l.srp) into v_product.srp
          from public.sale_promotion_lines pl join public.sale_lines l on l.id=pl.line_id
          where pl.group_id=v_saved_group_id and pl.sale_id=p_sale_id and pl.component_id=v_component->>'id';
        end if;
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
    end if;
    if exists(select 1 from jsonb_array_elements(p_regular_lines) r join jsonb_array_elements(v_lines) b
      on public.normalize_barcode(r->>'barcode')=b->>'barcode'
         and (r->>'quantity')::numeric=(b->>'quantity')::numeric and (r->>'selling_price')::numeric=(b->>'selling_price')::numeric) then
      raise exception 'An identical regular line cannot also be a bundle component; record it on a separate invoice.';
    end if;
    select sum((x->>'selling_price')::numeric*(x->>'quantity')::integer) into v_total from jsonb_array_elements(v_lines) x;
    if v_total is distinct from p_bundle_total then raise exception 'Bundle price allocation did not balance.'; end if;
    v_all_lines := v_all_lines || v_lines;
    v_groups := v_groups || jsonb_build_array(jsonb_build_object(
      'promotion', to_jsonb(v_promo), 'total', p_bundle_total, 'lines', v_lines, 'group_id', v_saved_group_id));
  end loop;
  -- The normal sale writer rebuilds the lines. Remove their links under the sale lock and restore them in this transaction.
  if jsonb_array_length(v_previous_groups)>0 then
    delete from public.sale_promotion_lines where sale_id=p_sale_id;
    delete from public.sale_promotion_groups where sale_id=p_sale_id;
  end if;
  v_sale := public.save_sale_with_delivery(p_customer_name,p_invoice_number,p_sold_on,
    v_all_lines||p_regular_lines,p_sale_id,p_payment_mode,p_city,p_barangay,p_serials,p_reconcile,p_fulfillment_method,p_dg_amount);
  if jsonb_array_length(v_previous_groups)>0 then
    update public.sale_edit_history
      set previous_values=previous_values||v_previous_address||jsonb_build_object(
        'promotion_groups',v_previous_groups,'serials',v_previous_serials)
      where sale_id=v_sale and not (id=any(v_previous_history));
  end if;
  for v_bundle in select value from jsonb_array_elements(v_groups) loop
    v_promo := jsonb_populate_record(null::public.reviewed_promotions, v_bundle->'promotion');
    p_bundle_total := (v_bundle->>'total')::numeric;
    v_lines := v_bundle->'lines';
    insert into public.sale_promotion_groups(id,sale_id,promotion_id,barcode,description,bundle_total,source_snapshot)
    values(coalesce((v_bundle->>'group_id')::uuid,gen_random_uuid()),v_sale,v_promo.id,v_promo.barcode,
      v_promo.description,p_bundle_total,to_jsonb(v_promo)) returning id into v_group;
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

create function public.update_bundle_sale(
  p_sale_id uuid, p_expected_updated_at timestamptz, p_bundles jsonb,
  p_customer_name text, p_invoice_number text, p_sold_on date, p_regular_lines jsonb,
  p_payment_mode text, p_city text, p_barangay text, p_serials jsonb,
  p_fulfillment_method text, p_dg_amount numeric, p_reconcile boolean
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_branch uuid;
  v_updated_at timestamptz;
begin
  select s.branch_id into v_branch
    from public.sales s join public.profiles p on p.id=auth.uid() and p.dealer_id=s.dealer_id
    where s.id=p_sale_id and p.active and p.role in ('manager','district_manager','admin')
      and public.can_manage_branch(s.branch_id) and public.is_dealer_member(s.dealer_id);
  if not found then raise exception 'The sale is not editable by this account or assignment.'; end if;

  perform public.inventory_lock(v_branch);
  select s.updated_at into v_updated_at from public.sales s where s.id=p_sale_id for update;
  if not found or v_updated_at is distinct from p_expected_updated_at
    or not exists(select 1 from public.sale_promotion_groups where sale_id=p_sale_id) then
    raise exception 'This sale changed. Refresh the sales view and reopen it.';
  end if;

  return branchline_private.save_promotion_sales(
    p_bundles,p_customer_name,p_invoice_number,p_sold_on,p_regular_lines,p_payment_mode,
    p_city,p_barangay,p_serials,p_fulfillment_method,p_dg_amount,p_sale_id,p_reconcile);
end
$$;
revoke all on function public.update_bundle_sale(uuid,timestamptz,jsonb,text,text,date,jsonb,text,text,text,jsonb,text,numeric,boolean)
  from public, anon;
grant execute on function public.update_bundle_sale(uuid,timestamptz,jsonb,text,text,date,jsonb,text,text,text,jsonb,text,numeric,boolean)
  to authenticated;

-- Existing callers may add a first bundle to an ordinary sale. Reopening a saved bundle
-- uses the version-checked correction endpoint above.
create or replace function public.edit_sale_with_promotions(
  p_sale_id uuid, p_bundles jsonb, p_customer_name text, p_invoice_number text, p_sold_on date,
  p_regular_lines jsonb, p_payment_mode text, p_city text, p_barangay text, p_serials jsonb,
  p_fulfillment_method text, p_dg_amount numeric, p_reconcile boolean
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_branch uuid;
begin
  if p_sale_id is null then raise exception 'Choose the sale to edit.'; end if;
  if jsonb_typeof(p_bundles) is distinct from 'array' then raise exception 'Provide the bundles for this invoice.'; end if;
  if jsonb_array_length(p_bundles)=0 then raise exception 'Provide between 1 and 50 bundles per invoice.'; end if;
  select s.branch_id into v_branch
    from public.sales s join public.profiles p on p.id=auth.uid() and p.dealer_id=s.dealer_id
    where s.id=p_sale_id and p.active and public.can_access_branch(s.branch_id);
  if not found then raise exception 'The sale is not editable by this account or assignment.'; end if;
  perform public.inventory_lock(v_branch);
  if exists(select 1 from public.sale_promotion_groups where sale_id=p_sale_id) then
    raise exception 'This invoice already has a bundle. Reopen the sale to correct it.';
  end if;
  return branchline_private.save_promotion_sales(
    p_bundles,p_customer_name,p_invoice_number,p_sold_on,p_regular_lines,p_payment_mode,
    p_city,p_barangay,p_serials,p_fulfillment_method,p_dg_amount,p_sale_id,p_reconcile);
end
$$;

notify pgrst,'reload schema';
commit;
