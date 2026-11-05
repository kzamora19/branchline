-- Evaluate membership and branch permissions on the small scope tables,
-- rather than running both permission functions for every product.
begin;

alter policy products_read_branch on public.products using (
  dealer_id in (
    select d.id from public.dealers d where public.is_dealer_member(d.id)
  )
  and branch_id in (
    select b.id from public.branches b where public.can_access_branch(b.id)
  )
);

commit;
