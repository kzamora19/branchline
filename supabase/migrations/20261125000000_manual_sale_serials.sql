begin;

create table public.manual_sale_serial_entries (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales(id) on delete set null,
  branch_id uuid not null references public.branches(id),
  barcode text not null,
  serial text not null check(btrim(serial)<>''),
  entered_by uuid not null references public.profiles(id),
  entered_at timestamptz not null default now()
);
alter table public.manual_sale_serial_entries enable row level security;
create policy manual_sale_serial_entries_read on public.manual_sale_serial_entries for select to authenticated
  using (exists(select 1 from public.sales s where s.id=sale_id));
grant select on public.manual_sale_serial_entries to authenticated;
revoke insert,update,delete on public.manual_sale_serial_entries from public,anon,authenticated;
create index manual_sale_serial_identity on public.manual_sale_serial_entries(branch_id,barcode,lower(btrim(serial)));

-- Reuse retained-serial allocation, including its baseline/edit/delete safeguards.
do $$
declare definition text; old_text text; new_text text;
begin
 select pg_get_functiondef('public.inventory_apply_sale(uuid,jsonb,boolean)'::regprocedure) into definition;
 old_text:='if desired>0 and stock.serialized then';
 if position(old_text in definition)=0 then raise exception 'Unsupported sale allocator serialization check.'; end if;
 definition:=replace(definition,old_text,'if desired>0 and (stock.serialized or exists(select 1 from public.sale_serials where sale_id=p_sale and barcode=code)) then');
 old_text:=$old$if desired<>0 then raise exception 'Barcode % has no inventory. Ask a manager to import stock.',code; end if;$old$;
 new_text:=$new$if desired<>0 and not (
   (select count(*) from public.sale_serials ss where ss.sale_id=p_sale and ss.barcode=code)=desired
   and not exists(select 1 from public.sale_serials ss where ss.sale_id=p_sale and ss.barcode=code and not exists(
     select 1 from public.manual_sale_serial_entries m where m.branch_id=s.branch_id and m.barcode=code and lower(btrim(m.serial))=lower(btrim(ss.serial))))
 ) then raise exception 'Barcode % has no inventory. Ask a manager to import stock.',code; end if;$new$;
 if position(old_text in definition)=0 then raise exception 'Unsupported sale allocator missing-stock check.'; end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
 select pg_get_functiondef('public.save_inventory_sale(text,text,date,jsonb,uuid,text,text,text,jsonb,boolean)'::regprocedure) into definition;
 old_text:=$old$if not exists(select 1 from public.inventory_stock where branch_id=v_branch) and jsonb_array_length(p_serials)>0 then$old$;
 if position(old_text in definition)=0 then raise exception 'Unsupported sale serial initialization check.'; end if;
 definition:=replace(definition,old_text,$new$if not exists(select 1 from public.inventory_stock where branch_id=v_branch) and jsonb_array_length(p_serials)>0
   and exists(select 1 from jsonb_array_elements(p_serials) x where not exists(
     select 1 from public.manual_sale_serial_entries m where m.branch_id=v_branch and m.barcode=x->>'barcode' and lower(btrim(m.serial))=lower(btrim(x->>'serial')))) then$new$);
 execute definition;
end$$;

alter function public.save_sale_with_delivery(text,text,date,jsonb,uuid,text,text,text,jsonb,boolean,text,numeric)
  rename to save_sale_with_delivery_internal;
revoke all on function public.save_sale_with_delivery_internal(text,text,date,jsonb,uuid,text,text,text,jsonb,boolean,text,numeric) from public,anon,authenticated;

