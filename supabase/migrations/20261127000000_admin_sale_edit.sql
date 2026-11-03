begin;

do $patch$
declare
  v_def text;
  v_new text;
  v_pair text[];
begin
  select pg_get_functiondef('public.save_ps_sale(text,text,date,jsonb,uuid,text)'::regprocedure) into v_def;
  v_new := v_def;
  foreach v_pair slice 1 in array array[
    array[$old$v_role not in ('ps', 'manager')$old$, $new$v_role not in ('ps', 'manager', 'admin')$new$],
    array[$old$An active Product Specialist or Branch Manager account is required.$old$, $new$An active Product Specialist, Branch Manager or Administrator account is required.$new$],
    array[$old$or (v_role = 'manager' and public.can_edit_branch_sale(s.branch_id, s.created_at))$old$,
          $new$or (v_role = 'manager' and public.can_edit_branch_sale(s.branch_id, s.created_at))
        or v_role = 'admin'$new$]
  ] loop
    if position(v_pair[1] in v_new) = 0 then raise exception 'Admin sale edit: save_ps_sale patch did not match: %', v_pair[1]; end if;
    v_new := replace(v_new, v_pair[1], v_pair[2]);
  end loop;
  execute v_new;

  select pg_get_functiondef('public.save_sale_extras(uuid,text,text,jsonb)'::regprocedure) into v_def;
  if position($old$v_role not in ('ps', 'manager')$old$ in v_def) = 0 then
    raise exception 'Admin sale edit: save_sale_extras role guard did not match.';
  end if;
  v_new := replace(v_def, $old$v_role not in ('ps', 'manager')$old$, $new$v_role not in ('ps', 'manager', 'admin')$new$);
  v_new := replace(v_new, 'An active Product Specialist or Branch Manager account is required.',
    'An active Product Specialist, Branch Manager or Administrator account is required.');
  execute v_new;

  select pg_get_functiondef('public.save_sale_with_delivery(text,text,date,jsonb,uuid,text,text,text,jsonb,boolean,text,numeric)'::regprocedure) into v_def;
  if position($old$or (p.role='manager' and public.can_edit_branch_sale(s.branch_id,s.created_at))$old$ in v_def) = 0 then
    raise exception 'Admin sale edit: delivery authorization guard did not match.';
  end if;
  v_new := replace(v_def,
    $old$or (p.role='manager' and public.can_edit_branch_sale(s.branch_id,s.created_at))$old$,
    $new$or (p.role='manager' and public.can_edit_branch_sale(s.branch_id,s.created_at)) or p.role='admin'$new$);
  execute v_new;
end;
$patch$;

notify pgrst, 'reload schema';
commit;
