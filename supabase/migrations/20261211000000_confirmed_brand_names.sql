-- Resolve confirmed multiword brands on every catalog and sales write.
begin;
create or replace function public.confirmed_product_brand(p_brand text,p_description text)
returns text language sql immutable set search_path=pg_catalog as $$
  select case
    when brand='LAGERMANIA' then 'LA GERMANIA'
    when brand='LA' and description ~ '^LA GERMANIA( |$)' then 'LA GERMANIA'
    when brand='LA' and description ~ '^LA-Z-BOY( |$)' then 'LA-Z-BOY'
    when brand='AMERICAN' and description ~ '^AMERICAN HOME( |$)' then 'AMERICAN HOME'
    when brand='AMERICAN' and description ~ '^AMERICAN MASTER( |$)' then 'AMERICAN MASTER'
    else p_brand end
  from (select
    upper(regexp_replace(trim(coalesce(p_brand,'')),'[[:space:]]+',' ','g')) as brand,
    upper(regexp_replace(trim(coalesce(p_description,'')),'[[:space:]]+',' ','g')) as description
  ) source;
$$;
revoke all on function public.confirmed_product_brand(text,text) from public,anon,authenticated;

create or replace function public.enforce_confirmed_product_brand()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  new.brand:=public.confirmed_product_brand(new.brand,new.model_description);
  if upper(trim(new.brand)) in ('LA','AMERICAN') then
    raise exception 'Barcode %: brand "%" is ambiguous. Supply the confirmed full brand (LA GERMANIA / LA-Z-BOY or AMERICAN HOME / AMERICAN MASTER); no brand was guessed.',
      new.barcode,new.brand;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_confirmed_product_brand() from public,anon,authenticated;

create trigger confirmed_product_brand before insert or update of brand,model_description on public.products
  for each row execute function public.enforce_confirmed_product_brand();
create trigger confirmed_sale_brand before insert or update of brand,model_description on public.sale_lines
  for each row execute function public.enforce_confirmed_product_brand();
notify pgrst,'reload schema';
commit;
