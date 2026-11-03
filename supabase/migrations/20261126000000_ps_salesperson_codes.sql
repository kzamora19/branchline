begin;

create function public.admin_update_profile_with_sales_code(
 p_user_id uuid,p_full_name text,p_role text,p_district_id uuid,p_branch_id uuid,p_assigned_brand text,
 p_salesperson_code text default null
) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_code text:=nullif(btrim(p_salesperson_code),'');v_person public.profiles;v_constraint text;
begin
 select * into v_person from public.profiles where id=p_user_id for update;
 if v_person.id is null or not public.is_dealer_admin(v_person.dealer_id) then
  raise exception 'Only an administrator for this dealer can update this account.';
 end if;
 if v_code is not null and p_role is distinct from 'ps' then raise exception 'Salesperson Code is for Product Specialists only.'; end if;
 if v_code is not null and exists(select 1 from public.profiles p where p.dealer_id=v_person.dealer_id and p.id<>p_user_id and p.salesperson_code=v_code)
   then raise exception 'This Salesperson Code is already assigned to another account in your company.'; end if;
 perform public.admin_update_profile(p_user_id,p_full_name,p_role,p_district_id,p_branch_id,p_assigned_brand);
 update public.profiles set salesperson_code=v_code where id=p_user_id;
exception when unique_violation then
 get stacked diagnostics v_constraint=constraint_name;
 if v_constraint='profiles_dealer_salesperson_code' then
  raise exception 'This Salesperson Code is already assigned to another account in your company.';
 end if;
 raise;
end$$;
revoke all on function public.admin_update_profile_with_sales_code(uuid,text,text,uuid,uuid,text,text) from public,anon;
grant execute on function public.admin_update_profile_with_sales_code(uuid,text,text,uuid,uuid,text,text) to authenticated;

-- A supplied source code is authoritative. Name/alias matching remains for code-free files.
do $$
declare definition text;old_text text;new_text text;
begin
 select replace(pg_get_functiondef('public.import_sales_history(uuid,text,text,jsonb)'::regprocedure),E'\r\n',E'\n') into definition;
 old_text:=$old$v_ps := public.history_ps_match(v_profile.dealer_id, v_branch, v_item ->> 'ps_name');$old$;
 new_text:=$new$if nullif(btrim(v_item->>'salespersoncode'),'') is not null then
      select p.id into v_ps from public.profiles p
      where p.dealer_id=v_profile.dealer_id and p.branch_id=v_branch and p.role='ps'
        and p.salesperson_code=btrim(v_item->>'salespersoncode');
    else
      v_ps := public.history_ps_match(v_profile.dealer_id, v_branch, v_item ->> 'ps_name');
    end if;$new$;
 if position(old_text in definition)=0 then raise exception 'Unsupported sales-history PS matching definition.';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:='ps_id, ps_name, customer_name, invoice_number, sold_on, payment_mode, import_batch_id)';
 if position(old_text in definition)=0 then raise exception 'Unsupported sales-history insert columns.';end if;
 definition:=replace(definition,old_text,'ps_id, ps_name, customer_name, invoice_number, sold_on, payment_mode, import_batch_id, salesperson_code)');
 old_text:=$old$nullif(btrim(v_item ->> 'payment_mode'), ''), p_batch$old$;
 if position(old_text in definition)=0 then raise exception 'Unsupported sales-history insert values.';end if;
 definition:=replace(definition,old_text,$new$nullif(btrim(v_item ->> 'payment_mode'), ''), p_batch, nullif(btrim(v_item->>'salespersoncode'),'')$new$);
 execute definition;
end$$;

create or replace function public.import_unified_sales_history(p_batch uuid,p_label text,p_file text,p_sales jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_result jsonb;v_dealer uuid;v_matched integer;
begin
 select dealer_id into v_dealer from public.profiles where id=auth.uid() and active and role='admin';
 if v_dealer is null then raise exception 'Only administrators can import sales history.';end if;
 if p_sales is null or jsonb_typeof(p_sales)<>'array' then raise exception 'Sales must be an array.';end if;
 if jsonb_array_length(p_sales)=0 or jsonb_array_length(p_sales)>200 then raise exception 'Import 1-200 invoices per step.';end if;
 v_result:=public.import_sales_history(p_batch,p_label,p_file,p_sales);
 select count(*) into v_matched from public.sales where import_batch_id=p_batch and dealer_id=v_dealer and ps_id is not null;
 return v_result||jsonb_build_object('batch_matched_ps',v_matched,'salesperson_codes_preserved',true);
end$$;
notify pgrst,'reload schema';
commit;
