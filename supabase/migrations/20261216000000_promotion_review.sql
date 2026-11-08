begin;

create table public.reviewed_promotions (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id),
  branch_id uuid not null references public.branches(id),
  barcode text not null check (length(btrim(barcode)) between 1 and 80),
  description text not null check (length(btrim(description)) between 1 and 500),
  valid_from date,
  valid_to date,
  price_conflict boolean not null,
  source_name text not null check (length(btrim(source_name)) between 1 and 255),
  source_page integer not null check (source_page between 1 and 100),
  source_excerpt text not null check (length(btrim(source_excerpt)) between 1 and 4000),
  components jsonb not null check (jsonb_typeof(components) = 'array' and jsonb_array_length(components) between 1 and 100),
  reviewed_by uuid not null references public.profiles(id),
  reviewed_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id),
  revoked_at timestamptz,
  check ((revoked_by is null) = (revoked_at is null)),
  check (valid_from is null or isfinite(valid_from)),
  check (valid_to is null or isfinite(valid_to)),
  check (valid_from is null or valid_to is null or valid_to >= valid_from)
);

create index reviewed_promotions_lookup on public.reviewed_promotions(branch_id,barcode,reviewed_at desc);
alter table public.reviewed_promotions enable row level security;
create policy reviewed_promotions_read on public.reviewed_promotions for select to authenticated
  using (public.is_dealer_member(dealer_id) and public.can_access_branch(branch_id)
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active
      and p.role in ('ps','manager','district_manager','admin')));
revoke all on public.reviewed_promotions from public,anon,authenticated;
grant select on public.reviewed_promotions to authenticated;

create function public.review_promotion(
  p_branch uuid, p_barcode text, p_description text, p_valid_from date, p_valid_to date,
  p_price_conflict boolean, p_source_name text, p_source_page integer, p_source_excerpt text,
  p_components jsonb
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_dealer uuid;
  v_id uuid;
  v_component jsonb;
  v_code text;
  v_qty integer;
  v_free boolean;
  v_srp numeric;
  v_paid_weight numeric:=0;
  v_components jsonb:='[]'::jsonb;
  v_ids text[]:='{}';
begin
  if p_branch is null or not public.can_manage_branch(p_branch) then
    raise exception 'An assigned manager, district manager or administrator must review this promotion.';
  end if;
  select dealer_id into v_dealer from public.branches where id=p_branch;
  if not found or not public.is_dealer_member(v_dealer) then raise exception 'The promotion branch is unavailable.'; end if;
  if p_barcode is null or length(btrim(p_barcode)) not between 1 and 80
    or p_description is null or length(btrim(p_description)) not between 1 and 500
    or p_price_conflict is null or p_source_name is null or length(btrim(p_source_name)) not between 1 and 255
    or p_source_page is null or p_source_page not between 1 and 100
    or p_source_excerpt is null or length(btrim(p_source_excerpt)) not between 1 and 4000
    or (p_valid_from is not null and not isfinite(p_valid_from))
    or (p_valid_to is not null and not isfinite(p_valid_to))
    or (p_valid_from is not null and p_valid_to is not null and p_valid_to<p_valid_from) then
    raise exception 'Enter a promotion barcode, description, source evidence, valid dates and price-conflict status.';
  end if;
  if p_components is null or jsonb_typeof(p_components) is distinct from 'array' then
    raise exception 'Provide reviewed bundle components.';
  end if;
  if jsonb_array_length(p_components) not between 1 and 100 then raise exception 'Provide 1 to 100 reviewed bundle components.'; end if;
  for v_component in select value from jsonb_array_elements(p_components) loop
    if jsonb_typeof(v_component) is distinct from 'object'
      or jsonb_typeof(v_component->'id') is distinct from 'string'
      or length(btrim(v_component->>'id')) not between 1 and 80
      or jsonb_typeof(v_component->'barcode') is distinct from 'string'
      or jsonb_typeof(v_component->'quantity') is distinct from 'number'
      or (v_component->>'quantity') !~ '^[1-9][0-9]{0,5}$'
      or jsonb_typeof(v_component->'free') is distinct from 'boolean' then
      raise exception 'Each component needs a unique ID, product barcode, positive whole quantity and paid/free status.';
    end if;
    if btrim(v_component->>'id')=any(v_ids) then raise exception 'Component IDs must be unique.'; end if;
    v_ids:=array_append(v_ids,btrim(v_component->>'id'));
    v_code:=public.normalize_barcode(v_component->>'barcode');
    v_qty:=(v_component->>'quantity')::integer;
    v_free:=(v_component->>'free')::boolean;
    select srp into v_srp from public.products
      where dealer_id=v_dealer and branch_id=p_branch and barcode=v_code and active;
    if not found then raise exception 'Component barcode % is not active in the branch catalog.',v_code; end if;
    if not v_free and v_srp is null then raise exception 'Paid component % needs a standard SRP.',v_code; end if;
    if not v_free then v_paid_weight:=v_paid_weight+v_srp*v_qty; end if;
    v_components:=v_components||jsonb_build_array(jsonb_build_object(
      'id',btrim(v_component->>'id'),'barcode',v_code,'quantity',v_qty,'free',v_free));
  end loop;
  if v_paid_weight<=0 then raise exception 'Paid components need a positive combined SRP for price allocation.'; end if;
  insert into public.reviewed_promotions(dealer_id,branch_id,barcode,description,valid_from,valid_to,price_conflict,
    source_name,source_page,source_excerpt,components,reviewed_by)
  values(v_dealer,p_branch,public.normalize_barcode(p_barcode),btrim(p_description),p_valid_from,p_valid_to,
    p_price_conflict,btrim(p_source_name),p_source_page,btrim(p_source_excerpt),v_components,auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.revoke_promotion(p_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_promo public.reviewed_promotions%rowtype;
begin
  select * into v_promo from public.reviewed_promotions where id=p_id for update;
  if not found or not public.can_manage_branch(v_promo.branch_id) or not public.is_dealer_member(v_promo.dealer_id) then
    raise exception 'An assigned manager, district manager or administrator must retire this promotion.';
  end if;
  update public.reviewed_promotions set revoked_by=auth.uid(),revoked_at=now() where id=p_id and revoked_at is null;
end $$;

revoke all on function public.review_promotion(uuid,text,text,date,date,boolean,text,integer,text,jsonb) from public,anon;
revoke all on function public.revoke_promotion(uuid) from public,anon;
grant execute on function public.review_promotion(uuid,text,text,date,date,boolean,text,integer,text,jsonb) to authenticated;
grant execute on function public.revoke_promotion(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
