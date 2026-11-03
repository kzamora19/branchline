begin;

do $patch$
declare
  v_def text;
  v_guard text := $guard$
 if jsonb_typeof(p_lines) is distinct from 'array' then
  raise exception 'Sale products must be an array.';
 end if;
 if exists(select 1 from jsonb_array_elements(p_lines) x
   where jsonb_typeof(x->'srp') is distinct from 'number') then
  raise exception 'Enter an SRP for every product. Use a valid non-negative amount.';
 end if;
 if exists(select 1 from jsonb_array_elements(p_lines) x where (x->>'srp')::numeric<0) then
  raise exception 'Enter an SRP for every product. Use a valid non-negative amount.';
 end if;
$guard$;
begin
  select pg_get_functiondef('public.save_sale_with_delivery(text,text,date,jsonb,uuid,text,text,text,jsonb,boolean,text,numeric)'::regprocedure) into v_def;
  if position('perform public.inventory_lock(v_branch);' in v_def) = 0 then
    raise exception 'Required SRP: expected manual sale guard did not match.';
  end if;
  v_def := replace(v_def, 'perform public.inventory_lock(v_branch);', v_guard || ' perform public.inventory_lock(v_branch);');
  execute v_def;
end;
$patch$;

notify pgrst, 'reload schema';
commit;
