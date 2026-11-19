const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(path.join(__dirname,
  "supabase/migrations/20261119090000_align_push_schedule_clock.sql"), "utf8");

test("existing admin-approved schedule slots are served hourly, without new schedules or recipients", () => {
  assert.match(migration, /jobname='pace-push-daily'/);
  assert.match(migration, /schedule='0 2 \* \* \*'/);
  assert.match(migration, /schedule := '0 \* \* \* \*'/);
  assert.match(migration, /extract\(minute from send_at\) <> 0/);
  assert.match(migration, /send_at < time '07:00' or send_at > time '20:00'/);
  assert.match(migration, /claim_push_alert_schedules\(date,time without time zone\)/);
  assert.match(migration, /has_function_privilege\('authenticated'/);
  assert.match(migration, /No approved active schedule exists/);
  assert.match(migration, /Scheduler verification failed/);
  assert.doesNotMatch(migration, /insert into|update public\.|delete from|create policy/i);
});
