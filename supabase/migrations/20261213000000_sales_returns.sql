begin;

create table public.sales_returns (
  id uuid primary key default gen_random_uuid(),
  source_sale_id uuid not null references public.sales(id) on delete restrict,
  return_sale_id uuid not null unique references public.sales(id) on delete restrict,
  request_id uuid not null unique,
  request_payload jsonb not null,
  processed_by uuid not null references public.profiles(id),
  reason text not null check(length(btrim(reason)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index sales_returns_source on public.sales_returns(source_sale_id);
create table public.sales_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sales_returns(id) on delete restrict,
  source_line_id uuid not null references public.sale_lines(id) on delete restrict,
  return_line_id uuid not null unique references public.sale_lines(id) on delete restrict,
  quantity integer not null check(quantity>0),
  serials jsonb not null default '[]' check(jsonb_typeof(serials)='array'),
  original_line jsonb not null,
  unique(return_id,source_line_id)
);
create index sales_return_lines_source on public.sales_return_lines(source_line_id);
alter table public.sales_returns enable row level security;
alter table public.sales_return_lines enable row level security;
create policy sales_returns_read on public.sales_returns for select to authenticated
  using(exists(select 1 from public.sales s where s.id=source_sale_id));
create policy sales_return_lines_read on public.sales_return_lines for select to authenticated
  using(exists(select 1 from public.sales_returns r where r.id=return_id));
revoke all on public.sales_returns,public.sales_return_lines from public,anon,authenticated;
grant select on public.sales_returns,public.sales_return_lines to authenticated;

create function public.can_return_sale(p_sale uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.sales s join public.profiles p on p.id=auth.uid()
    where s.id=p_sale and p.active and p.dealer_id=s.dealer_id
      and public.is_dealer_member(s.dealer_id) and public.can_access_branch(s.branch_id)
      and (p.role in ('admin','district_manager','manager') or (p.role='ps' and s.ps_id=p.id))
      and not exists(select 1 from public.sales_returns r where r.return_sale_id=s.id));
$$;
create function public.search_return_sales(p_query text)
returns table(id uuid,invoice_number text,customer_name text,sold_on date,branch_name text)
language sql stable security definer set search_path=pg_catalog,public as $$
  select s.id,s.invoice_number,s.customer_name,s.sold_on,b.name
  from public.sales s join public.branches b on b.id=s.branch_id
  where length(btrim(p_query))>=2 and public.can_return_sale(s.id)
    and (strpos(lower(s.invoice_number),lower(btrim(p_query)))>0
      or strpos(lower(s.customer_name),lower(btrim(p_query)))>0)
    and exists(select 1 from public.sale_lines l where l.sale_id=s.id and l.quantity>coalesce(
      (select sum(r.quantity) from public.sales_return_lines r where r.source_line_id=l.id),0))
  order by s.sold_on desc,s.invoice_number,s.id limit 50;
$$;
create function public.return_sale_details(p_sale uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not public.can_return_sale(p_sale) then raise exception 'This sale is outside your return access.'; end if;
  return (select jsonb_build_object('sale',to_jsonb(s)||jsonb_build_object('ps_name',
    coalesce(nullif(s.ps_name,''),(select p.full_name from public.profiles p where p.id=s.ps_id))),
    'branch',b.name,'lines',coalesce(
    (select jsonb_agg(to_jsonb(l)||jsonb_build_object(
      'remaining',greatest(0,l.quantity-coalesce((select sum(r.quantity) from public.sales_return_lines r where r.source_line_id=l.id),0)),
      'serials',coalesce((select jsonb_agg(ss.serial order by ss.serial) from public.sale_serials ss
        where ss.sale_id=s.id and ss.barcode=l.barcode and not exists(
          select 1 from public.sales_return_lines rl join public.sales_returns r on r.id=rl.return_id
          join public.sale_lines ol on ol.id=rl.source_line_id
          where r.source_sale_id=s.id and ol.barcode=l.barcode and rl.serials @> jsonb_build_array(ss.serial))), '[]'::jsonb)
    ) order by l.created_at,l.id) from public.sale_lines l where l.sale_id=s.id and l.quantity>0),'[]'::jsonb))
    from public.sales s join public.branches b on b.id=s.branch_id where s.id=p_sale);
end$$;

create function public.process_sales_return(p_sale uuid,p_returned_on date,p_lines jsonb,p_reason text,p_request uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.sales; l public.sale_lines; v_return uuid; v_sale uuid; v_line uuid; v_snapshot uuid;
  x jsonb; chosen jsonb; unit text; qty integer; available integer; recorded integer; total integer:=0;
  known public.inventory_serials; v_existing uuid; v_original uuid;
begin
  if not public.can_return_sale(p_sale) then raise exception 'This sale is outside your return access.'; end if;
  select * into s from public.sales where id=p_sale;
  perform public.inventory_lock(s.branch_id);
  select * into s from public.sales where id=p_sale for update;
  select return_sale_id,source_sale_id into v_existing,v_original from public.sales_returns where request_id=p_request;
  if v_existing is not null then
    if v_original<>p_sale then raise exception 'This return request was already used for another sale.'; end if;
    if not exists(select 1 from public.sales_returns r where r.request_id=p_request
      and r.request_payload=jsonb_build_object('returned_on',p_returned_on,'lines',p_lines,'reason',btrim(p_reason))) then
      raise exception 'This request already posted a different return. Reopen Sales return to check the remaining quantities.';
    end if;
    return v_existing;
  end if;
  if p_request is null or p_returned_on is null or p_returned_on<s.sold_on
    or p_returned_on>(now() at time zone 'Asia/Manila')::date then raise exception 'Choose a return date from the sale date through today.'; end if;
  if nullif(btrim(p_reason),'') is null or length(btrim(p_reason))>1000 then raise exception 'Enter a return reason (up to 1000 characters).'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)=0 or jsonb_array_length(p_lines)>500 then
    raise exception 'Select at least one product line (maximum 500).'; end if;
  if exists(select 1 from jsonb_array_elements(p_lines) entry group by entry->>'line_id' having count(*)>1) then
    raise exception 'A product line cannot be selected twice.'; end if;
  v_sale:=gen_random_uuid();v_return:=gen_random_uuid();
  insert into public.sales(id,dealer_id,branch_id,ps_id,customer_name,invoice_number,sold_on,payment_mode,city,barangay,ps_name,salesperson_code,fulfillment_method)
  values(v_sale,s.dealer_id,s.branch_id,s.ps_id,s.customer_name,'RET-'||v_return::text,p_returned_on,s.payment_mode,s.city,s.barangay,s.ps_name,s.salesperson_code,s.fulfillment_method);
  insert into public.sales_returns(id,source_sale_id,return_sale_id,request_id,request_payload,processed_by,reason)
  values(v_return,p_sale,v_sale,p_request,jsonb_build_object('returned_on',p_returned_on,'lines',p_lines,'reason',btrim(p_reason)),auth.uid(),btrim(p_reason));
  insert into public.inventory_snapshots(branch_id,imported_by,reported_at,files,products,quantity)
  values(s.branch_id,auth.uid(),now(),'Sales return '||v_return,0,0) returning id into v_snapshot;
  for x in select value from jsonb_array_elements(p_lines) loop
    select * into l from public.sale_lines where id=(x->>'line_id')::uuid and sale_id=p_sale for update;
    if l.id is null or l.quantity<=0 then raise exception 'Choose a positive product line from the original sale.'; end if;
    if coalesce(x->>'quantity','') !~ '^[1-9][0-9]*$' then raise exception 'Return quantities must be positive whole units.'; end if;
    qty:=(x->>'quantity')::integer;
    available:=l.quantity-coalesce((select sum(r.quantity) from public.sales_return_lines r where r.source_line_id=l.id),0);
    if qty>available then raise exception 'Barcode %: only % units remain returnable.',l.barcode,available; end if;
    chosen:=coalesce(x->'serials','[]'::jsonb);
    if jsonb_typeof(chosen) is distinct from 'array' or jsonb_array_length(chosen)>qty then raise exception 'Choose no more than one serial per returned unit.'; end if;
    if exists(select 1 from jsonb_array_elements(chosen) u where jsonb_typeof(u)<>'string')
      or exists(select 1 from jsonb_array_elements_text(chosen) u group by lower(btrim(u)) having count(*)>1) then
      raise exception 'Select distinct recorded serial numbers.'; end if;
    select count(*) into recorded from public.sale_serials ss where ss.sale_id=p_sale and ss.barcode=l.barcode
      and not exists(select 1 from public.sales_return_lines rl join public.sales_returns r on r.id=rl.return_id
        join public.sale_lines ol on ol.id=rl.source_line_id where r.source_sale_id=p_sale and ol.barcode=l.barcode
          and rl.serials @> jsonb_build_array(ss.serial));
    if jsonb_array_length(chosen)<>least(qty,recorded) then raise exception 'Select the recorded serials for the units being returned; legacy unnumbered units may stay blank.'; end if;
    for unit in select value from jsonb_array_elements_text(chosen) loop
      if not exists(select 1 from public.sale_serials ss where ss.sale_id=p_sale and ss.barcode=l.barcode and ss.serial=unit)
        or exists(select 1 from public.sales_return_lines rl join public.sales_returns r on r.id=rl.return_id
          join public.sale_lines ol on ol.id=rl.source_line_id where r.source_sale_id=p_sale and ol.barcode=l.barcode
            and rl.serials @> jsonb_build_array(unit)) then raise exception 'Serial % is not returnable on this invoice.',unit; end if;
      if exists(select 1 from public.inventory_serials u join public.branches b on b.id=u.branch_id
        where b.dealer_id=s.dealer_id and lower(u.barcode)=lower(l.barcode) and lower(btrim(u.serial))=lower(btrim(unit))
          and (u.branch_id<>s.branch_id or u.status not in ('sold','absent')))
        or exists(select 1 from public.sale_serials ss join public.sales other on other.id=ss.sale_id
          where ss.dealer_id=s.dealer_id and lower(ss.barcode)=lower(l.barcode) and lower(btrim(ss.serial))=lower(btrim(unit))
          and ss.sale_id<>p_sale and other.created_at>s.created_at
          and not exists(select 1 from public.sales_returns r join public.sales_return_lines rl on rl.return_id=r.id
            where r.source_sale_id=ss.sale_id and rl.serials @> jsonb_build_array(ss.serial))) then
        raise exception 'Serial % has a conflicting stock or later sale movement; resolve it first.',unit; end if;
      select * into known from public.inventory_serials where branch_id=s.branch_id and barcode=l.barcode
        and lower(btrim(serial))=lower(btrim(unit)) for update;
      if found then
        update public.inventory_serials set status='available'
          where branch_id=known.branch_id and barcode=known.barcode and serial=known.serial;
      else
        insert into public.inventory_serials(branch_id,barcode,serial,received_on,status)
        values(s.branch_id,l.barcode,unit,p_returned_on,'available');
      end if;
    end loop;
    if not exists(select 1 from public.products where branch_id=s.branch_id and barcode=l.barcode) then
      insert into public.products(dealer_id,branch_id,barcode,model_description,brand,category,sub_category,srp)
      values(s.dealer_id,s.branch_id,l.barcode,l.model_description,l.brand,l.category,l.sub_category,l.srp);
    end if;
    insert into public.inventory_stock(branch_id,barcode,quantity,serialized,snapshot_id)
    values(s.branch_id,l.barcode,qty,jsonb_array_length(chosen)>0,v_snapshot)
    on conflict(branch_id,barcode) do update set quantity=public.inventory_stock.quantity+excluded.quantity,
      serialized=public.inventory_stock.serialized or excluded.serialized;
    insert into public.sale_lines(dealer_id,branch_id,sale_id,barcode,model_description,brand,category,sub_category,selling_price,srp,quantity)
    values(s.dealer_id,s.branch_id,v_sale,l.barcode,l.model_description,l.brand,l.category,l.sub_category,l.selling_price,l.srp,-qty)
    returning id into v_line;
    insert into public.sales_return_lines(return_id,source_line_id,return_line_id,quantity,serials,original_line)
    values(v_return,l.id,v_line,qty,chosen,to_jsonb(l));
    insert into public.inventory_events(branch_id,actor_id,kind,barcode,quantity,note)
    values(s.branch_id,auth.uid(),'sales_return',l.barcode,qty,
      'Return '||v_return||' against invoice '||s.invoice_number||': '||btrim(p_reason));
    insert into public.sale_serials(dealer_id,branch_id,sale_id,barcode,serial,position)
    select s.dealer_id,s.branch_id,v_sale,l.barcode,value,ordinality::integer
    from jsonb_array_elements_text(chosen) with ordinality;
    total:=total+qty;
  end loop;
  update public.inventory_snapshots set products=jsonb_array_length(p_lines),quantity=total where id=v_snapshot;
  return v_sale;
end$$;

create function public.guard_returned_sale()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.sales_returns r where r.source_sale_id=old.id or r.return_sale_id=old.id) then
    raise exception 'This invoice is linked to a posted return and cannot be edited or deleted.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end$$;
create trigger a_guard_returned_sale before update or delete on public.sales for each row execute function public.guard_returned_sale();
create function public.guard_returned_line()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='UPDATE' and
    (new.id,new.dealer_id,new.branch_id,new.sale_id,new.barcode,new.quantity,new.selling_price,new.srp)
    is not distinct from
    (old.id,old.dealer_id,old.branch_id,old.sale_id,old.barcode,old.quantity,old.selling_price,old.srp) then
    return new;
  end if;
  if exists(select 1 from public.sales_returns r where r.source_sale_id=old.sale_id or r.return_sale_id=old.sale_id
    or (tg_op='UPDATE' and (r.source_sale_id=new.sale_id or r.return_sale_id=new.sale_id))) then
    raise exception 'Product lines linked to a posted return cannot be edited or deleted.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end$$;
create trigger a_guard_returned_line before update or delete on public.sale_lines for each row execute function public.guard_returned_line();
create function public.guard_returned_serial()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.sales_returns r where r.source_sale_id=old.sale_id or r.return_sale_id=old.sale_id
    or (tg_op='UPDATE' and (r.source_sale_id=new.sale_id or r.return_sale_id=new.sale_id))) then
    raise exception 'Serials linked to a posted return cannot be edited or deleted.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end$$;
create trigger a_guard_returned_serial before update or delete on public.sale_serials for each row execute function public.guard_returned_serial();

create function public.guard_returned_insert()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.sales_returns r where r.source_sale_id=new.sale_id) then
    raise exception 'Product lines and serials cannot be added to an invoice linked to a posted return.';
  end if;
  if exists(select 1 from public.sales_returns r where r.return_sale_id=new.sale_id) then
    if tg_table_name='sale_lines' then
      if not exists(select 1 from public.sales_return_lines rl where rl.return_line_id=new.id
        and new.quantity=-rl.quantity) then raise exception 'Return product lines must match their return audit.'; end if;
    else
      if not exists(select 1 from public.sales_return_lines rl join public.sales_returns r on r.id=rl.return_id
        join public.sale_lines l on l.id=rl.return_line_id where r.return_sale_id=new.sale_id
        and l.barcode=new.barcode and rl.serials @> jsonb_build_array(new.serial))
        or (select count(*) from public.sale_serials ss where ss.sale_id=new.sale_id
          and ss.barcode=new.barcode and lower(btrim(ss.serial))=lower(btrim(new.serial)))<>1 then
        raise exception 'Return serials must match their return audit.';
      end if;
    end if;
  end if;
  return new;
