-- Prevent a unified inventory import from replaying or overwriting an existing snapshot.
CREATE OR REPLACE FUNCTION public.import_unified_inventory(p_branch uuid, p_reported_at timestamp with time zone, p_files text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_id uuid; v_dealer uuid; v_items jsonb; v_units jsonb; v_admin boolean;
begin
  if not public.can_manage_inventory(p_branch) then raise exception 'Inventory import is not permitted for this branch.'; end if;
  perform public.inventory_lock(p_branch); select public.is_dealer_admin(dealer_id) into v_admin from public.branches where id=p_branch;
  if p_reported_at is null or p_reported_at>now()+interval '5 minutes' then raise exception 'A valid report date/time is required.'; end if;
  -- Check under the same lock used to apply stock changes.
  if exists (
    select 1 from public.inventory_snapshots
    where branch_id = p_branch and reported_at >= p_reported_at
  ) then
    raise exception 'A snapshot at this time or later already exists for this branch. Use a newer complete stock report.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'The stock report must be an array.'; end if;
  if jsonb_array_length(p_items)=0 then raise exception 'The stock report is empty.'; end if;
  perform public.inventory_validate_source_branch(p_branch,p_items);
  if nullif(trim(p_files),'') is null then raise exception 'Report file names are required.'; end if;
  if exists(select 1 from public.inventory_transfers where status='transit' and (from_branch=p_branch or to_branch=p_branch)) then
    raise exception 'Resolve this branch''s in-transit transfers before importing a replacement snapshot, to avoid double counting.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x)<>'object'
    or nullif(public.normalize_barcode(x->>'barcode'),'') is null
    or nullif(trim(x->>'description'),'') is null
    or jsonb_typeof(x->'quantity') is distinct from 'number'
    or jsonb_typeof(coalesce(x->'serials','[]')) is distinct from 'array') then
    raise exception 'Each stock item needs a barcode, description, numeric quantity and serial array.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) x
    where (x->>'quantity')::numeric<0 or (x->>'quantity')::numeric>2147483647
      or trunc((x->>'quantity')::numeric)<>(x->>'quantity')::numeric) then
    raise exception 'Stock quantities must be non-negative whole numbers.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) x group by public.normalize_barcode(x->>'barcode') having count(*)>1) then
    raise exception 'Duplicate product barcodes in inventory import.';
  end if;

  -- Normalize once and retain existing metadata where the report has no classification.
  select jsonb_agg(jsonb_build_object(
    'barcode',public.normalize_barcode(x->>'barcode'),'description',trim(x->>'description'),
    'quantity',(x->>'quantity')::integer,
    'brand',coalesce(p.brand,'Unclassified'),
    'category',case when v_admin then coalesce(nullif(trim(x->>'category'),''),p.category) else p.category end,
    'sub_category',case when v_admin then coalesce(nullif(trim(x->>'sub_category'),''),p.sub_category) else p.sub_category end,
    'srp',case when p.id is null then nullif(trim(x->>'srp'),'')::numeric
      when p.srp is null and not v_admin then null
      else coalesce(nullif(trim(x->>'srp'),'')::numeric,p.srp) end,
    'serialized',coalesce((x->>'serialized')::boolean,jsonb_array_length(coalesce(x->'serials','[]'))>0)
      or ((x->>'quantity')::integer=0 and coalesce(s.serialized,false)),
    'serials',coalesce(x->'serials','[]')
  )) into v_items
  from jsonb_array_elements(p_items) x
  left join public.products p on p.branch_id=p_branch and p.barcode=public.normalize_barcode(x->>'barcode')
  left join public.inventory_stock s on s.branch_id=p_branch and s.barcode=public.normalize_barcode(x->>'barcode');
  if exists(select 1 from jsonb_to_recordset(v_items) as i(quantity integer,serialized boolean,serials jsonb)
    where (i.serialized and jsonb_array_length(i.serials)<>i.quantity)
      or (not i.serialized and jsonb_array_length(i.serials)<>0)) then
    raise exception 'Serial count must match quantity for each serialized barcode.';
  end if;
  if exists(select 1 from jsonb_array_elements(v_items) i cross join lateral jsonb_array_elements(i->'serials') u
    where jsonb_typeof(u)<>'object' or nullif(trim(u->>'serial'),'') is null
      or nullif(u->>'received_on','')::date is null
      or (u->>'received_on')::date>(p_reported_at at time zone 'Asia/Manila')::date) then
    raise exception 'Each serial needs a nonblank value and a valid received date no later than the report.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('barcode',i->>'barcode','serial',trim(u->>'serial'),
    'received_on',(u->>'received_on')::date)),'[]') into v_units
    from jsonb_array_elements(v_items) i cross join lateral jsonb_array_elements(i->'serials') u;
  if exists(select 1 from jsonb_to_recordset(v_units) as u(barcode text,serial text)
    group by u.barcode,lower(u.serial) having count(*)>1) then
    raise exception 'Duplicate serial within the same barcode.';
  end if;

  select dealer_id into v_dealer from public.branches where id=p_branch;
  insert into public.inventory_snapshots(branch_id,imported_by,reported_at,files,products,quantity)
    values(p_branch,auth.uid(),p_reported_at,p_files,jsonb_array_length(v_items),0) returning id into v_id;

  insert into public.products(dealer_id,branch_id,barcode,brand,model_description,category,sub_category,srp)
    select b.dealer_id,b.id,i.barcode,i.brand,i.description,i.category,i.sub_category,i.srp
    from public.branches b cross join jsonb_to_recordset(v_items)
      as i(barcode text,brand text,description text,category text,sub_category text,srp numeric)
    where b.dealer_id=v_dealer
    on conflict(branch_id,barcode) do update set model_description=excluded.model_description,brand=excluded.brand,
      category=excluded.category,sub_category=excluded.sub_category,srp=excluded.srp,active=true,updated_at=now()
    where (products.model_description,products.brand,products.category,products.sub_category,products.srp,products.active)
      is distinct from (excluded.model_description,excluded.brand,excluded.category,excluded.sub_category,excluded.srp,true);

  -- Also repair old sale metadata when the catalog already matches the report and
  -- the upsert correctly skipped writing its unchanged product rows.
  update public.sale_lines l set brand=i.brand,model_description=i.description,
    category=i.category,sub_category=i.sub_category
    from jsonb_to_recordset(v_items) as i(barcode text,brand text,description text,category text,sub_category text)
    where l.dealer_id=v_dealer and l.barcode=i.barcode
      and (l.brand,l.model_description,l.category,l.sub_category)
        is distinct from (i.brand,i.description,i.category,i.sub_category);

  update public.inventory_stock set quantity=0,snapshot_id=v_id where branch_id=p_branch;
  insert into public.inventory_stock(branch_id,barcode,quantity,serialized,snapshot_id)
    select p_branch,p.barcode,coalesce(i.quantity,0),coalesce(i.serialized,(select old.serialized from public.inventory_stock old where old.branch_id=p_branch and old.barcode=p.barcode),false),v_id
    from public.products p left join jsonb_to_recordset(v_items)
      as i(barcode text,quantity integer,serialized boolean) on i.barcode=p.barcode
    where p.branch_id=p_branch and p.active
    on conflict(branch_id,barcode) do update set quantity=excluded.quantity,
      serialized=case when excluded.quantity=0 then inventory_stock.serialized or excluded.serialized else excluded.serialized end,
      snapshot_id=v_id;
  update public.inventory_serials set status='absent' where branch_id=p_branch;
  delete from public.inventory_serials s using jsonb_to_recordset(v_units) as u(barcode text,serial text)
    where s.branch_id=p_branch and s.barcode=u.barcode and lower(trim(s.serial))=lower(u.serial);
  insert into public.inventory_serials(branch_id,barcode,serial,received_on,status)
    select p_branch,u.barcode,u.serial,u.received_on,'available'
    from jsonb_to_recordset(v_units) as u(barcode text,serial text,received_on date);
  update public.inventory_sale_allocations set snapshot_id=v_id,base_quantity=quantity,base_serials=serials where branch_id=p_branch;
  update public.inventory_snapshots set quantity=(select sum(quantity) from public.inventory_stock where branch_id=p_branch) where id=v_id;
  insert into public.inventory_events(branch_id,actor_id,kind,note) values(p_branch,auth.uid(),'snapshot',p_files);
  return v_id;
end;
$function$;
