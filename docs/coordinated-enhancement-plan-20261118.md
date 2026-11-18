# Branchline PTG + Sales Tracker improvements — staged implementation

**Release policy (2026-11-18):** The user requested one coordinated deployment only after the agreed improvements and final verification. Do not merge staging PRs into GitHub Pages production branches or run production deployments early.

## Current functionality verified in source

- Sales Tracker already implements month-end sales forecasting (`forecastMonth`), required average sales per remaining selling day (`requiredPace`), selling-day calendars, pacing insights, existing push notification flows, and PDF/Excel reporting. Improve these rather than duplicating them.
- PTG already supports search and product-details modal, monthly/promotional price selection, SRP fallback, some free-installation/unit-only offer pairing, and a print queue. Retain all of these.
- Do not change Apps Script production, pricing formulas, Supabase schemas or live authentication merely to add display features.

## Staged, not deployed

1. **Sales Tracker PR #21:** Product Specialist performance cards + one-person and batch Top 10 PDF certificates. A4 landscape, scope and selected period, positive actual transactions only, exclude test and transferred PS history, no fabricated signatures or performance results.
2. **PTG PR #28:** read-only price preflight warnings in product-details modal/queue, and smart print queue brand counts and shared-barcode review. The queue never auto-deletes legitimate unit-only/free-installation variants.

## Progress after plan creation

- [x] Sales Tracker: staged Top 10 PS performance cards and individual/batch landscape award certificates with tests.
- [x] Sales Tracker: staged manual daily, weekly, monthly and YTD management reports, aggregated by branch, brand, PS and day with no customer identifying fields.
- [x] Sales Tracker: staged read-only Manager Attention panel for behind-pace and unassigned-PS exceptions. Does not send push messages.
- [x] Existing export regression tests and the new awards/reports/attention CI are passing on the development branch.
- [ ] Review example certificate PDFs visually in a browser and on a printer before release.
- [ ] Evaluate push alert scheduling/privacy controls and cross-app read-only gateway design (proposal in `docs/alerts-integration-design-20261118.md`).

## Remaining development

### PTG
- [ ] Offer comparison: review monthly vs promotional vs subdealer price selection and early-printing logic, with explicit effective dates, no hidden automatic overrides; preserve multiple offers where required.
- [ ] Memo history and audit: document import, effective dates, superseded revisions, user, branch, and preflight warnings. Design retention before any destructive cleanup.
- [ ] Print queue: preview for overflow/invalid tags across ONE/TWO/FOUR/SIX/AIRCON/SMALL APPS/CARAVAN; optional brand-scoped batch selection without deleting legitimate variants.
- [ ] Full regression matrix for barcode lookup, paired offers, promotion priority, SRP fallback, inventory and all printed formats.

### Sales Tracker
- [ ] Expand existing forecast/pacing insights instead of adding another dashboard that contradicts current projections.
- [ ] Expand PS performance analysis using reliable current-target, transaction and walk-in data. Keep conversion blank if visitor counts are unavailable.
- [ ] Review existing push alerts for thresholds, rate limiting, manager visibility, and missing attribution; avoid duplicate notification noise.
- [ ] Management report center: preset daily/weekly/monthly/YTD exports; distinguish manual versus scheduled delivery and require explicit scheduling preferences.
- [ ] Test all report PDF paper sizes and headers, Sales and Brand Log identity columns and totals.

### Read-only cross-app integration (after independent releases stabilize)
- [ ] Define authenticated branch-scoped read API for product reference, stock and recent sales activity. Use real RLS and explicit permissions; do not expose cross-branch customer or PS data through PTG.
- [ ] Confirm data lineage, freshness, consent for sharing, error states and graceful fallback when the other service is unavailable.

## Release criteria

- [ ] Preview deployments and CI checks pass for the **exact final commits**.
- [ ] Preview printed certificate PDFs: 1 and 10 recipients, long names, no data, periods, ties and branch roles.
- [ ] Verify PTG printing in all seven formats remains identical to production.
- [ ] Compare live-versus-preview screens at different window widths and on Windows WebView2, Android and iPhone where applicable.
- [ ] Verify Sales Tracker balances, rank, targets, exports, inventory and accessibility/RLS.
- [ ] Confirm no new unauthorized database writes or migrations.
- [ ] Merge and deploy only as an intentionally approved coordinated release, with rollback instructions.
