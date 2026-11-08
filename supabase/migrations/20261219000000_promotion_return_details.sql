begin;

alter function public.return_sale_details(uuid) rename to return_sale_details_without_promotions;
revoke all on function public.return_sale_details_without_promotions(uuid) from public,anon,authenticated;

create function public.return_sale_details(p_sale uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_result jsonb; v_lines jsonb;
begin
  v_result:=public.return_sale_details_without_promotions(p_sale);
  select coalesce(jsonb_agg(x.value||case when g.id is null then '{}'::jsonb else jsonb_build_object(
    'promotion_group',g.id,'promotion_barcode',g.barcode,'promotion_description',g.description,
    'promotion_free',p.free) end order by x.ordinality),'[]'::jsonb) into v_lines
  from jsonb_array_elements(v_result->'lines') with ordinality x(value,ordinality)
  left join public.sale_promotion_lines p on p.line_id::text=x.value->>'id' and p.sale_id=p_sale
  left join public.sale_promotion_groups g on g.id=p.group_id and g.sale_id=p_sale;
  return jsonb_set(v_result,'{lines}',v_lines);
end $$;
revoke all on function public.return_sale_details(uuid) from public,anon;
grant execute on function public.return_sale_details(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
