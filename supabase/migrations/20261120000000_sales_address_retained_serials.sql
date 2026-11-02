-- Retained serials are sale choices, never additional current inventory.
begin;

-- A retained serial can conflict with another branch's sale, transfer or import.
create or replace function public.inventory_lock(p_branch uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_dealer uuid;
begin
  select dealer_id into v_dealer from public.branches where id=p_branch;
  if v_dealer is not null then perform pg_advisory_xact_lock(hashtextextended(v_dealer::text,9185)); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_branch::text,9184));
end;
$$;

create index sale_serials_product_serial on public.sale_serials(dealer_id,lower(barcode),lower(trim(serial)));
create index inventory_serials_product_serial on public.inventory_serials(lower(barcode),lower(trim(serial)),branch_id);

create function public.inventory_sales_only_count(p_units jsonb)
returns integer language sql immutable set search_path=pg_catalog,public as $$
  select count(*)::integer from jsonb_array_elements(coalesce(p_units,'[]')) x
    where coalesce((x->>'sales_only')::boolean,false);
$$;

create function public.inventory_sale_serial_eligible(p_branch uuid,p_barcode text,p_serial text,p_exclude uuid default null)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(
    select 1 from public.inventory_serials u join public.branches b on b.id=u.branch_id
    where u.branch_id=p_branch and u.barcode=p_barcode and lower(trim(u.serial))=lower(trim(p_serial))
      and u.status in ('available','absent')
      and not exists(select 1 from public.sale_serials ss
        where ss.dealer_id=b.dealer_id and lower(ss.barcode)=lower(p_barcode)
          and lower(trim(ss.serial))=lower(trim(p_serial)) and (p_exclude is null or ss.sale_id<>p_exclude))
      and not exists(select 1 from public.inventory_serials other join public.branches ob on ob.id=other.branch_id
        where ob.dealer_id=b.dealer_id and other.branch_id<>p_branch and lower(other.barcode)=lower(p_barcode)
          and lower(trim(other.serial))=lower(trim(p_serial)) and other.status in ('available','transit'))
      and not exists(select 1 from public.inventory_transfers t
        where t.from_branch=p_branch and t.barcode=p_barcode and t.status in ('transit','received')
          and exists(select 1 from jsonb_array_elements(t.serials) x where lower(trim(x->>'serial'))=lower(trim(p_serial)))
          and (t.status='transit' or (u.status='absent' and not exists(
            select 1 from public.inventory_transfers back where back.to_branch=p_branch and back.barcode=p_barcode and back.status='received'
              and back.resolved_at>t.dispatched_at
              and exists(select 1 from jsonb_array_elements(back.serials) x where lower(trim(x->>'serial'))=lower(trim(p_serial)))))))
  );
$$;

create function public.inventory_sales_serials()
returns setof public.inventory_serials language sql stable security definer set search_path=pg_catalog,public as $$
  with accessible_branches as materialized (
    select id from public.branches where public.can_access_inventory(id)
  )
  select u.* from public.inventory_serials u join accessible_branches b on b.id=u.branch_id
  where u.status in ('available','absent') and public.inventory_sale_serial_eligible(u.branch_id,u.barcode,u.serial);
$$;

