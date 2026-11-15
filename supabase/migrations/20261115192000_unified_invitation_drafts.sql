-- Safe foundation for ONE Branchline identity and two independent app grants.
-- DRAFT ONLY: no Auth user, password, email invitation, or app grant is created.
-- Keep existing Sales Tracker and PTG accounts untouched until a separate
-- reconciliation/migration is explicitly approved.

create table if not exists public.unified_invitation_drafts (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 140),
  email text not null check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(email) <= 254),
  login_id text not null check (char_length(btrim(login_id)) between 3 and 80),
  job_title text not null check (job_title in (
    'PRODUCT_SPECIALIST','TEAM_LEADER','BRANCH_MANAGER','DISTRICT_MANAGER',
    'INVENTORY_CONTROLLER','STOCK_CUSTODIAN')),
  sales_role text not null check (sales_role in (
    'ps','manager','district_manager','inventory_controller','stock_custodian')),
  branch_id uuid references public.branches(id),
  assigned_brand text,
  salesperson_code text,
  ptg_role text check (ptg_role in (
    'TEAM_LEADER','BRANCH_MANAGER','BRANCH_ADMIN','SYSTEM_ADMIN')),
  status text not null default 'DRAFT' check (status = 'DRAFT'),
  created_at timestamptz not null default now(),
  constraint unified_title_sales_role check (
    (job_title in ('PRODUCT_SPECIALIST','TEAM_LEADER') and sales_role = 'ps')
    or (job_title = 'BRANCH_MANAGER' and sales_role = 'manager')
    or (job_title = 'DISTRICT_MANAGER' and sales_role = 'district_manager')
    or (job_title = 'INVENTORY_CONTROLLER' and sales_role = 'inventory_controller')
    or (job_title = 'STOCK_CUSTODIAN' and sales_role = 'stock_custodian')
  ),
  constraint unified_ptg_eligibility check (
    (job_title in ('PRODUCT_SPECIALIST','INVENTORY_CONTROLLER','STOCK_CUSTODIAN') and ptg_role is null)
    or (job_title = 'TEAM_LEADER' and (ptg_role is null or ptg_role = 'TEAM_LEADER'))
    or (job_title = 'BRANCH_MANAGER' and (ptg_role is null or ptg_role in ('BRANCH_MANAGER','BRANCH_ADMIN')))
    or (job_title = 'DISTRICT_MANAGER' and ptg_role is null)
  ),
  constraint unified_sales_branch_required check (
    (sales_role = 'district_manager' and branch_id is null)
    or (sales_role <> 'district_manager' and branch_id is not null)
  ),
  constraint unified_ps_fields check (
    sales_role <> 'ps' or
    (nullif(btrim(coalesce(assigned_brand,'')), '') is not null
      and nullif(btrim(coalesce(salesperson_code,'')), '') is not null)
  )
);
create unique index if not exists unified_invite_email_drafts
  on public.unified_invitation_drafts (dealer_id, lower(email));
create index if not exists unified_invitation_creator
  on public.unified_invitation_drafts (created_by, created_at desc);
alter table public.unified_invitation_drafts enable row level security;
revoke all on public.unified_invitation_drafts from public, anon, authenticated;
grant select, insert, delete on public.unified_invitation_drafts to authenticated;
grant all on public.unified_invitation_drafts to service_role;

-- DRAFT management is permitted only to active Sales Tracker administrators
-- of the same dealer. Public clients can NEVER set status to SENT/ACTIVATED.
create policy unified_drafts_read on public.unified_invitation_drafts
  for select to authenticated using (
    exists (select 1 from public.profiles me
      where me.id=(select auth.uid()) and me.active=true
        and me.role='admin' and me.dealer_id=dealer_id)
  );
create policy unified_drafts_insert on public.unified_invitation_drafts
  for insert to authenticated with check (
    created_by=(select auth.uid()) and
    exists (select 1 from public.profiles me
      where me.id=(select auth.uid()) and me.active=true
        and me.role='admin' and me.dealer_id=dealer_id)
    and not exists (select 1 from public.profiles target
      where target.dealer_id=dealer_id
      and (lower(coalesce(target.email,''))=email
        or lower(coalesce(target.login_id,''))=lower(login_id)))
    and (branch_id is null or exists (
      select 1 from public.branches b where b.id=branch_id and b.dealer_id=dealer_id))
  );
create policy unified_drafts_delete on public.unified_invitation_drafts
  for delete to authenticated using (
    created_by=(select auth.uid()) and
    exists (select 1 from public.profiles me
      where me.id=(select auth.uid()) and me.active=true
        and me.role='admin' and me.dealer_id=dealer_id)
  );

comment on table public.unified_invitation_drafts is
 'Unified new-account invitation proposals only. No invitation emails, PTG/Sales accounts, or SSO credentials are created by these records.';
