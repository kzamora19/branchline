-- Canonical catalog brand lookups are repeated while resolving peer PS scopes.
-- Match the existing dealer + brand-key predicate without changing routing.
begin;

create index if not exists products_dealer_brand_key_idx
  on public.products (dealer_id, public.brand_key(brand));

commit;
