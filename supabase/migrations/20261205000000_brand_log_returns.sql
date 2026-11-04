-- Returns remain signed sales; only positive sale units consume serial positions.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(to_regprocedure('public.export_brand_branch_sales_v2()')) into v_definition;
  if v_definition is null or strpos(v_definition, 'sum(l.quantity)') = 0
    or strpos(v_definition, 'limit a.quantity') = 0 then
    raise exception 'Unexpected brand export definition; return-safe serial allocation was not applied.';
  end if;
  execute replace(replace(v_definition,
    'sum(l.quantity)', 'sum(greatest(l.quantity, 0))'),
    'limit a.quantity', 'limit greatest(a.quantity, 0)');
end;
$$;
notify pgrst, 'reload schema';
