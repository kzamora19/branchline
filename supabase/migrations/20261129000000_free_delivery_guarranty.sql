begin;

alter table public.sale_delivery_guaranties
  drop constraint sale_delivery_guaranties_amount_check,
  add constraint sale_delivery_guaranties_amount_check
    check(amount>=0 and amount::text not in ('NaN','Infinity','-Infinity'));

do $patch$
declare
  v_def text;
begin
  select pg_get_functiondef('public.save_sale_with_delivery_internal(text,text,date,jsonb,uuid,text,text,text,jsonb,boolean,text,numeric)'::regprocedure) into v_def;
  if position('p_dg_amount<=0' in v_def) = 0
    or position('Delivery Guarranty must be a positive amount with at most two decimal places.' in v_def) = 0 then
    raise exception 'Free delivery: expected DG validation did not match.';
  end if;
  v_def := replace(v_def, 'p_dg_amount<=0', 'p_dg_amount<0');
  v_def := replace(v_def, 'Delivery Guarranty must be a positive amount with at most two decimal places.',
    'Delivery Guarranty must be zero or a positive amount with at most two decimal places.');
  execute v_def;
end;
$patch$;

notify pgrst, 'reload schema';
commit;
