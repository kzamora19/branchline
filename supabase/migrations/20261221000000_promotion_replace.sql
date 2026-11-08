begin;

create function public.import_new_priced_promotion(
  p_branch uuid, p_barcode text, p_description text, p_valid_from date, p_valid_to date,
  p_price_conflict boolean, p_source_name text, p_source_page integer, p_source_excerpt text,
  p_components jsonb, p_memo_srp numeric, p_tag_price numeric
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_branch is null or not public.can_manage_branch(p_branch) then
    raise exception 'An assigned manager, district manager or administrator must import this promotion.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_branch::text || ':' || coalesce(public.normalize_barcode(p_barcode),''),0));
  if exists(select 1 from public.reviewed_promotions where branch_id=p_branch
    and barcode=public.normalize_barcode(p_barcode) and revoked_at is null) then
    raise exception 'An active promotion already uses this barcode. Review before replacement.';
  end if;
  return public.review_priced_promotion(p_branch,p_barcode,p_description,p_valid_from,p_valid_to,
    p_price_conflict,p_source_name,p_source_page,p_source_excerpt,p_components,p_memo_srp,p_tag_price);
end $$;

create function public.replace_priced_promotion(
  p_old uuid, p_branch uuid, p_barcode text, p_description text, p_valid_from date, p_valid_to date,
  p_price_conflict boolean, p_source_name text, p_source_page integer, p_source_excerpt text,
  p_components jsonb, p_memo_srp numeric, p_tag_price numeric
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_old public.reviewed_promotions%rowtype;
  v_new uuid;
begin
  if p_branch is null or not public.can_manage_branch(p_branch) then
    raise exception 'The existing promotion is unavailable for replacement.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_branch::text || ':' || coalesce(public.normalize_barcode(p_barcode),''),0));
  select * into v_old from public.reviewed_promotions where id=p_old for update;
  if not found or v_old.revoked_at is not null or v_old.branch_id is distinct from p_branch
    or v_old.barcode is distinct from public.normalize_barcode(p_barcode)
    or not public.can_manage_branch(v_old.branch_id) or not public.is_dealer_member(v_old.dealer_id) then
    raise exception 'The existing promotion is unavailable for replacement.';
  end if;
  if exists(select 1 from public.reviewed_promotions
    where branch_id=p_branch and barcode=v_old.barcode and revoked_at is null and id<>p_old) then
    raise exception 'Multiple active offers use this barcode; retire the duplicates before replacing it.';
  end if;
  v_new:=public.review_priced_promotion(p_branch,p_barcode,p_description,p_valid_from,p_valid_to,
    p_price_conflict,p_source_name,p_source_page,p_source_excerpt,p_components,p_memo_srp,p_tag_price);
  update public.reviewed_promotions set revoked_by=auth.uid(),revoked_at=now() where id=p_old;
  return v_new;
end $$;
revoke all on function public.import_new_priced_promotion(uuid,text,text,date,date,boolean,text,integer,text,jsonb,numeric,numeric) from public,anon;
grant execute on function public.import_new_priced_promotion(uuid,text,text,date,date,boolean,text,integer,text,jsonb,numeric,numeric) to authenticated;
revoke all on function public.replace_priced_promotion(uuid,uuid,text,text,date,date,boolean,text,integer,text,jsonb,numeric,numeric) from public,anon;
grant execute on function public.replace_priced_promotion(uuid,uuid,text,text,date,date,boolean,text,integer,text,jsonb,numeric,numeric) to authenticated;
notify pgrst,'reload schema';
commit;
