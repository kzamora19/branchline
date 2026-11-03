begin;

do $patch$
declare
  v_def text;
  v_guard text := $guard$
  if v_method = 'delivery' and p_dg_amount is null then
    raise exception 'Enter a Delivery Guarranty amount. Use 0.00 for free delivery.';
  end if;
$guard$;
begin
  select pg_get_functiondef('public.save_sale_with_delivery_internal(text,text,date,jsonb,uuid,text,text,text,jsonb,boolean,text,numeric)'::regprocedure) into v_def;
  if position('if p_dg_amount is not null and (p_dg_amount<0' in v_def) = 0 then
    raise exception 'Required DG: expected delivery validation did not match.';
  end if;
  v_def := replace(v_def, 'if p_dg_amount is not null and (p_dg_amount<0',
    v_guard || '  if p_dg_amount is not null and (p_dg_amount<0');
  execute v_def;
end;
$patch$;

notify pgrst, 'reload schema';
commit;
