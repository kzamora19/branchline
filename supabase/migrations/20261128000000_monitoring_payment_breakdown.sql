-- Store verified monitoring channels separately from the original invoice payment labels.
alter table public.branch_daily_history
  add column if not exists payment_breakdown jsonb
  check (payment_breakdown is null or jsonb_typeof(payment_breakdown) = 'object');

create or replace function public.import_daily_history_with_payments(
  p_batch uuid, p_label text, p_file text, p_branch uuid, p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
  v_row jsonb;
  v_item record;
  v_sum numeric;
  v_result jsonb;
  v_updated integer;
  v_requested integer := 0;
begin
  select * into v_profile from public.profiles where id = (select auth.uid()) and active;
  if v_profile.id is null or v_profile.role <> 'admin' then
    raise exception 'Only administrators can import daily history.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Nothing to import.';
  end if;
  if not exists (select 1 from public.branches where id = p_branch and dealer_id = v_profile.dealer_id) then
    raise exception 'Unknown branch.';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if not (v_row ? 'payment_breakdown') then continue; end if;
    if jsonb_typeof(v_row -> 'payment_breakdown') <> 'object'
       or (select count(*) from jsonb_object_keys(v_row -> 'payment_breakdown')) <> 9 then
      raise exception 'Payment breakdown must contain all nine monitoring channels.';
    end if;
    v_sum := 0;
    for v_item in select key, value from jsonb_each(v_row -> 'payment_breakdown') loop
      if v_item.key not in ('Store Operations','Corporate','Sub Dealer','Non-Store','Home Credit','Credit Card','Deferred','Goldmine','Techzone')
         or jsonb_typeof(v_item.value) <> 'number' then
        raise exception 'Invalid monitoring payment channel.';
      end if;
      if v_item.value::text::numeric < 0 then raise exception 'Payment amounts cannot be negative.'; end if;
      v_sum := v_sum + v_item.value::text::numeric;
    end loop;
    if v_row ->> 'sales' is null or abs(v_sum - (v_row ->> 'sales')::numeric) >= 0.01 then
      raise exception 'Payment breakdown does not match daily sales.';
    end if;
    v_requested := v_requested + 1;
  end loop;
  v_result := public.import_daily_history(p_batch, p_label, p_file, p_branch, p_rows);
  -- Re-imports may fill missing channel data, but never replace saved totals or an existing breakdown.
  update public.branch_daily_history h
  set payment_breakdown = r -> 'payment_breakdown'
  from jsonb_array_elements(p_rows) r
  where h.branch_id = p_branch and h.dealer_id = v_profile.dealer_id
    and h.day = (r ->> 'day')::date and r ? 'payment_breakdown'
    and h.payment_breakdown is null
    and h.sales = round((r ->> 'sales')::numeric, 2)
    and h.transactions = (r ->> 'transactions')::integer;
  get diagnostics v_updated = row_count;
  return v_result || jsonb_build_object('payment_days', v_updated, 'payment_skipped', v_requested - v_updated);
end;
$$;
revoke all on function public.import_daily_history_with_payments(uuid,text,text,uuid,jsonb) from public, anon;
grant execute on function public.import_daily_history_with_payments(uuid,text,text,uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
