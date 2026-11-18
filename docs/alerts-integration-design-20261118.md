# Branchline read-only interoperability and management alerts

**Design only. Not deployed.** Integration is postponed until both standalone apps are stable.

## Existing functionality to preserve

Sales Tracker already computes period-based forecasts, required selling-day pace, product specialist performance, inventory views, configurable push messaging and scheduled alert workflows. The staged Manager Attention panel is **read-only** and does not create a push subscription or scheduled alert.

## Management alert readiness

- Keep the existing push notification controls authoritative rather than implementing duplicate senders.
- Require explicit manager-approved cadence, recipient roles, thresholds and quiet hours before scheduling any new alert.
- Scope all comparisons to the authenticated account's permitted branches and reporting period.
- Treat missing walk-in traffic as unavailable; do not show a fabricated conversion rate.
- Debounce duplicate low-performance alerts, clearly distinguish informational from urgent, and provide a manual link to Analytics.
- Log sent notices, but do not store private customer details inside notification payloads.
- Test alert behavior for zero targets, insufficient sales data, historical dates, revoked accounts and branch transfers.

## Proposed PTG to Sales Tracker integration

- **Initial phase:** read-only product insights (barcode/model, available stock where authorized, aggregated recent sales), not direct database writes between applications.
- PTG and Sales Tracker use distinct authorization models and database projects. Branch IDs and permissions must be explicitly mapped and verified; never assume ID equivalence.
- Serve all cross-system data through an authenticated server-side gateway/Edge Function using verified caller identity, branch scope and purpose-specific authorization.
- Never place Supabase service-role keys or unrestricted REST access in PTG browser JavaScript. Avoid any customer names, phone numbers, payment details and individual sales/PS records unless separately authorized.
- Use narrow fields and time-limited responses with freshness labels and clear outage states. If the linked system is unavailable, PTG search, price selection and printing must continue working unchanged.
- Validate RLS, role restrictions, audit events and per-branch access before enabling integration. Plan a feature flag for instant rollback.

## Current staging

Sales Tracker PR #21 includes printable Top 10 awards, management reports (daily, weekly, monthly, YTD) and manager attention. All are local-client read/report features; no new push schedules or cross-database calls are present.

**Release policy:** do not merge until the user has requested coordinated deployment after final tests and reviews.