-- Transform the existing allocator rather than replacing its baseline safeguards.
do $$
declare definition text; old_text text; new_text text; pair text[];
begin
  select pg_get_functiondef('public.inventory_apply_sale(uuid,jsonb,boolean)'::regprocedure) into definition;
  foreach pair slice 1 in array array[
    array[
      'v_current:=stock.quantity+coalesce(a.quantity-a.base_quantity,0);',
      'v_current:=stock.quantity+coalesce(a.quantity-public.inventory_sales_only_count(a.serials)-a.base_quantity+public.inventory_sales_only_count(a.base_serials),0);'
    ],
    array[
      'v_delta:=desired-base_qty;',
      'v_delta:=desired-public.inventory_sales_only_count(chosen)-base_qty+public.inventory_sales_only_count(base_units);'
    ],
    array[
      $old$chosen:=chosen||jsonb_build_array(unit||jsonb_build_object('received_on',v_date));$old$,
      $new$chosen:=chosen||jsonb_build_array(unit||jsonb_build_object('received_on',v_date,'sales_only',
        coalesce((select coalesce((x->>'sales_only')::boolean,false) from jsonb_array_elements(coalesce(a.serials,base_units)) x where x->>'serial'=unit->>'serial' limit 1),
          exists(select 1 from public.inventory_serials u where u.branch_id=s.branch_id and u.barcode=code and u.serial=unit->>'serial' and u.status='absent'))));$new$
    ],
    array[
      $old$update public.inventory_serials set status='available' where branch_id=s.branch_id and barcode=code and serial=unit->>'serial' and status='sold';$old$,
      $new$update public.inventory_serials set status=case when coalesce((unit->>'sales_only')::boolean,false) then 'absent' else 'available' end where branch_id=s.branch_id and barcode=code and serial=unit->>'serial' and status='sold';$new$
    ],
    array[
      $old$if v_status is distinct from 'available' then raise exception 'A previously restored serial is no longer available. Resolve its inventory movement first.'; end if;$old$,
      $new$if v_status is distinct from (case when coalesce((unit->>'sales_only')::boolean,false) then 'absent' else 'available' end) then raise exception 'A previously restored serial is no longer available. Resolve its inventory movement first.'; end if;$new$
    ],
    array[
      $old$if v_status is distinct from 'available' then raise exception 'Serial % for barcode % is not available.',unit->>'serial',code; end if;$old$,
      $new$if not public.inventory_sale_serial_eligible(s.branch_id,code,unit->>'serial',p_sale)
          or v_status is distinct from (case when coalesce((unit->>'sales_only')::boolean,false) then 'absent' else 'available' end)
        then raise exception 'Serial % for barcode % is not available for sales entry.',unit->>'serial',code; end if;$new$
    ],
    array[
      $old$if not exists(select 1 from jsonb_array_elements(chosen) x where x->>'serial'=unit->>'serial') then$old$,
      $new$if not exists(select 1 from jsonb_array_elements(chosen) x where x->>'serial'=unit->>'serial') then
        if coalesce((unit->>'sales_only')::boolean,false) then
          update public.inventory_serials set status='absent' where branch_id=s.branch_id and barcode=code and serial=unit->>'serial' and status='sold';
          continue;
        end if;$new$
    ]
  ] loop
    old_text:=pair[1]; new_text:=pair[2];
    if position(old_text in definition)=0 then raise exception 'Unsupported sale allocator; retained serial migration aborted: %',old_text; end if;
    definition:=replace(definition,old_text,new_text);
  end loop;
  execute definition;

  select pg_get_functiondef('public.inventory_delete_sale()'::regprocedure) into definition;
  old_text:='quantity=quantity+a.quantity-a.base_quantity';
  if position(old_text in definition)=0 then raise exception 'Unsupported sale deletion allocator.'; end if;
  definition:=replace(definition,old_text,'quantity=quantity+a.quantity-public.inventory_sales_only_count(a.serials)-a.base_quantity+public.inventory_sales_only_count(a.base_serials)');
  old_text:=$old$set status='available' where branch_id=a.branch_id and barcode=a.barcode and serial=u->>'serial' and status='sold'$old$;
  if position(old_text in definition)=0 then raise exception 'Unsupported serial deletion allocator.'; end if;
  definition:=replace(definition,old_text,$new$set status=case when coalesce((u->>'sales_only')::boolean,false) then 'absent' else 'available' end where branch_id=a.branch_id and barcode=a.barcode and serial=u->>'serial' and status='sold'$new$);
  old_text:=$old$if not exists(select 1 from jsonb_array_elements(a.serials) x where x->>'serial'=u->>'serial') then$old$;
  if position(old_text in definition)=0 then raise exception 'Unsupported retained serial deletion loop.'; end if;
  definition:=replace(definition,old_text,old_text||$new$
          if coalesce((u->>'sales_only')::boolean,false) then continue; end if;$new$);
  old_text:=$old$if not exists(select 1 from public.inventory_serials where branch_id=a.branch_id and barcode=a.barcode and serial=u->>'serial' and status='available') then$old$;
  if position(old_text in definition)=0 then raise exception 'Unsupported baseline serial deletion allocator.'; end if;
  definition:=replace(definition,old_text,$new$if not exists(select 1 from public.inventory_serials where branch_id=a.branch_id and barcode=a.barcode and serial=u->>'serial'
    and status=case when coalesce((u->>'sales_only')::boolean,false) then 'absent' else 'available' end) then$new$);
  execute definition;

  select pg_get_functiondef('public.save_inventory_sale(text,text,date,jsonb,uuid,text,text,text,jsonb,boolean)'::regprocedure) into definition;
  old_text:='if p_sale_id is not null then';
  if position(old_text in definition)=0 then raise exception 'Unsupported manual sale API.'; end if;
  definition:=regexp_replace(definition,old_text,$new$if nullif(btrim(p_city),'') is null or nullif(btrim(p_barangay),'') is null then
    raise exception 'City / municipality and barangay are required.';
  end if;
  if p_sale_id is not null then$new$);
  execute definition;
end;
$$;

-- Keep zero-stock products serialized when a replacement report omits them.
do $$
declare definition text; signature text; old_text text;
begin
  foreach signature in array array['public.import_inventory(uuid,timestamptz,text,jsonb)','public.import_unified_inventory(uuid,timestamptz,text,jsonb)'] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    old_text:='coalesce(i.serialized,false)';
    if position(old_text in definition)=0 then raise exception 'Unsupported inventory import serialization rules: %',signature; end if;
    definition:=replace(definition,old_text,'coalesce(i.serialized,(select old.serialized from public.inventory_stock old where old.branch_id=p_branch and old.barcode=p.barcode),false)');
    execute definition;
  end loop;
end;
$$;

revoke all on function public.inventory_sales_only_count(jsonb) from public,anon,authenticated;
revoke all on function public.inventory_sale_serial_eligible(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.inventory_sales_serials() from public,anon;
grant execute on function public.inventory_sales_serials() to authenticated;
notify pgrst,'reload schema';
commit;
