# Security review: public.push_alert_schedule_runs — 2026-11-18

**Status: read-only inspection. No database permissions have been modified.**

## Verified connected Sales Tracker project
The `public.push_alert_schedule_runs` table currently has **Row Level Security disabled**, and `anon` and `authenticated` each have broad grants, including `SELECT`, `INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE`. Supabase's inspection reported this as a critical exposed-table concern. This must be resolved before the coordinated enhancement release.

The table currently contains the fields `schedule_id` (UUID), `run_on` (date), `created_at` (timestamp). Do not assume no business impact simply because the table was empty when inspected. This table is likely used to deduplicate scheduled push runs.

## Approval and remediation checklist
- Confirm how cron or Edge Functions record processed scheduled alerts (the caller may use `service_role` or an authenticated user role).
- Confirm the existing foreign key, unique constraint and existing function permissions.
- Decide whether any client should ever be able to read or change scheduler run records; default recommendation is **server-only**.
- Review the following **proposed** SQL before execution (not yet applied):

```sql
begin;
revoke all on table public.push_alert_schedule_runs from anon, authenticated;
alter table public.push_alert_schedule_runs enable row level security;
commit;
```

No client RLS policy is proposed because a server-only scheduler table should not be exposed to ordinary user sessions. Verify the scheduled push worker uses a privileged, authenticated server context rather than a direct client before applying. Do not set policies that allow users to forge or delete schedule-run records.

## Verification after approval
- Signed-out/anon user cannot read, create, modify or delete schedule-run rows.
- Signed-in ordinary Product Specialist and manager cannot read or modify them.
- Authorized scheduler can insert a deduplication marker and detect repeat runs.
- Push alerts remain idempotent; dashboard push subscription and sending continue working.
- Existing schedule-specific audit and error logs are preserved.

This item is a **security release blocker**, not a cosmetic change. It was discovered during the staged PTG–Sales Tracker integration analysis.
