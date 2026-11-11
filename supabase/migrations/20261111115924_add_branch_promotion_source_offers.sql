-- Make campaign source offers searchable while inventory review is pending.
create table public.promotion_source_offers (
  branch_id uuid not null references public.branches(id) on delete cascade,
  source_key text not null,
  barcode text not null check (length(barcode) between 1 and 80),
  description text not null check (length(description) between 1 and 500),
  remarks text not null,
  source_name text not null,
  source_page integer not null check (source_page > 0),
  valid_from date,
  valid_to date,
  tag_price numeric(12,2) check (tag_price >= 0),
  installment_terms text not null,
  primary key (branch_id, source_key),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

alter table public.promotion_source_offers enable row level security;
revoke all on public.promotion_source_offers from public, anon, authenticated;
grant select on public.promotion_source_offers to authenticated;
create policy promotion_source_offers_read on public.promotion_source_offers for select to authenticated
  using (public.can_access_branch(branch_id));
notify pgrst, 'reload schema';
