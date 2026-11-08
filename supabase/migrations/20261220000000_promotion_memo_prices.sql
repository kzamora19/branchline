begin;

alter table public.reviewed_promotions
  add column memo_srp numeric(12,2),
  add column tag_price numeric(12,2),
  add constraint reviewed_promotions_memo_srp_valid check (memo_srp is null or (memo_srp >= 0 and memo_srp <> 'NaN'::numeric)),
  add constraint reviewed_promotions_tag_price_valid check (tag_price is null or (tag_price >= 0 and tag_price <> 'NaN'::numeric));

create function public.review_priced_promotion(
  p_branch uuid, p_barcode text, p_description text, p_valid_from date, p_valid_to date,
  p_price_conflict boolean, p_source_name text, p_source_page integer, p_source_excerpt text,
  p_components jsonb, p_memo_srp numeric, p_tag_price numeric
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
  if p_tag_price is null or p_tag_price < 0 or p_tag_price > 9999999999.99
    or p_tag_price in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
    or p_tag_price <> round(p_tag_price,2)
    or (p_memo_srp is not null and (p_memo_srp < 0 or p_memo_srp > 9999999999.99
      or p_memo_srp in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
      or p_memo_srp <> round(p_memo_srp,2))) then
    raise exception 'Enter a valid memo tag price and, if supplied, memo SRP.';
  end if;
  v_id := public.review_promotion(p_branch,p_barcode,p_description,p_valid_from,p_valid_to,
    p_price_conflict,p_source_name,p_source_page,p_source_excerpt,p_components);
  update public.reviewed_promotions set memo_srp=p_memo_srp, tag_price=p_tag_price where id=v_id;
  return v_id;
end $$;
revoke all on function public.review_priced_promotion(uuid,text,text,date,date,boolean,text,integer,text,jsonb,numeric,numeric) from public,anon;
grant execute on function public.review_priced_promotion(uuid,text,text,date,date,boolean,text,integer,text,jsonb,numeric,numeric) to authenticated;
notify pgrst,'reload schema';
commit;
