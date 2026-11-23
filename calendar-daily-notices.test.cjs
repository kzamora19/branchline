const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "auth-app.js"), "utf8");
const migration = fs.readFileSync(path.join(__dirname, "supabase/migrations/20261119170000_customer_master_address_required.sql"), "utf8");
const start = source.indexOf("  function showOpeningCalendarEventNotices()");
const end = source.indexOf("  function calendarClosures()",start);
const functionBody = source.slice(start,end);

test("calendar notices repeat on a fresh opening and stay dismissed per account within the same opening", () => {
  assert.ok(start > 0 && end > start);
  const overlays = [];
  const fixture = {
    currentProfile: { id: "ps-one", role:"ps" },
    demoStore: null,
    liveData: {
      branches: [{ id:"STG", name:"Santiago" }],
      calendar: { events: [
        {id:"1",title:"Event 1",kind:"promotion",starts_on:"2026-11-01",ends_on:"2026-11-30",branch_ids:["STG"],memo_links:[]},
        {id:"2",title:"Event 2",kind:"promotion",starts_on:"2026-11-01",ends_on:"2026-11-30",branch_ids:[],memo_links:[]},
        {id:"3",title:"Other branch",kind:"promotion",starts_on:"2026-11-01",ends_on:"2026-11-30",branch_ids:["CAU"],memo_links:[]},
        {id:"4",title:"Expired",kind:"promotion",starts_on:"2026-11-01",ends_on:"2026-11-18",branch_ids:[],memo_links:[]},
        {id:"5",title:"Cancelled",kind:"promotion",starts_on:"2026-11-01",ends_on:"2026-11-30",branch_ids:[],cancelled_at:"2026-11-17",memo_links:[]},
      ]}
    },
    window: { BranchlineAnalytics: {calendarOccursOn:(row,day)=>row.starts_on<=day&&row.ends_on>=day} },
    localISODate:()=>"2026-11-19",
    scopeBranchIds:()=>new Set(["STG"]),
    localStorage: {
      getItem: () => "shown",
      setItem: () => assert.fail("Opening notices should not persist dismissal"),
    },
    escapeHTML:v=>String(v),
    calendarScheduleLabel:()=>"Every day in the range",
    calendarMemoLinks:()=>"",
    document: {
      createElement:()=>({
        innerHTML:"",className:"",setAttribute(){},addEventListener(name,cb){this[name]=cb},
        querySelector:()=>({focus(){}}),remove(){this.removed=true}
      }),
      body:{append(element){overlays.push(element)}}
    }
  };
  const state = source.match(/^  const calendarNoticesShown = new Set\(\);$/m);
  assert.ok(state);
  const openApp = () => {
    const context = vm.createContext({ ...fixture });
    vm.runInContext(state[0] + "\n" + functionBody, context);
    return context;
  };
  const show = context => vm.runInContext("showOpeningCalendarEventNotices()", context);
  const context = openApp();
  show(context);
  assert.equal(overlays.length,1);
  assert.match(overlays[0].innerHTML,/Event 1 of 2/);
  assert.doesNotMatch(overlays[0].innerHTML,/Other branch/);
  overlays[0].click({target:{closest:()=>true}});
  assert.match(overlays[0].innerHTML,/Event 2 of 2/);
  overlays[0].click({target:{closest:()=>true}});
  assert.equal(overlays[0].removed,true);
  show(context);
  assert.equal(overlays.length,1,"refreshing workspace data does not reopen notices");
  context.currentProfile={id:"ps-two",role:"ps"};
  show(context);
  assert.equal(overlays.length,2,"each user receives their own event notice");
  show(openApp());
  assert.equal(overlays.length,3,"a fresh app opening shows notices for the original account on the same date");
  assert.match(overlays[2].innerHTML,/Event 1 of 2/);
  assert.doesNotMatch(functionBody,/\.rpc\(|\.from\(|fetch\(/,"calendar notices do not write database records");
});

test("customer editor and RPC require barangay and municipality without backfilling historical data", () => {
  assert.match(source,/name="barangay" required maxlength="200"/);
  assert.match(source,/name="city" required maxlength="200"/);
  assert.match(source,/Barangay and City \/ municipality are required\./);
  assert.match(migration,/nullif\(btrim\(coalesce\(p_barangay, ''\)\), ''\) is null/);
  assert.match(migration,/nullif\(btrim\(coalesce\(p_city, ''\)\), ''\) is null/);
  assert.match(migration,/security invoker/);
  assert.doesNotMatch(migration,/update public\.sales|insert into public\.sales/i);
});

test("calendar event RLS also allows only assigned inventory branches", () => {
  const policy = fs.readFileSync(path.join(__dirname,
    "supabase/migrations/20261119190000_calendar_events_inventory_viewers.sql"),"utf8");
  assert.match(policy,/alter policy calendar_event_read on public\.calendar_events/);
  assert.match(policy,/public\.is_dealer_member\(dealer_id\)/);
  assert.match(policy,/public\.can_access_branch\(event_branch\.id\)/);
  assert.match(policy,/public\.can_access_inventory\(event_branch\.id\)/);
  assert.match(policy,/unnest\(calendar_events\.branch_ids\)/);
  assert.doesNotMatch(policy,/create policy|grant all|using\s*\(\s*true\s*\)/i);
});
