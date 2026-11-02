-- Missing SRP stays NULL; explicit source zero remains a valid price.
begin;
do $$
declare definition text; old_text text;
begin
  select pg_get_functiondef('public.import_products(jsonb)'::regprocedure) into definition;
  old_text:='srp = coalesce(excluded.srp,0)';
  if position(old_text in definition)=0 then raise exception 'Unsupported product importer SRP rules'; end if;
  execute replace(definition,old_text,'srp = coalesce(excluded.srp,public.products.srp)');

  select pg_get_functiondef('public.import_inventory(uuid,timestamptz,text,jsonb)'::regprocedure) into definition;
  old_text:=$old$else coalesce(nullif(trim(x->>'srp'),'')::numeric,0) end$old$;
  if position(old_text in definition)=0 then raise exception 'Unsupported inventory importer SRP rules'; end if;
  execute replace(definition,old_text,$new$else coalesce(nullif(trim(x->>'srp'),'')::numeric,p.srp) end$new$);

  select pg_get_functiondef('public.update_product(text,text,text,text,text,text,numeric)'::regprocedure) into definition;
  old_text:=$old$if p_srp is null and exists(select 1 from public.products where dealer_id=v_profile.dealer_id and lower(barcode)=v_old and srp is not null) then p_srp:=0; end if; $old$;
  if position(old_text in definition)=0 then raise exception 'Unsupported product editor SRP rules'; end if;
  execute replace(definition,old_text,'');

  select pg_get_functiondef('public.add_product(text,text,text,text,text,numeric)'::regprocedure) into definition;
  old_text:='case when v_product.srp is null then p_srp else coalesce(p_srp,0) end';
  if position(old_text in definition)=0 then raise exception 'Unsupported add-product SRP rules'; end if;
  execute replace(definition,old_text,'coalesce(p_srp,v_product.srp)');

  select pg_get_functiondef('public.inventory_catalog()'::regprocedure) into definition;
  old_text:='coalesce(p.srp,0)=0';
  if position(old_text in definition)=0 then raise exception 'Unsupported inventory missing-SRP rules'; end if;
  execute replace(definition,old_text,'p.srp is null');

  select replace(pg_get_functiondef('public.inventory_products_sync_statement()'::regprocedure),E'\r\n',E'\n') into definition;
  old_text:=E'begin\n  with metadata';
  if position(old_text in definition)=0 then raise exception 'Unsupported catalog synchronization rules'; end if;
  execute replace(definition,old_text,$new$begin
  if tg_op='UPDATE' then
    if not exists(
      select 1 from inventory_changed_products n
      join inventory_previous_products o on o.id=n.id
      where (n.dealer_id,n.branch_id,n.barcode,n.brand,n.model_description,n.category,n.sub_category)
        is distinct from (o.dealer_id,o.branch_id,o.barcode,o.brand,o.model_description,o.category,o.sub_category)
    ) then return null; end if;
  end if;
  with metadata$new$);
end;
$$;
drop trigger inventory_product_update_sync on public.products;
create trigger inventory_product_update_sync after update on public.products
  referencing old table as inventory_previous_products new table as inventory_changed_products
  for each statement execute function public.inventory_products_sync_statement();
notify pgrst,'reload schema';
commit;
