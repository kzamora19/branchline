begin;
create or replace function public.inventory_validate_source_branch(p_branch uuid,p_items jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_branch public.branches; v_item jsonb; v_location text; v_code text; v_name text;
begin
  -- Older clients omit provenance. Current importers attach it to every item.
  if not exists(select 1 from jsonb_array_elements(p_items) x where x ? 'source_location') then return; end if;
  select * into v_branch from public.branches where id=p_branch;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_location:=btrim(coalesce(v_item->>'source_location',''));
    v_code:=substring(v_location from '^([a-zA-Z][a-zA-Z0-9]{1,19})\s*-\s*');
    v_name:=regexp_replace(v_location,'^[a-zA-Z][a-zA-Z0-9]{1,19}\s*-\s*','');
    v_name:=regexp_replace(regexp_replace(regexp_replace(lower(v_name),'\s*\(demo\)$',''),'^(1st\s+)?megasaver\s+',''),'[^a-z0-9]','','g');
    if v_location='' or v_branch.id is null or not (
      (nullif(btrim(v_branch.code),'') is not null and upper(v_location)=upper(btrim(v_branch.code)))
      or (v_name<>'' and v_name=regexp_replace(regexp_replace(regexp_replace(lower(btrim(v_branch.name)),'\s*\(demo\)$',''),'^(1st\s+)?megasaver\s+',''),'[^a-z0-9]','','g')
        and (v_code is null or nullif(btrim(v_branch.code),'') is null or upper(v_code)=upper(btrim(v_branch.code))))
    ) then
      raise exception 'Report location "%" does not match selected branch "%". Select the matching branch or correct its name/code before importing.',v_location,coalesce(v_branch.name,'(none)');
    end if;
  end loop;
end;
$$;
revoke all on function public.inventory_validate_source_branch(uuid,jsonb) from public,anon,authenticated;
do $$
declare v_api text; v_definition text;
  v_anchor text:='if jsonb_array_length(p_items)=0 then raise exception ''The stock report is empty.''; end if;';
  v_call text:='perform public.inventory_validate_source_branch(p_branch,p_items);';
begin
  foreach v_api in array array['public.import_inventory(uuid,timestamptz,text,jsonb)','public.import_unified_inventory(uuid,timestamptz,text,jsonb)'] loop
    v_definition:=replace(pg_get_functiondef(v_api::regprocedure),chr(13),'');
    if position(v_call in v_definition)>0 then continue; end if;
    if position(v_anchor in v_definition)=0 then raise exception 'Unsupported inventory import definition: %',v_api; end if;
    execute replace(v_definition,v_anchor,v_anchor||chr(10)||'  '||v_call);
  end loop;
end;
$$;
notify pgrst,'reload schema';
commit;
