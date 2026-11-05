-- Returned units must remain visible and sellable in their original branch,
-- without changing an archived product's saved SRP or classifications.
begin;
do $patch$
declare definition text; old_text text;
begin
  select pg_get_functiondef('public.process_sales_return(uuid,date,jsonb,text,uuid)'::regprocedure) into definition;
  old_text:='if not exists(select 1 from public.products where branch_id=s.branch_id and barcode=l.barcode) then';
  if strpos(definition,old_text)=0 then raise exception 'Unsupported sales return catalog definition.'; end if;
  execute replace(definition,old_text,
    'update public.products set active=true where branch_id=s.branch_id and barcode=l.barcode and not active;
    '||old_text);
end$patch$;
notify pgrst,'reload schema';
commit;