create function public.save_sale_with_delivery(
 p_customer_name text,p_invoice_number text,p_sold_on date,p_lines jsonb,
 p_sale_id uuid default null,p_payment_mode text default null,p_city text default null,
 p_barangay text default null,p_serials jsonb default '[]',p_reconcile boolean default false,
 p_fulfillment_method text default null,p_dg_amount numeric default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_branch uuid;v_dealer uuid;v_id uuid;v_code text;v_serial text;v_known public.inventory_serials;v_row jsonb;v_new uuid[]:='{}';v_entry uuid;
begin
 if p_sale_id is null then
  select branch_id into v_branch from public.profiles where id=auth.uid() and role='ps' and active;
 else
  select s.branch_id into v_branch from public.sales s join public.profiles p on p.id=auth.uid()
    where s.id=p_sale_id and p.active and p.dealer_id=s.dealer_id
      and ((p.role='ps' and s.ps_id=p.id and p.branch_id=s.branch_id)
        or (p.role='manager' and public.can_edit_branch_sale(s.branch_id,s.created_at)));
 end if;
 if v_branch is null then raise exception 'The sale is not editable by this account or assignment.'; end if;
 select dealer_id into v_dealer from public.branches where id=v_branch;
 perform public.inventory_lock(v_branch);
 if p_sale_id is not null then perform 1 from public.sales where id=p_sale_id for update; end if;
 if jsonb_typeof(p_serials) is distinct from 'array' then raise exception 'Serials must be an array.'; end if;
 if exists(select 1 from jsonb_array_elements(p_serials) x group by public.normalize_barcode(x->>'barcode'),lower(btrim(x->>'serial')) having count(*)>1)
   then raise exception 'A serial cannot be selected twice for the same product.'; end if;
 for v_row in select value from jsonb_array_elements(p_serials) loop
  v_code:=public.normalize_barcode(v_row->>'barcode');v_serial:=btrim(v_row->>'serial');
  if nullif(v_serial,'') is null or not exists(select 1 from jsonb_array_elements(p_lines) l where public.normalize_barcode(l->>'barcode')=v_code)
    then raise exception 'Each serial must name a sale product and a nonblank serial.'; end if;
  select * into v_known from public.inventory_serials where branch_id=v_branch and barcode=v_code and lower(btrim(serial))=lower(v_serial);
  if v_known.serial is null then
   if coalesce(v_row->>'manual','false')<>'true' then raise exception 'Confirm adding missing serial %.',v_serial; end if;
   if exists(select 1 from public.sale_serials ss where ss.dealer_id=v_dealer and lower(ss.barcode)=lower(v_code) and lower(btrim(ss.serial))=lower(v_serial) and ss.sale_id is distinct from p_sale_id)
     or exists(select 1 from public.inventory_serials u join public.branches b on b.id=u.branch_id where b.dealer_id=v_dealer and u.barcode=v_code and lower(btrim(u.serial))=lower(v_serial) and u.status in ('sold','transit','available'))
     or exists(select 1 from public.inventory_transfers t join public.branches b on b.id=t.from_branch where b.dealer_id=v_dealer and t.barcode=v_code and t.status in ('transit','received') and exists(select 1 from jsonb_array_elements(t.serials) x where lower(btrim(x->>'serial'))=lower(v_serial)))
     then raise exception 'Serial % is already sold, in transit, or recorded at another branch.',v_serial; end if;
   insert into public.inventory_serials(branch_id,barcode,serial,status) values(v_branch,v_code,v_serial,'absent');
   insert into public.manual_sale_serial_entries(branch_id,barcode,serial,entered_by) values(v_branch,v_code,v_serial,auth.uid()) returning id into v_entry;
   v_new:=array_append(v_new,v_entry);
  else
   if v_known.serial<>v_serial then raise exception 'Use the exact recorded serial %.',v_known.serial; end if;
   if not exists(select 1 from public.sale_serials where sale_id=p_sale_id and barcode=v_code and serial=v_serial)
     and not public.inventory_sale_serial_eligible(v_branch,v_code,v_serial,p_sale_id)
     then raise exception 'Serial % is not available for sales entry.',v_serial; end if;
  end if;
 end loop;
 -- Uninitialized products have no allocator row; restore only their prior manual units before an edit.
 update public.inventory_serials u set status='absent' where u.branch_id=v_branch and u.status='sold'
   and exists(select 1 from public.sale_serials ss where ss.sale_id=p_sale_id and ss.barcode=u.barcode and ss.serial=u.serial)
   and exists(select 1 from public.manual_sale_serial_entries m where m.branch_id=u.branch_id and m.barcode=u.barcode and m.serial=u.serial)
   and not exists(select 1 from public.inventory_sale_allocations a where a.sale_id=p_sale_id and a.barcode=u.barcode);
 v_id:=public.save_sale_with_delivery_internal(p_customer_name,p_invoice_number,p_sold_on,p_lines,p_sale_id,p_payment_mode,p_city,p_barangay,p_serials,p_reconcile,p_fulfillment_method,p_dg_amount);
 update public.manual_sale_serial_entries set sale_id=v_id where id=any(v_new);
 if exists(select 1 from public.sale_serials ss where ss.sale_id=v_id and not exists(select 1 from public.inventory_stock st where st.branch_id=v_branch and st.barcode=ss.barcode)
   group by ss.barcode having count(*)<>(select sum(quantity) from public.sale_lines where sale_id=v_id and barcode=ss.barcode))
   then raise exception 'Choose one serial per unit.'; end if;
 update public.inventory_serials u set status='sold' where u.branch_id=v_branch
   and exists(select 1 from public.sale_serials ss where ss.sale_id=v_id and ss.barcode=u.barcode and ss.serial=u.serial)
   and exists(select 1 from public.manual_sale_serial_entries m where m.branch_id=u.branch_id and m.barcode=u.barcode and m.serial=u.serial)
   and not exists(select 1 from public.inventory_sale_allocations a where a.sale_id=v_id and a.barcode=u.barcode);
 return v_id;
end$$;
revoke all on function public.save_sale_with_delivery(text,text,date,jsonb,uuid,text,text,text,jsonb,boolean,text,numeric) from public,anon;
grant execute on function public.save_sale_with_delivery(text,text,date,jsonb,uuid,text,text,text,jsonb,boolean,text,numeric) to authenticated;

create function public.restore_unallocated_manual_serials()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.inventory_lock(old.branch_id);
 update public.inventory_serials u set status='absent' where u.branch_id=old.branch_id and u.status='sold'
   and exists(select 1 from public.sale_serials ss where ss.sale_id=old.id and ss.barcode=u.barcode and ss.serial=u.serial)
   and exists(select 1 from public.manual_sale_serial_entries m where m.branch_id=u.branch_id and m.barcode=u.barcode and m.serial=u.serial)
   and not exists(select 1 from public.inventory_sale_allocations a where a.sale_id=old.id and a.barcode=u.barcode);
 return old;
end$$;
create trigger restore_unallocated_manual_serials before delete on public.sales for each row execute function public.restore_unallocated_manual_serials();
revoke all on function public.restore_unallocated_manual_serials() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
