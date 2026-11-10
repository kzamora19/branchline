create table public.sales_account_invitations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  accepted_at timestamptz
);

alter table public.sales_account_invitations enable row level security;
revoke all on public.sales_account_invitations from public, anon, authenticated;
grant select, update on public.sales_account_invitations to service_role;

create function public.stage_sales_account_invitation(invited_user uuid, invitation_hash text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update auth.users set banned_until = '2099-01-01T00:00:00Z'::timestamptz
    where id = invited_user and banned_until is null;
  if not found then
    raise exception 'Unable to hold the new account for invitation acceptance';
  end if;
  insert into public.sales_account_invitations (user_id, token_hash, expires_at)
    values (invited_user, invitation_hash, now() + interval '48 hours');
end;
$$;

create function public.accept_sales_account_invitation(invitation_hash text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  invited_user uuid;
begin
  select i.user_id into invited_user
    from public.sales_account_invitations i
    join public.profiles p on p.id = i.user_id
    where i.token_hash = invitation_hash and i.accepted_at is null
      and i.expires_at > now() and p.active
    for update of i;
  if not found then
    return false;
  end if;
  update auth.users set banned_until = null
    where id = invited_user and banned_until = '2099-01-01T00:00:00Z'::timestamptz;
  if not found then
    return false;
  end if;
  update public.sales_account_invitations set accepted_at = now() where user_id = invited_user;
  return true;
end;
$$;

revoke all on function public.stage_sales_account_invitation(uuid, text) from public, anon, authenticated;
revoke all on function public.accept_sales_account_invitation(text) from public, anon, authenticated;
grant execute on function public.stage_sales_account_invitation(uuid, text) to service_role;
grant execute on function public.accept_sales_account_invitation(text) to service_role;
