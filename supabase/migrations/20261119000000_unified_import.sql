-- Local-only until the target environment is confirmed. Requires catalog rules (20261115).
begin;
alter table public.sales add column if not exists salesperson_code text;
alter table public.profiles add column if not exists salesperson_code text;
create unique index if not exists profiles_dealer_salesperson_code
  on public.profiles (dealer_id, salesperson_code)
  where nullif(btrim(salesperson_code), '') is not null;

create or replace function public.import_unified_products(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_profile public.profiles; v_count integer; v_rows integer;
begin
  select * into v_profile from public.profiles where id=auth.uid() and active;
  if v_profile.id is null or v_profile.role<>'admin' then raise exception 'Only administrators can import products.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Products must be an array.'; end if;
  if jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>1000 then raise exception 'Import 1-1000 products per step.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) x(barcode text,srp numeric)
    where nullif(btrim(x.barcode),'') is null or x.srp<0 or x.srp::text in ('NaN','Infinity','-Infinity')) then raise exception 'Invalid barcode or SRP.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) x(barcode text)
    group by lower(public.normalize_barcode(x.barcode)) having count(*)>1) then raise exception 'Consolidate duplicate barcodes before saving.'; end if;
  if exists (
    select 1 from public.branches b cross join jsonb_to_recordset(p_items)
      x(barcode text,brand text,description text)
    left join public.products p on p.branch_id=b.id and p.barcode=public.normalize_barcode(x.barcode)
    where b.dealer_id=v_profile.dealer_id
      and (coalesce(nullif(btrim(x.brand),''),nullif(btrim(p.brand),'')) is null
        or coalesce(nullif(btrim(x.description),''),nullif(btrim(p.model_description),'')) is null)
  ) then raise exception 'New catalog items require brand and description. Missing values remain blank in review; correct their sources first.'; end if;

  insert into public.products(dealer_id,branch_id,barcode,brand,model_description,category,sub_category,srp)
  select b.dealer_id,b.id,public.normalize_barcode(x.barcode),
    coalesce(nullif(btrim(x.brand),''),p.brand),
    coalesce(nullif(btrim(x.description),''),p.model_description),
    nullif(btrim(x.category),''),
    nullif(btrim(x.sub_category),''),
    x.srp
  from public.branches b cross join jsonb_to_recordset(p_items)
    x(barcode text,brand text,description text,category text,sub_category text,srp numeric)
  left join public.products p on p.branch_id=b.id and p.barcode=public.normalize_barcode(x.barcode)
  where b.dealer_id=v_profile.dealer_id
  on conflict(branch_id,barcode) do update set
    brand=excluded.brand,model_description=excluded.model_description,
    category=coalesce(excluded.category,public.products.category),
    sub_category=coalesce(excluded.sub_category,public.products.sub_category),
    srp=coalesce(excluded.srp,public.products.srp),active=true,updated_at=now();
  get diagnostics v_rows=row_count;
  v_count:=jsonb_array_length(p_items);
  return jsonb_build_object('products',v_count,'rows_written',v_rows);
end;
$$;

create or replace function public.import_unified_sales_history(p_batch uuid,p_label text,p_file text,p_sales jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_result jsonb; v_dealer uuid; v_matched integer;
begin
  select dealer_id into v_dealer from public.profiles where id=auth.uid() and active and role='admin';
  if v_dealer is null then raise exception 'Only administrators can import sales history.'; end if;
  if p_sales is null or jsonb_typeof(p_sales)<>'array' then raise exception 'Sales must be an array.'; end if;
  if jsonb_array_length(p_sales)=0 or jsonb_array_length(p_sales)>200 then raise exception 'Import 1-200 invoices per step.'; end if;
  v_result:=public.import_sales_history(p_batch,p_label,p_file,p_sales);
  -- Original invoice deduplication remains authoritative. Never relink another batch.
  update public.sales s set salesperson_code=btrim(x->>'salespersoncode'),
    ps_id=(select p.id from public.profiles p where p.dealer_id=v_dealer
      and p.branch_id=s.branch_id and p.role='ps'
      and p.salesperson_code=btrim(x->>'salespersoncode'))
  from jsonb_array_elements(p_sales) x
  where s.dealer_id=v_dealer and s.import_batch_id=p_batch
    and s.branch_id=(x->>'branch_id')::uuid and s.invoice_number=btrim(x->>'invoice')
    and nullif(btrim(x->>'salespersoncode'),'') is not null;
  select count(*) into v_matched from public.sales where import_batch_id=p_batch and dealer_id=v_dealer and ps_id is not null;
  return v_result || jsonb_build_object('batch_matched_ps',v_matched,'salesperson_codes_preserved',true);
end;
$$;

-- Clone, do not change the legacy inventory API. Retain all its locks, role/branch
-- checks, transfer checks and snapshot allocation behavior; only preserve blank SRP.
do $$
declare definition text; old_text text; new_text text;
begin
  select pg_get_functiondef('public.import_inventory(uuid,timestamptz,text,jsonb)'::regprocedure) into definition;
  old_text:='else coalesce(nullif(trim(x->>''srp''),'''')::numeric,0) end';
  new_text:='else coalesce(nullif(trim(x->>''srp''),'''')::numeric,p.srp) end';
  if position(old_text in definition)=0 then
    raise exception 'Apply catalog rules migration 20261115000000 before unified import; inventory definition was not changed.';
  end if;
  definition:=replace(definition,'public.import_inventory(', 'public.import_unified_inventory(');
  definition:=replace(definition,old_text,new_text);
  if position('public.import_unified_inventory(' in definition)=0 then raise exception 'Unsupported inventory function signature.'; end if;
  execute definition;
end;
$$;

create or replace function public.unified_import_capabilities()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and active and role<>'ps') then
    raise exception 'This account has no import access.';
  end if;
  return jsonb_build_object('version',1);
end;
$$;
revoke all on function public.import_unified_products(jsonb) from public,anon;
revoke all on function public.import_unified_sales_history(uuid,text,text,jsonb) from public,anon;
revoke all on function public.import_unified_inventory(uuid,timestamptz,text,jsonb) from public,anon;
revoke all on function public.unified_import_capabilities() from public,anon;
grant execute on function public.import_unified_products(jsonb) to authenticated;
grant execute on function public.import_unified_sales_history(uuid,text,text,jsonb) to authenticated;
grant execute on function public.import_unified_inventory(uuid,timestamptz,text,jsonb) to authenticated;
grant execute on function public.unified_import_capabilities() to authenticated;
notify pgrst,'reload schema';
commit;
