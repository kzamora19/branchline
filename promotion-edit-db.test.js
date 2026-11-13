const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PGlite = process.env.BRANCHLINE_PGLITE ? require(process.env.BRANCHLINE_PGLITE).PGlite : null;

test("adding a promotion to a saved sale keeps attribution, edit history, and stock consistent", { skip: !PGlite }, async () => {
  const db = new PGlite();
  const id = number => `00000000-0000-0000-0000-${String(number).padStart(12, "0")}`;
  const [dealer, district, branch, otherBranch, specialist, otherSpecialist, admin, manager] = [1, 2, 3, 4, 5, 6, 7, 8].map(id);
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  const scalar = async (sql, params = []) => Object.values((await query(sql, params))[0])[0];
  const signIn = user => query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  const regular = { barcode: "00000101", quantity: 1, srp: 6198, selling_price: 5916 };
  const serials = [{ barcode: regular.barcode, serial: "CURRENT" }];
  const save = invoice => scalar(
    "select public.save_sale_with_delivery('Customer',$1,'2026-11-03',$2,null,'Cash','City','Barangay',$3,false,'pickup',null)",
    [invoice, JSON.stringify([regular]), JSON.stringify(serials)]
  );
  const addOffer = (sale, promotion, date = "2026-11-03", items = [regular], reconcile = false) => scalar(
    "select public.edit_sale_with_promotions($1,$2,'Customer','19636',$3,$4,'Cash','City','Barangay',$5,'pickup',null,$6)",
    [sale, JSON.stringify([{ promotion, bundle_total: 3479, acknowledge_warnings: false }]), date, JSON.stringify(items), JSON.stringify(serials), reconcile]
  );
  const quantity = (barcode, branchId = branch) => scalar("select quantity from public.inventory_stock where branch_id=$1 and barcode=$2", [branchId, barcode]);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema extensions; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    const local = path.join(__dirname, "supabase", "migrations");
    const directory = process.env.BRANCHLINE_MIGRATIONS || local;
    const files = fs.readdirSync(directory).filter(file => file.endsWith(".sql")).sort();
    assert.ok(files.some(file => file.includes("initial_schema")), "Use the complete foundational migrations directory.");
    const promotionEdit = "20261222000000_edit_sale_with_promotions.sql";
    for (const file of files) {
      if (["20261118000000_sales_history_ps_aliases.sql", "20261127000000_admin_sale_edit.sql", promotionEdit].includes(file)) continue;
      await db.exec(fs.readFileSync(path.join(directory, file), "utf8").replace(/create extension if not exists pgcrypto with schema extensions;/i, ""));
    }
    await db.exec(fs.readFileSync(path.join(local, "20261127000000_admin_sale_edit.sql"), "utf8"));
    await db.exec(fs.readFileSync(path.join(__dirname, "supabase", "promotion-pdf-release.sql"), "utf8"));
    await db.exec(fs.readFileSync(path.join(local, promotionEdit), "utf8"));
    await db.exec(`
      insert into dealers(id,name) values ('${dealer}','Fixture');
      insert into districts(id,dealer_id,name) values ('${district}','${dealer}','District');
      insert into branches(id,dealer_id,district_id,name,code) values
        ('${branch}','${dealer}','${district}','Santiago','STG'),
        ('${otherBranch}','${dealer}','${district}','Other','OTH');
      insert into auth.users values ('${specialist}'),('${otherSpecialist}'),('${admin}'),('${manager}');
      insert into profiles(id,dealer_id,district_id,branch_id,role,assigned_brand,full_name) values
        ('${specialist}','${dealer}','${district}','${branch}','ps','CAMEL','Staff One'),
        ('${otherSpecialist}','${dealer}','${district}','${otherBranch}','ps','CAMEL','Staff Two'),
        ('${admin}','${dealer}',null,null,'admin',null,'Admin'),
        ('${manager}','${dealer}','${district}',null,'manager',null,'Manager');
      insert into manager_branches(dealer_id,manager_id,district_id,branch_id) values ('${dealer}','${manager}','${district}','${branch}');
      insert into manager_branch_assignments(dealer_id,manager_id,district_id,branch_id) values ('${dealer}','${manager}','${district}','${branch}');
      insert into payment_modes(dealer_id,name) values ('${dealer}','Cash');`);
    const stock = [
      { barcode: regular.barcode, description: "Water dispenser", brand: "FUJIDENZO", quantity: 2, serialized: true,
        serials: [{ serial: "CURRENT", received_on: "2026-10-12" }, { serial: "SPARE", received_on: "2026-10-12" }] },
      { barcode: "00056682", description: "CK-2010S", brand: "CAMEL", quantity: 14, serialized: false, serials: [] },
    ];
    await signIn(admin);
    await query("select public.import_inventory($1,now(),'fixture',$2)", [branch, JSON.stringify(stock)]);
    await query("select public.import_inventory($1,now(),'fixture',$2)", [otherBranch, JSON.stringify(stock.slice(1))]);
    await query("update public.products set srp=710 where barcode='00056682'");
    const components = JSON.stringify([
      { id: "paid", barcode: "00056682", quantity: 5, free: false },
      { id: "free", barcode: "00056682", quantity: 1, free: true },
    ]);
    const review = branchId => scalar(`select public.review_priced_promotion($1,'65433','Buy five get one',
      '2026-10-01','2026-12-31',false,'offer.pdf',1,'Buy five get one',$2,4260,3479)`, [branchId, components]);
    const promotion = await review(branch);
    const otherPromotion = await review(otherBranch);
    await db.exec("set role authenticated");
    await signIn(specialist);
    const sale = await save("19636");
    await signIn(otherSpecialist);
    await assert.rejects(addOffer(sale, promotion), /not editable/);
    await signIn(admin);
    await assert.rejects(addOffer(null, promotion), /Choose the sale/);
    await assert.rejects(addOffer(sale, otherPromotion), /unavailable in your branch/);
    await assert.rejects(addOffer(sale, promotion, "2027-01-01"), /not active on the sale date/);
    await assert.rejects(addOffer(sale, promotion, "2026-11-03", [
      regular, { barcode: "00056682", quantity: 10, srp: 710, selling_price: 600 },
    ]), /Insufficient available quantity/);
    assert.equal(await quantity("00056682"), 14);
    assert.equal(await scalar("select count(*)::int from public.sale_edit_history where sale_id=$1", [sale]), 0);
    assert.equal(await scalar("select count(*)::int from public.sale_promotion_groups where sale_id=$1", [sale]), 0);

    await signIn(manager);
    assert.equal(await addOffer(sale, promotion), sale);
    assert.equal(await scalar("select ps_id from public.sales where id=$1", [sale]), specialist);
    assert.equal(await scalar("select edited_by from public.sale_edit_history where sale_id=$1", [sale]), manager);
    assert.equal(await scalar("select sum(quantity * selling_price)::numeric(12,2) from public.sale_lines where sale_id=$1", [sale]), "9395.00");
    assert.equal(await scalar("select serial from public.sale_serials where sale_id=$1", [sale]), "CURRENT");
    assert.equal(await scalar("select sum(l.quantity)::int from public.sale_lines l join public.sale_promotion_lines p on p.line_id=l.id where p.sale_id=$1 and p.free and l.selling_price=0", [sale]), 1);
    assert.equal(await quantity("00056682"), 8);
    assert.equal(await quantity(regular.barcode), 1);
    await assert.rejects(addOffer(sale, promotion), /cannot be edited or deleted/);
    assert.equal(await quantity("00056682"), 8);
    await signIn(admin);
    assert.equal(await quantity("00056682", otherBranch), 14);
    assert.equal(await scalar("select has_function_privilege('anon','public.edit_sale_with_promotions(uuid,jsonb,text,text,date,jsonb,text,text,text,jsonb,text,numeric,boolean)','execute')"), false);
    assert.equal(await scalar("select has_schema_privilege('authenticated','branchline_private','usage')"), false);
  } finally {
    await db.close();
  }
});
