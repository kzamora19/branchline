const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const inventory = require("./inventory.js");
const PGlite = process.env.BRANCHLINE_PGLITE ? require(process.env.BRANCHLINE_PGLITE).PGlite : null;
const branches = [{ id: "one", name: "Santiago", code: "STG" }, { id: "two", name: "Tuguegarao", code: "TUG" }];

test("report identity accepts matching names/codes and rejects contradictory or blank identities", () => {
  for (const source of ["Santiago", "MEGASAVER SANTIAGO", "STG - MEGASAVER SANTIAGO", "stg", "1st Megasaver Santiago"]) {
    inventory.assertReportBranch(source, branches[0]);
  }
  for (const source of ["Tuguegarao", "TUG - MEGASAVER SANTIAGO", "STG - Tuguegarao", "", "Unknown"]) {
    assert.throws(() => inventory.assertReportBranch(source, branches[0]), /does not match selected branch/);
  }
  inventory.assertReportBranch("STG - Santiago", { name: "Santiago" });
  inventory.assertReportBranch("MEGASAVER SANTIAGO", { name: "Santiago (Demo)", code: "STG" });
});

test("unified review blocks wrong-branch mappings and carries source provenance to inventory jobs", async () => {
  const { inspectWorkbook, prepareImport, createImportJobs } = await import("./unified-import.mjs");
  const read = (rows, file, id) => inspectWorkbook({ SheetNames: ["Data"], Sheets: { Data: { rows } } }, file, id,
    { utils: { sheet_to_json: sheet => sheet.rows } })[0];
  const sheets = [
    read([["Item Code", "Item Name", "Santiago", "Total"], ["101", "TCL TV", 1, 1]], "stock.xlsx", "stock"),
    read([["Item Code", "Item Name", "Loc Code", "serial No", "tran Date"],
      ["101", "TCL TV", "STG - Santiago", "SOURCE-UNIT", 46000]], "serials.xlsx", "serials"),
  ];
  sheets.forEach(sheet => Object.assign(sheet.config, { complete: true, reportDate: "2026-11-02T08:00:00+08:00" }));
  const options = { branches, operations: ["inventory"], today: "2026-11-02", asOf: "2026-11-02" };
  const wrong = prepareImport(sheets, { ...options, locationMap: { Santiago: "two", "STG - Santiago": "two" } }, { inventory });
  assert.equal(wrong.valid, false);
  assert.ok(wrong.issues.some(issue => /does not match selected branch/.test(issue.message)));
  const correct = prepareImport(sheets, { ...options, locationMap: { Santiago: "one", "STG - Santiago": "one" } }, { inventory });
  assert.equal(correct.valid, true, JSON.stringify(correct.issues));
  const [job] = createImportJobs(correct, () => "unused");
  assert.equal(job.rpc, "import_unified_inventory");
  assert.equal(job.params.p_branch, "one");
  assert.ok(job.params.p_items.every(item => item.source_location === "Santiago" || item.source_location === "STG - Santiago"));
});

test("real PostgreSQL validates both APIs atomically, preserves old clients and permits migration reapplication", { skip: !PGlite }, async () => {
  const db = new PGlite();
  const branch = "00000000-0000-0000-0000-000000000001";
  try {
    await db.exec(`create role anon; create role authenticated;
      create table branches(id uuid primary key,name text not null,code text);
      insert into branches values('${branch}','Santiago','STG');
      create table writes(value jsonb);
      create function import_inventory(p_branch uuid,p_reported_at timestamptz,p_files text,p_items jsonb)
      returns jsonb language plpgsql security definer as $$
      begin
        if jsonb_array_length(p_items)=0 then raise exception 'The stock report is empty.'; end if;
        insert into writes values(p_items); return p_items;
      end; $$;
      create function import_unified_inventory(p_branch uuid,p_reported_at timestamptz,p_files text,p_items jsonb)
      returns jsonb language plpgsql security definer as $$
      begin
        if jsonb_array_length(p_items)=0 then raise exception 'The stock report is empty.'; end if;
        insert into writes values(p_items); return p_items;
      end; $$;`);
    const sql = fs.readFileSync(path.join(__dirname, "supabase", "migrations", "20261123000000_inventory_source_branch.sql"), "utf8");
    await db.exec(sql);
    await db.exec(sql);
    for (const api of ["import_inventory", "import_unified_inventory"]) {
      const call = items => db.query(`select ${api}($1,now(),'fixture',$2::jsonb)`, [branch, JSON.stringify(items)]);
      for (const source of ["MEGASAVER TUGUEGARAO", "TUG - Santiago", "STG - Tuguegarao", "", null]) {
        await assert.rejects(call([{ source_location: source }]), /does not match selected branch/);
      }
      await assert.rejects(call([{ source_location: "Santiago" }, {}]), /does not match selected branch/);
      await call([{ source_location: "STG - MEGASAVER SANTIAGO" }]);
      await call([{ barcode: "101" }]);
    }
    assert.equal((await db.query("select count(*)::int n from writes")).rows[0].n, 4);
    const permission = await db.query("select has_function_privilege('authenticated','inventory_validate_source_branch(uuid,jsonb)','execute') allowed");
    assert.equal(permission.rows[0].allowed, false);
  } finally { await db.close(); }
});
