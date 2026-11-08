begin;

create table public.sale_promotion_groups (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  promotion_id uuid not null references public.reviewed_promotions(id) on delete restrict,
  barcode text not null,
  description text not null,
  bundle_total numeric(12,2) not null check(bundle_total >= 0),
  source_snapshot jsonb not null check(jsonb_typeof(source_snapshot)='object'),
  unique(id,sale_id)
);

create table public.sale_promotion_lines (
  group_id uuid not null,
  sale_id uuid not null,
  line_id uuid not null unique references public.sale_lines(id) on delete restrict,
  component_id text not null check(length(btrim(component_id)) between 1 and 80),
  free boolean not null,
  primary key(group_id,line_id),
  foreign key(group_id,sale_id) references public.sale_promotion_groups(id,sale_id) on delete restrict
);
create index sale_promotion_groups_sale on public.sale_promotion_groups(sale_id);

alter table public.sale_promotion_groups enable row level security;
alter table public.sale_promotion_lines enable row level security;
create policy sale_promotion_groups_read on public.sale_promotion_groups for select to authenticated
  using(exists(select 1 from public.sales s where s.id=sale_id));
create policy sale_promotion_lines_read on public.sale_promotion_lines for select to authenticated
  using(exists(select 1 from public.sales s where s.id=sale_id));
revoke all on public.sale_promotion_groups,public.sale_promotion_lines from public,anon,authenticated;
grant select on public.sale_promotion_groups,public.sale_promotion_lines to authenticated;

create function public.check_promotion_line_sale()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.sale_lines l where l.id=new.line_id and l.sale_id=new.sale_id and l.quantity>0) then
    raise exception 'A bundle component must belong to its original positive sale line.';
  end if;
  return new;
end $$;
create trigger check_promotion_line_sale before insert or update on public.sale_promotion_lines
  for each row execute function public.check_promotion_line_sale();

create function public.guard_promotion_sale_edit()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.sale_promotion_groups g where g.sale_id=old.id) then
    raise exception 'A sale containing a bundle cannot be edited or deleted; return the complete bundle instead.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger a_guard_promotion_sale before update or delete on public.sales
  for each row execute function public.guard_promotion_sale_edit();

create function public.guard_promotion_line_edit()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.sale_promotion_lines p where p.line_id=old.id) then
    raise exception 'Bundle product lines cannot be edited or deleted.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger a_guard_promotion_line before update or delete on public.sale_lines
  for each row execute function public.guard_promotion_line_edit();

create function public.guard_whole_promotion_return()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_group uuid; v_line record; v_count integer; v_qty text;
begin
  if jsonb_typeof(new.request_payload->'lines') is distinct from 'array' then
    raise exception 'Return selections must be an array.';
  end if;
  for v_group in
    select distinct p.group_id from public.sale_promotion_lines p
    join jsonb_array_elements(new.request_payload->'lines') x on x->>'line_id'=p.line_id::text
    where p.sale_id=new.source_sale_id
  loop
    for v_line in
      select l.id,l.quantity from public.sale_promotion_lines p
      join public.sale_lines l on l.id=p.line_id and l.sale_id=p.sale_id
      where p.group_id=v_group and p.sale_id=new.source_sale_id
    loop
      select count(*),min(x->>'quantity') into v_count,v_qty
      from jsonb_array_elements(new.request_payload->'lines') x where x->>'line_id'=v_line.id::text;
      if v_count<>1 or v_qty is distinct from v_line.quantity::text
        or exists(select 1 from public.sales_return_lines r where r.source_line_id=v_line.id) then
        raise exception 'Return every item in the complete bundle together.';
      end if;
    end loop;
  end loop;
  return new;
end $$;
create trigger a_guard_whole_promotion_return before insert on public.sales_returns
  for each row execute function public.guard_whole_promotion_return();

revoke all on function public.check_promotion_line_sale(),public.guard_promotion_sale_edit(),
  public.guard_promotion_line_edit(),public.guard_whole_promotion_return() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
