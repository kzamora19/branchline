-- Exact names win; only the three confirmed aliases may use a unique branch match.
begin;
create or replace function public.history_ps_alias_key(p_name text)
returns text language sql immutable set search_path=pg_catalog as $$
  select case public.history_name_key(p_name)
    when 'vermont jay montalban' then 'vermont montalban'
    when 'rhyan jhay joson' then 'ryan joson'
    when 'jason everly palarca' then 'jason palarca'
    else public.history_name_key(p_name)
  end;
$$;
revoke all on function public.history_ps_alias_key(text) from public,anon,authenticated;

create or replace function public.history_ps_match(p_dealer uuid,p_branch uuid,p_name text)
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_key text; v_match uuid; v_count integer;
begin
  v_key:=public.history_name_key(p_name);
  if v_key='' then return null; end if;
  select p.id into v_match from public.profiles p
  where p.dealer_id=p_dealer and p.branch_id=p_branch and p.role='ps'
    and public.history_name_key(p.full_name)=v_key
  order by p.active desc,p.created_at limit 1;
  if v_match is not null then return v_match; end if;

  v_key:=public.history_ps_alias_key(p_name);
  select count(*) into v_count from public.profiles p
  where p.dealer_id=p_dealer and p.branch_id=p_branch and p.role='ps'
    and public.history_ps_alias_key(p.full_name)=v_key;
  if v_count<>1 then return null; end if;
  select p.id into v_match from public.profiles p
  where p.dealer_id=p_dealer and p.branch_id=p_branch and p.role='ps'
    and public.history_ps_alias_key(p.full_name)=v_key;
  return v_match;
end;
$$;
revoke all on function public.history_ps_match(uuid,uuid,text) from public,anon,authenticated;

do $$
declare definition text; old_text text; new_text text;
begin
  select replace(pg_get_functiondef('public.import_sales_history(uuid,text,text,jsonb)'::regprocedure),E'\r\n',E'\n') into definition;
  old_text:=$old$v_ps := null;
    v_key := public.history_name_key(v_item ->> 'ps_name');
    if v_key <> '' then
      select p.id into v_ps
      from public.profiles p
      where p.dealer_id = v_profile.dealer_id and p.branch_id = v_branch and p.role = 'ps'
        and public.history_name_key(p.full_name) = v_key
      order by p.active desc, p.created_at
      limit 1;
    end if;$old$;
  old_text:=replace(old_text,E'\r\n',E'\n');
  new_text:=$new$v_ps := public.history_ps_match(v_profile.dealer_id, v_branch, v_item ->> 'ps_name');$new$;
  if position(old_text in definition)>0 then
    execute replace(definition,old_text,new_text);
  elsif position(new_text in definition)=0 then
    raise exception 'Unsupported sales-history PS matching definition';
  end if;
end;
$$;
-- Existing imported links require a separately backed-up, approved data repair.
notify pgrst,'reload schema';
commit;
