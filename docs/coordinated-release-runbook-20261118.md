# Coordinated Sales Tracker + PTG Release Runbook (STAGED — 2026-11-18)

**Do not merge or deploy until the user approves the coordinated release.**

## Sales Tracker staged PR #21

- Top 10 Product Specialist performance cards: rank, credited sales, transactions, average ticket, estimated target share and conversion only for days with recorded assisted-client counts.
- Single or 10-recipient landscape A4 recognition certificates; no fabricated names/signatures; selected period and authorized branch scope.
- Daily, weekly, monthly and YTD aggregate reports with existing Excel/PDF export controls.
- Manager attention for target pace, missing targets and unattributed sales; no unsolicited push.
- Extend the already authenticated `supabase/functions/ptg-inventory` Edge Function with the **opt-in** `insights` action. It re-verifies PTG identity, scopes by mapped branch codes `CAU, ILA, STG, TUG`, uses sales/inventory records only and returns aggregated 30-day units, transaction count, latest sale date and stock quantity. It must never return individual PS/customer/payment details.

## PTG staged PR #28

- Non-blocking price checks, visible same-barcode offer comparison, memo references, queue brand counts, duplicates review and print preflight for all seven print formats.
- Bulk add only current-page visible brand results, preserving distinct memo offers sharing a barcode.
- System-Admin-only memo import event log using existing secured `security_audit_logs`, paginated via PTG `ptg-memos` Edge Function. **Import events are not a complete prior-price history.**
- Opt-in product detail insights via PTG `ptg-products` Edge relay to the existing Sales Tracker Edge gateway.

## Critical security gate

In the connected Sales Tracker Supabase project, `public.push_alert_schedule_runs` currently has RLS **disabled** and both `anon` and `authenticated` have broad table grants. **No permission changes have been applied.** Before any release, review the scheduler's execution role and approve a server-only RLS/grant correction. See `docs/push-schedule-rls-security-review-20261118.md` in Sales Tracker. This is an independent security priority and may warrant earlier maintenance with explicit approval.

## Environment feature flags (OFF by default)

- Sales Tracker Edge: `PTG_SALES_INSIGHTS_ENABLED=true` — only in an isolated staging environment after role/branch testing.
- PTG Edge: `PTG_SALES_INSIGHTS_ENABLED=true` — same staging rules.
- PTG web client: `NEXT_PUBLIC_PTG_SALES_INSIGHTS_ENABLED=true` — only after both secure relays have been validated.

No new service-role secret needs to be placed in the PTG browser; the integration reuses the existing PTG-inventory cross-project auth relay. Keep all flags off on production until the coordinated release. Confirm existing Supabase usage limits before enabling frequent insights lookups.

## Manual release tests required

1. Confirm the latest commit on both PRs is green: regression/unit tests, TypeScript, Next build and Deno Edge type-check.
2. Print every PTG format (ONE, TWO, FOUR, SIX, AIRCON, SMALL_APPS, CARAVAN) and compare to production, with long descriptions, zero SRP, memo promotions, free-installation/unit-only and bundle barcode variants.
3. Test the Price Memo Import History as System Admin, Branch Admin and Branch User. Confirm only System Admin can see history, and no history appears without a valid PTG app session.
4. Check Sales Tracker Top 10 certificates for 1 and 10 recipients, long names, empty data, ties, transferred PS, scoped branches, test records, signed-out users, and actual A4 landscape print pagination.
5. Validate daily/weekly/monthly/YTD report totals, district/branch scopes, 30-day product sales, inventory quantities and incomplete traffic/conversion handling.
6. Check Sales Tracker background alerts and scheduler idempotence after RLS policy change. Do not schedule new pushes without approved recipients, cadence, and quiet hours.
7. In staging only, enable all three insights flags and confirm that branch users cannot access other branches; System Admin can see only four mapped branches; PTG Valenzuela remains unlinked.
8. Confirm both apps still work when the other project's Edge gateway is offline; price printing and memo lookup must never depend on product insights.
9. Review usage pricing, deployment cost, RLS/advisors and any remaining DB schema migrations before enabling.
10. Obtain explicit approval to merge each PR and deploy coordinated changes, with rollback via previous GitHub Pages commit/Edge Function version and flags switched off.

## Deferred for a separate approved migration

Complete historical per-product price revisions across replacements would require a transactional append-only snapshot and retention/RLS design. Scheduled email report delivery or new automatic push campaigns require confirmed delivery recipients, schedule, quiet hours and approved integration costs. Neither has been silently enabled.
