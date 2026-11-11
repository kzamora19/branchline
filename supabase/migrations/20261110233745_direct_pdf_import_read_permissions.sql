create or replace function public.import_source_priced_promotions(p_branch uuid, p_offers jsonb)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare
  v_offer jsonb;
  v_existing record;
  v_code text;
  v_imported integer := 0;
  v_skipped integer := 0;
begin
  if auth.uid() is null or p_branch is null or not public.can_manage_branch(p_branch) then
    raise exception 'A branch manager, district manager or administrator must import these promotions.';
  end if;
  if p_offers is null or jsonb_typeof(p_offers) is distinct from 'array' then
    raise exception 'Provide a promotion offer array.';
  end if;
  if jsonb_array_length(p_offers) not between 1 and 1000 then
    raise exception 'Provide between 1 and 1000 promotion offers.';
  end if;
  for v_offer in
    select value from jsonb_array_elements(p_offers)
    order by value->>'p_source_name',value->>'p_source_page',value->>'p_source_excerpt',value->>'p_barcode'
  loop
    v_code := public.normalize_barcode(v_offer->>'p_barcode');
    perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_branch::text,
      v_code,v_offer->>'p_source_name',v_offer->>'p_source_page',v_offer->>'p_source_excerpt'),0));
    select * into v_existing from public.reviewed_promotions
      where branch_id=p_branch and barcode=v_code and revoked_at is null
        and source_name=v_offer->>'p_source_name'
        and source_page=(v_offer->>'p_source_page')::integer
        and source_excerpt=v_offer->>'p_source_excerpt'
      order by reviewed_at desc,id
      limit 1;
    if found then
      if v_existing.tag_price is distinct from (v_offer->>'p_tag_price')::numeric
        or v_existing.memo_srp is distinct from (v_offer->>'p_memo_srp')::numeric
        or v_existing.valid_from is distinct from (v_offer->>'p_valid_from')::date
        or v_existing.valid_to is distinct from (v_offer->>'p_valid_to')::date
        or v_existing.components is distinct from v_offer->'p_components'
        or v_existing.description is distinct from btrim(v_offer->>'p_description')
        or v_existing.price_conflict is distinct from (v_offer->>'p_price_conflict')::boolean then
        raise exception 'This source row was already imported with different reviewed details. Review its existing promotion before replacement.';
      end if;
      v_skipped := v_skipped + 1;
    else
      perform public.review_priced_promotion(p_branch,v_code,v_offer->>'p_description',
        (v_offer->>'p_valid_from')::date,(v_offer->>'p_valid_to')::date,
        (v_offer->>'p_price_conflict')::boolean,v_offer->>'p_source_name',
        (v_offer->>'p_source_page')::integer,v_offer->>'p_source_excerpt',
        v_offer->'p_components',(v_offer->>'p_memo_srp')::numeric,(v_offer->>'p_tag_price')::numeric);
      v_imported := v_imported + 1;
    end if;
  end loop;
  return jsonb_build_object('imported',v_imported,'skipped',v_skipped);
end $$;
revoke all on function public.import_source_priced_promotions(uuid,jsonb) from public,anon;
grant execute on function public.import_source_priced_promotions(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
