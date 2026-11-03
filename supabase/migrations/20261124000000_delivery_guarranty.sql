begin;
alter table public.sales add column fulfillment_method text
  check (fulfillment_method in ('delivery','pickup'));

create table public.sale_delivery_guaranties (
  sale_id uuid primary key references public.sales(id) on delete cascade,
  amount numeric(12,2) not null check(amount>0 and amount::text not in ('NaN','Infinity','-Infinity'))
);
alter table public.sale_delivery_guaranties enable row level security;
create policy delivery_guaranties_read on public.sale_delivery_guaranties for select to authenticated
  using (exists(select 1 from public.sales s where s.id=sale_id));
grant select on public.sale_delivery_guaranties to authenticated;
revoke insert,update,delete on public.sale_delivery_guaranties from public,anon,authenticated;

create function public.save_sale_with_delivery(
  p_customer_name text,p_invoice_number text,p_sold_on date,p_lines jsonb,
  p_sale_id uuid default null,p_payment_mode text default null,p_city text default null,
  p_barangay text default null,p_serials jsonb default '[]',p_reconcile boolean default false,
  p_fulfillment_method text default null,p_dg_amount numeric default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid; v_previous jsonb; v_history uuid[]; v_method text; v_branch uuid;
begin
  v_method:=nullif(btrim(p_fulfillment_method),'');
  if v_method is null and p_sale_id is null
    or v_method is not null and v_method not in ('delivery','pickup') then
    raise exception 'Choose Delivery or Pick up.';
  end if;
  if p_dg_amount is not null and (p_dg_amount<=0 or p_dg_amount>9999999999.99
    or p_dg_amount::text in ('NaN','Infinity','-Infinity') or round(p_dg_amount,2)<>p_dg_amount) then
    raise exception 'Delivery Guarranty must be a positive amount with at most two decimal places.';
  end if;
  if p_dg_amount is not null and v_method is distinct from 'delivery' then
    raise exception 'Delivery Guarranty is available for Delivery sales only.';
  end if;
  if p_sale_id is not null then
    select branch_id into v_branch from public.sales where id=p_sale_id;
    perform public.inventory_lock(v_branch);
    -- Serialize concurrent edits before capturing the prior delivery fee.
    perform 1 from public.sales where id=p_sale_id for update;
    select jsonb_build_object('fulfillment_method',s.fulfillment_method,'delivery_guarranty_amount',g.amount)
      into v_previous from public.sales s left join public.sale_delivery_guaranties g on g.sale_id=s.id where s.id=p_sale_id;
    if v_method is null and v_previous->>'fulfillment_method' is not null then
      raise exception 'Choose Delivery or Pick up.';
    end if;
    select coalesce(array_agg(id),'{}') into v_history from public.sale_edit_history where sale_id=p_sale_id;
  end if;
  v_id:=public.save_inventory_sale(p_customer_name,p_invoice_number,p_sold_on,p_lines,p_sale_id,
    p_payment_mode,p_city,p_barangay,p_serials,p_reconcile);
  update public.sales set fulfillment_method=v_method where id=v_id;
  if p_dg_amount is null then
    delete from public.sale_delivery_guaranties where sale_id=v_id;
  else
    insert into public.sale_delivery_guaranties values(v_id,p_dg_amount)
      on conflict(sale_id) do update set amount=excluded.amount;
  end if;
  if p_sale_id is not null then
    update public.sale_edit_history set previous_values=previous_values||v_previous
      where sale_id=v_id and not (id=any(v_history));
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_sale_with_delivery(text,text,date,jsonb,uuid,text,text,text,jsonb,boolean,text,numeric) from public,anon;
grant execute on function public.save_sale_with_delivery(text,text,date,jsonb,uuid,text,text,text,jsonb,boolean,text,numeric) to authenticated;
revoke execute on function public.save_inventory_sale(text,text,date,jsonb,uuid,text,text,text,jsonb,boolean) from authenticated;
notify pgrst,'reload schema';
commit;
