begin;
do $patch$
declare definition text; old_text text:=E'coalesce((\n      select array_agg(u.serial order by u.position)';
begin
  select replace(pg_get_functiondef('public.export_brand_branch_sales_v2()'::regprocedure),E'\r\n',E'\n') into definition;
  if strpos(definition,old_text)=0
    or strpos(definition,'), array[]::text[])')=0 then
    raise exception 'Unsupported return serial export definition.';
  end if;
  definition:=replace(definition,old_text,
    'case when exists(select 1 from public.sales_return_lines rl where rl.return_line_id=l.id)
      then array(select jsonb_array_elements_text(rl.serials) from public.sales_return_lines rl where rl.return_line_id=l.id)
      else coalesce((
      select array_agg(u.serial order by u.position)');
  execute replace(definition,'), array[]::text[])', '), array[]::text[]) end');
end$patch$;
notify pgrst,'reload schema';
commit;
