create schema if not exists branchline_customer_private;
revoke all on schema branchline_customer_private from public, anon, authenticated;
grant usage on schema branchline_customer_private to authenticated;

create table public.customer_master_records (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  name text not null,
  barangay text not null default '',
  city text not null default '',
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  unique (branch_id, id)
);

create table public.customer_master_aliases (
  branch_id uuid not null,
  identity_key text[] not null check (cardinality(identity_key) = 3),
  customer_id uuid not null,
  primary key (branch_id, identity_key),
  foreign key (branch_id, customer_id) references public.customer_master_records(branch_id, id)
);
create index customer_master_aliases_customer_idx on public.customer_master_aliases(branch_id, customer_id);

alter table public.customer_master_records enable row level security;
alter table public.customer_master_aliases enable row level security;
revoke all on public.customer_master_records, public.customer_master_aliases from public, anon, authenticated;
grant select on public.customer_master_records, public.customer_master_aliases to authenticated;

create policy customer_master_records_branch_read on public.customer_master_records
  for select to authenticated using (public.can_manage_branch(branch_id));
create policy customer_master_aliases_branch_read on public.customer_master_aliases
  for select to authenticated using (public.can_manage_branch(branch_id));

create function branchline_customer_private.normalized_text(p_value text)
returns text language sql immutable set search_path = ''
as $function$
  select lower(btrim(regexp_replace(translate(normalize(coalesce(p_value, ''), NFKC), '’''', ''),
    '[[:space:]]+', ' ', 'g')));
$function$;

create function branchline_customer_private.sale_identity(p_branch_code text, p_name text, p_barangay text, p_city text)
returns text[] language sql immutable set search_path = ''
as $function$
  select case when p_branch_code = 'STG' and branchline_customer_private.normalized_text(p_name) in
    ('jelos', 'jelos airconditioning and refrigeration', 'jelos airconditioning and refrigerator')
  then array['jelos airconditioning and refrigeration', 'maligaya', 'echague, isabela']
  else array[branchline_customer_private.normalized_text(p_name),
    branchline_customer_private.normalized_text(p_barangay), branchline_customer_private.normalized_text(p_city)] end;
$function$;

create function branchline_customer_private.customer_has_purchases(p_branch uuid, p_code text, p_identity text[])
returns boolean language sql stable set search_path = ''
as $function$
  select exists (
    select 1 from public.sales s
    where s.branch_id = p_branch and s.invoice_number !~* '^RET-'
      and branchline_customer_private.sale_identity(p_code, s.customer_name, s.barangay, s.city) = p_identity
  );
$function$;

create function branchline_customer_private.update_customer_master(
  p_branch uuid, p_keep text[], p_combine text[], p_name text, p_barangay text, p_city text
) returns text[]
language plpgsql security definer set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  branch_code text;
  keep_id uuid;
  combine_id uuid;
  existing_id uuid;
  new_key text[];
  name_value text := btrim(coalesce(p_name, ''));
  barangay_value text := btrim(coalesce(p_barangay, ''));
  city_value text := btrim(coalesce(p_city, ''));
begin
  if actor is null or not public.can_manage_branch(p_branch) then
    raise exception 'You cannot edit customers for this branch.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_keep), 0) <> 3 or (p_combine is not null and cardinality(p_combine) <> 3)
    or p_keep = p_combine or name_value = '' or length(name_value) > 200
    or length(barangay_value) > 200 or length(city_value) > 200 then
    raise exception 'Check the customer name, address, and selected records.' using errcode = '22023';
  end if;
  select code into branch_code from public.branches where id = p_branch;
  perform pg_advisory_xact_lock(hashtextextended('branchline-customer-master:' || p_branch::text, 0));
  new_key := array[branchline_customer_private.normalized_text(name_value),
    branchline_customer_private.normalized_text(barangay_value), branchline_customer_private.normalized_text(city_value)];
  if new_key[1] = '' then
    raise exception 'Enter a customer name.' using errcode = '22023';
  end if;

  select customer_id into keep_id from public.customer_master_aliases where branch_id = p_branch and identity_key = p_keep;
  if keep_id is null then
    if not branchline_customer_private.customer_has_purchases(p_branch, branch_code, p_keep) then
      raise exception 'The customer record changed. Refresh Customer Master and try again.';
    end if;
  elsif not exists (
    select 1 from public.customer_master_records r where r.id = keep_id
      and array[branchline_customer_private.normalized_text(r.name), branchline_customer_private.normalized_text(r.barangay),
        branchline_customer_private.normalized_text(r.city)] = p_keep
  ) then
    raise exception 'The customer record changed. Refresh Customer Master and try again.';
  end if;

  if p_combine is not null then
    select customer_id into combine_id from public.customer_master_aliases where branch_id = p_branch and identity_key = p_combine;
    if combine_id is null then
      if not branchline_customer_private.customer_has_purchases(p_branch, branch_code, p_combine) then
        raise exception 'The duplicate record changed. Refresh Customer Master and try again.';
      end if;
    elsif combine_id = keep_id or not exists (
      select 1 from public.customer_master_records r where r.id = combine_id
        and array[branchline_customer_private.normalized_text(r.name), branchline_customer_private.normalized_text(r.barangay),
          branchline_customer_private.normalized_text(r.city)] = p_combine
    ) then
      raise exception 'The duplicate record changed. Refresh Customer Master and try again.';
    end if;
  end if;

  select customer_id into existing_id from public.customer_master_aliases where branch_id = p_branch and identity_key = new_key;
  if (existing_id is not null and existing_id is distinct from keep_id and existing_id is distinct from combine_id)
    or (existing_id is null and new_key <> p_keep and new_key is distinct from p_combine
      and branchline_customer_private.customer_has_purchases(p_branch, branch_code, new_key)) then
    raise exception 'Those details match another customer. Select that customer in Combine.';
  end if;

  if keep_id is null then
    insert into public.customer_master_records(branch_id, name, barangay, city, updated_by)
      values(p_branch, name_value, barangay_value, city_value, actor) returning id into keep_id;
  else
    update public.customer_master_records set name = name_value, barangay = barangay_value, city = city_value,
      updated_by = actor, updated_at = now() where branch_id = p_branch and id = keep_id;
  end if;
  if combine_id is not null then
    update public.customer_master_aliases set customer_id = keep_id where branch_id = p_branch and customer_id = combine_id;
  end if;
  insert into public.customer_master_aliases(branch_id, identity_key, customer_id)
    select distinct p_branch, identity_key, keep_id
    from (values (p_keep), (p_combine), (new_key)) as selected(identity_key)
    where identity_key is not null
    on conflict (branch_id, identity_key) do update set customer_id = excluded.customer_id;
  return new_key;
