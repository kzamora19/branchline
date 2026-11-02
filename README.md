# Branchline

Branchline is a sales tracker for Product Specialists and branch teams.

## Unified multi-layout importer

Open **Products > Import Center** or **Inventory > Import stock**. Upload raw Excel
or CSV reports together, confirm sheet layouts and metadata, map branches, then
choose **Consolidate and review** before importing.

Supported layouts include regular/kiosk memos, sales forecasts, sales databases,
quantity reports, serialized reports, and monthly Daily Monitoring. Unrecognized
worksheets must be mapped or explicitly excluded. PDF/OCR and saved Extractor
workbooks are not supported in this release.

Products consolidate by barcode. Catalog SRP follows eligible memos, forecasts,
other current sources, then historical sales as a warned last resort. Explicit
zero is a supplied price and never falls through to another source. Historical
sale-line SRPs remain unchanged. Conflicting prices, unreadable barcodes, incomplete stock
coverage, and other blocking issues must be resolved before saving. Missing
catalog values are not invented; new products require brand and description.
Download the full review workbook to inspect source evidence and all issues.

The review shows the selected price basis and source. Existing memo recency and
forecast year/timestamp rules still apply. Ended memos remain effective until
superseded; future/invalid periods are excluded. Equal-ranked conflicting prices,
including disagreeing historical fallback SRPs, block saving instead of selecting
an arbitrary value. Historical quantities and sold serials never become stock.

### SRP preservation and source reconciliation

After migrations through `20261120000000_sales_address_retained_serials.sql`,
back up and apply `20261121000000_srp_source_preservation.sql`. Legacy and unified
catalog/stock imports preserve an existing SRP when the source is blank. Add product
also preserves an existing price; an explicit product edit may clear it to NULL.
Completing an unset SRP still requires Admin. Explicit zero is valid, including
confirmed free/bundled items, and is not Missing SRP. SRP-only updates skip catalog
metadata/stock synchronization, preserving historical line metadata as well as
sale prices, quantities and serial allocations. Publish the matching runtime
modules and offline shell v90 together.

Existing ambiguous legacy zeros require source reconciliation before switching
the warning to NULL-only; do not silently treat every old zero as a free item.
The user-approved November 2 reconciliation restores 665 missing barcode prices
(540 memo, 122 forecast, 3 consistent imported-history fallbacks), aligns 251
existing positive barcode prices to authoritative memos, and retains 450
source-labelled free/outdoor-bundle barcodes as valid zero. Unconfirmed zeros
remain missing; conflicts, undated memos and unmapped supplemental sheets are not
guessed. Existing positive prices are never replaced with a historical fallback.
Full catalog/function backups, the source manifest, the price plan and exact
sales/stock/serial preservation checks are kept in a restricted, non-exposed
database audit schema, not this public repository.

Salesperson codes remain text, including leading zeros. Code-based assignment
requires an exact configured `profiles.salesperson_code` within the same dealer
and branch. Unknown codes remain unassigned with their source names retained.
This release does not assign roster codes or provide a roster editor.

### Confirmed historical salesperson name links

`20261122000000_sales_history_name_links.sql` fixes future legacy and unified
name-based historical imports. Exact normalized names retain priority. Only the
confirmed Vermont Montalban / Vermont Jay Montalban, Rhyan Jhay Joson / Ryan Joson,
and Jason Palarca / Jason Everly Palarca aliases may fall back to a unique PS
account in the same company and branch. Ambiguous or unrelated names remain
unassigned. Explicit salesperson codes keep their existing precedence: an unknown
code is not name-guessed. Internal matching helpers are not callable by client
roles. No frontend or offline-cache update is needed.

The approved November 2 live repair linked 674 previously unassigned imported
Santiago invoices to those three accounts, without renaming source records or
changing dates, amounts, SRPs, products, stock or serials. Full sale/function
backups, the exact mapping/plan and preservation checks are stored privately in
the restricted `branchline_repair_audit` schema. September account totals verified:
Vermont: 30 invoices / PHP 1,720,038.35; Ryan: 13 / PHP 211,488.00;
Jason: 10 / PHP 385,534.49. The migration itself changes future matching only;
existing-data relinking requires a separately approved, backed-up repair.

Admins can import catalog, sales, daily monitoring, and stock. Other authorized
stock managers receive inventory-only controls. **Existing import tools / previous
batches** retains the original workflows.

### Save and retry behavior

Reviewing files does not write to the database. Saving commits catalog, sales,
daily totals, and branch stock replacements separately, in that order. Stock
replacement requires complete paired quantity and serial reports for the same
confirmed snapshot time. Serial quantities are included in, not added to, stock.

Completed jobs are skipped on retry while the dialog remains open. Closing or
reloading loses the in-memory progress and batch IDs. Closing is blocked during
execution and warns about unfinished progress. Lost or invalid inventory responses
block automatic replay; inspect Inventory history before preparing a fresh snapshot.
Catalog and stock changes have no automatic undo.

### Backend

The additive migration
[`20261119000000_unified_import.sql`](supabase/migrations/20261119000000_unified_import.sql)
requires the existing inventory/catalog-rules APIs through 20261115000000. It adds
blank-preserving catalog/stock APIs and code-preserving historical-sales support.
Legacy importer APIs are retained. The UI checks backend capabilities before writes.

The migration was rehearsed in a rolled-back transaction and applied to the
user-confirmed Branchline database on 2026-11-02. It did not import sample business
data or populate staff codes. The separate historical-name-alias migration is not
part of this release.

The `import-engine/` modules are a first-party snapshot of the standalone Extractor.
Files are processed locally in the browser. The sample demo stores edits only in
browser-local storage and does not write to Supabase.

## Required sale address and retained serial choices

Manual sale entry and edits require both City/Municipality and Barangay. The form
and atomic `save_inventory_sale` API enforce this. Existing records are not
backfilled; historical-file imports retain their existing address rules.

Previously imported serials missing from the latest inventory report remain in
sales entry, labeled **Not in latest inventory**, until used on a Branchline sale.
They do not count as current stock or appear in aging or transfer choices. Selling
one does not deduct current stock again. Mixed sales deduct only current units;
edits, deletions and later snapshots preserve that distinction.

Server eligibility excludes serials already sold, in transit, available at another
branch of the same dealer, or transferred out without a later recorded return.
A sold serial cannot be reused just because a later report lists it again.
Identity remains dealer + barcode + serial. Branch access restrictions still
apply, and an edited sale retains its own original serial choices.

Apply
[`20261120000000_sales_address_retained_serials.sql`](supabase/migrations/20261120000000_sales_address_retained_serials.sql)
before deploying the frontend. It requires the unified-import migration. Inventory
mutations lock within a dealer to protect cross-branch eligibility against races.
Cache v88 includes this update.

## Sales-history date handling

Excel numeric transaction dates are kept as stored by default. Company-export
text dates remain DD/MM/YYYY; ISO dates remain YYYY-MM-DD. Both importers offer
**Repair day/month-swapped Excel dates** for confirmed legacy exports only.
Leave it unchecked for ordinary workbooks, including the September YTD 2026
database. Setting changes invalidate previews, and future-dated historical sales
block import with the invoice and date shown for review.

The previous automatic repair could move valid January-September transactions
into other months. Previously imported records require a separate source-matched,
backed-up date-only repair; deploying this parser does not modify existing sales.
Cache v89 includes these changes.
