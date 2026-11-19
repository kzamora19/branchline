-- Require complete location on future Customer Master saves, without altering
-- historical sales or customer records that currently have blank addresses.
-- Preserve existing security invoker execution and branch authorization
-- delegated to branchline_customer_private.update_customer_master.
create or replace function public.update_customer_master(
  p_branch uuid, p_keep text[], p_combine text[],
  p_name text, p_barangay text, p_city text)
returns text[]
language plpgsql
security invoker
set search_path to ''
as $fn$
begin
  if nullif(btrim(coalesce(p_barangay, '')), '') is null
    or nullif(btrim(coalesce(p_city, '')), '') is null then
    raise exception 'Barangay and City / municipality are required.'
      using errcode = '22023';
  end if;
  return branchline_customer_private.update_customer_master(
    p_branch, p_keep, p_combine, p_name, p_barangay, p_city);
end;
$fn$;
