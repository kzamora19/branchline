-- New employee unified invitation staging only. Existing accounts remain
-- untouched and do not receive SSO grants automatically.
create table if not exists public.unified_app_grants (
  sales_user_id uuid primary key references auth.users(id) on delete cascade,
  dealer_id uuid not null references public.dealers(id),
  sales_role text not null check (sales_role in ('manager','ps')),
  ptg_access text not null check (ptg_access in ('NONE','BRANCH_MANAGER','TEAM_LEADER')),
  ptg_user_id uuid unique,
  status text not null default 'PREPARED' check (status in ('PREPARED','LINKED','SENT','ACCEPTED','REVOKED')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  linked_at timestamptz,
  sent_at timestamptz,
  constraint unified_ptg_role_combination check (
    (sales_role='manager' and ptg_access in ('NONE','BRANCH_MANAGER'))
    or (sales_role='ps' and ptg_access in ('NONE','TEAM_LEADER'))
  )
);
create index if not exists unified_app_grants_dealer_idx
  on public.unified_app_grants(dealer_id,created_at desc);
alter table public.unified_app_grants enable row level security;
revoke all on public.unified_app_grants from public,anon,authenticated;
grant select,insert,update on public.unified_app_grants to service_role;
comment on table public.unified_app_grants is
  'New unified invitations only: Sales Auth is canonical, PTG app access is a separate validated grant. No passwords or tokens stored.';