end;
$function$;

revoke all on all functions in schema branchline_customer_private from public, anon, authenticated;
grant execute on function branchline_customer_private.update_customer_master(uuid, text[], text[], text, text, text) to authenticated;

create function public.update_customer_master(
  p_branch uuid, p_keep text[], p_combine text[], p_name text, p_barangay text, p_city text
) returns text[]
language sql security invoker set search_path = ''
as $function$
  select branchline_customer_private.update_customer_master(p_branch, p_keep, p_combine, p_name, p_barangay, p_city);
$function$;
revoke all on function public.update_customer_master(uuid, text[], text[], text, text, text) from public, anon;
grant execute on function public.update_customer_master(uuid, text[], text[], text, text, text) to authenticated;

create or replace function public.branch_sale_customer_suggestions(p_branch uuid, p_query text)
returns table (customer_name text, barangay text, city text, sold_on date)
language sql stable security definer set search_path = ''
as $function$
  with input as (
    select branchline_customer_private.normalized_text(p_query) as needle
  ), customers as (
    select coalesce(r.name, case when source.legacy_alias then 'Jelo’s Airconditioning and Refrigeration' end, btrim(s.customer_name)) as name,
      coalesce(r.barangay, case when source.legacy_alias then 'Maligaya' end, btrim(s.barangay), '') as barangay,
      coalesce(r.city, case when source.legacy_alias then 'Echague, Isabela' end, btrim(s.city), '') as city, s.sold_on
    from public.sales s
    join public.branches b on b.id = s.branch_id and b.dealer_id = s.dealer_id
    left join public.profiles ps on ps.id = s.ps_id
    cross join lateral (
      select branchline_customer_private.sale_identity(b.code, s.customer_name, s.barangay, s.city) as identity_key,
        b.code = 'STG' and branchline_customer_private.normalized_text(s.customer_name) in
          ('jelos', 'jelos airconditioning and refrigeration', 'jelos airconditioning and refrigerator') as legacy_alias
    ) source
    left join public.customer_master_aliases a on a.branch_id = b.id and
      a.identity_key = source.identity_key
    left join public.customer_master_records r on r.branch_id = a.branch_id and r.id = a.customer_id
    cross join input i
    where b.id = p_branch and auth.uid() is not null
      and (public.is_active_ps_for_branch(p_branch) or public.can_manage_branch(p_branch))
      and length(i.needle) between 2 and 100
      and (strpos(branchline_customer_private.normalized_text(s.customer_name), i.needle) > 0
        or strpos(branchline_customer_private.normalized_text(r.name), i.needle) > 0)
      and s.invoice_number !~* '^(RET-|[[:space:]]*test([^a-z]|$))'
      and s.customer_name !~* '^[[:space:]]*test([^a-z]|$)'
      and coalesce(ps.full_name, '') !~* '^[[:space:]]*test([^a-z]|$)'
      and coalesce(ps.login_id, '') !~* '^[[:space:]]*test([^a-z]|$)'
  ), newest as (
    select distinct on (lower(c.name), lower(c.barangay), lower(c.city)) c.*
    from customers c
    order by lower(c.name), lower(c.barangay), lower(c.city), c.sold_on desc, c.name
  )
  select n.name, n.barangay, n.city, n.sold_on
  from newest n cross join input i
  order by (branchline_customer_private.normalized_text(n.name) = i.needle) desc,
    (n.barangay <> '' and n.city <> '') desc, n.sold_on desc, n.name
  limit 20;
$function$;

notify pgrst, 'reload schema';
