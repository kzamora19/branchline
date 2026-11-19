-- Keep calendar announcements visible only within a user's existing
-- authorized branch scope. Inventory-only roles use a different branch
-- permission function than PS/management users.
alter policy calendar_event_read on public.calendar_events
using (
  public.is_dealer_member(dealer_id)
  and (
    cardinality(branch_ids) = 0
    or exists (
      select 1
      from unnest(calendar_events.branch_ids) as event_branch(id)
      where public.can_access_branch(event_branch.id)
         or public.can_access_inventory(event_branch.id)
    )
  )
);
