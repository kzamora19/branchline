begin;

do $patch$
declare
  v_def text;
begin
  select pg_get_functiondef('public.brand_sales_contribution()'::regprocedure) into v_def;
  if position('sum(l.srp * l.quantity)' in v_def) = 0 then
    raise exception 'SRP comparison: expected contribution calculation did not match.';
  end if;
  v_def := replace(v_def, 'sum(l.srp * l.quantity)', 'sum(coalesce(l.srp, l.selling_price) * l.quantity)');
  execute v_def;
end;
$patch$;

notify pgrst, 'reload schema';
commit;
