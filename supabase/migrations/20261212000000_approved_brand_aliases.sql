-- Keep every previously approved alias consistent with the extraction engine.
begin;
create or replace function public.confirmed_product_brand(p_brand text,p_description text)
returns text language sql immutable set search_path=pg_catalog as $$
  select case
    when brand='ALPHA' then 'ALPHA STEEL'
    when brand='MULTI' then 'MULTI-PURPOSE'
    when brand='ROYAL' then 'ROYAL KLUDGE'
    when brand='TOUGH' then 'TOUGH MAMA'
    when brand='FISHER' and description ~ '^FISHER & PAYKEL( |$)' then 'FISHER & PAYKEL'
    when brand='G' and description ~ '^G SKILL( |$)' then 'G SKILL'
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
  if upper(trim(new.brand)) in ('LA','AMERICAN','FISHER','G') then
    raise exception 'Barcode %: brand "%" is ambiguous. Supply the confirmed full brand (LA GERMANIA / LA-Z-BOY, AMERICAN HOME / AMERICAN MASTER, FISHER & PAYKEL or G SKILL); no brand was guessed.',
      new.barcode,new.brand;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_confirmed_product_brand() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