end$$;
create constraint trigger a_guard_returned_line_insert after insert on public.sale_lines
  deferrable initially deferred for each row execute function public.guard_returned_insert();
create constraint trigger a_guard_returned_serial_insert after insert on public.sale_serials
  deferrable initially deferred for each row execute function public.guard_returned_insert();

do $patch$
declare definition text; old_text text;
begin
  select pg_get_functiondef('public.inventory_sale_serial_eligible(uuid,text,text,uuid)'::regprocedure) into definition;
  old_text:='and (p_exclude is null or ss.sale_id<>p_exclude)';
  if strpos(definition,old_text)=0 then raise exception 'Unsupported sale serial eligibility definition.'; end if;
  execute replace(definition,old_text,$new$and (p_exclude is null or ss.sale_id<>p_exclude)
    and not exists(select 1 from public.sales_returns r where r.return_sale_id=ss.sale_id)
    and not exists(select 1 from public.sales_returns r join public.sales_return_lines rl on rl.return_id=r.id
      join public.sale_lines ol on ol.id=rl.source_line_id
      where r.source_sale_id=ss.sale_id and ol.barcode=ss.barcode and rl.serials @> jsonb_build_array(ss.serial))$new$);
end$patch$;
revoke all on function public.can_return_sale(uuid),public.search_return_sales(text),public.return_sale_details(uuid),
  public.process_sales_return(uuid,date,jsonb,text,uuid),public.guard_returned_sale(),public.guard_returned_line(),public.guard_returned_serial(),public.guard_returned_insert() from public,anon;
grant execute on function public.can_return_sale(uuid),public.search_return_sales(text),public.return_sale_details(uuid),
  public.process_sales_return(uuid,date,jsonb,text,uuid) to authenticated;
revoke all on function public.guard_returned_sale(),public.guard_returned_line(),public.guard_returned_serial(),public.guard_returned_insert() from authenticated;
notify pgrst,'reload schema';
commit;
