# Branchline

Branchline is a sales tracker for Product Specialists and branch teams.

## Compact filters and staff actions

Overview, Sales, Analytics and Targets use one collapsed **Filters** summary.
Expand it to change district, branch, period/month and the current menu's options.
Panel-specific search, date ranges, ranking and analysis controls are grouped
inside it under their panel names; exports and other actions stay outside.
The single branch selection applies across panels instead of separate overrides.
Sales-log From/To dates override the log's period only, and are labelled in the
summary; use **Clear dates** to return to the shared period.

District, branch, month/period and supported panel selections are saved on this
device separately for each dealer/account (demo and live are separate). Switching
menus retains the shared scope; search remains menu-local. Preferences never
grant access: saved district/branch IDs are checked against the accessible roster
on load, and PS scope remains their assigned branch. Analytics retains its
Monthly/All-time analysis choice rather than treating forecasts as YTD totals.

Staff rows have an **Actions** dropdown with only permitted Update, Transfer,
Disable/Restore and Delete operations. Existing confirmation dialogs and server
authorization remain unchanged. Shell v97 includes these UI-only changes.

## Settings

The **Settings** menu collects Import Center (including the existing catalog,
Sales History, Daily Monitoring and branch inventory import tools), alert messages
and push schedules, device notification preferences, Change password and the
Danger zone. Products, Inventory and People no longer duplicate those entry points.
Imports remain available only to authorized stock managers; catalog, sales and
daily imports, alert administration and the Danger zone remain administrator-only.
Password and device settings apply to the signed-in account/device and are
unavailable in the sample demo. Transfer-review notices appear in Settings;
transaction warnings, confirmations and sign-in reminders still appear when needed.
Existing import validation, confirmation and server permissions are unchanged.

## Sales Database versus Sales Summary

The two imports describe the same sales and are never added together. Sales
amounts use the Sales Database for this year and last year, even when individual
days have no invoices. The explicit temporary exception is **October 2026**:
for each branch with an October monitoring summary, the full supplied summary
replaces that branch's entire October database amount (including partial
database imports). A branch without an October summary retains its database
sales. Summary amounts from other months never fill gaps.

Transaction counts use the Sales Summary for each branch/month that has summary
rows, including zero counts; invoice counts are used only for branch/months
without summary rows. Walk-in counts retain their existing priority: entered
store counts, then imported monitoring counts, then PS counts where applicable.
Average sale and conversion use these transaction counts, independently of
sales amounts. Yearly/YTD comparisons, Analytics, branch Overview/Targets and
daily sales summaries share these rules. Invoice logs, product/payment/staff
breakdowns and PS personal sales remain database-only; October's summary cannot
be attributed to individual PSs or products.

`SUMMARY_SALES_MONTHS` in `daily-history.js` records the approved October 2026
exception. Remove it only after confirming October's database import is complete;
the presence of a few October invoices does not prove completeness. This is a
display/aggregation correction, not a deletion or rewrite of imported records.
Shell v98 refreshes the corrected aggregation code offline as well.

## Unified multi-layout importer

Open **Settings > Import Center**. Upload raw Excel
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
Codes are not guessed or automatically populated.

### PS account Salesperson Codes

New PS accounts require a **Salesperson Code**, which automatically becomes their
username in **Add user** and **Add multiple users**. A separate username cannot
override a supplied PS code. Check **Test account** to allow a code-free PS account
with a manually entered Login ID; bulk creation has a checkbox on each row.
The server validates this exemption and records it in the new login's user
metadata. Codes must also satisfy the existing login format rules. Sign-in remains
case-insensitive; source sales-code matching remains exact and case-sensitive.

Administrators can edit a **Salesperson Code** in an existing PS account's
**Update credentials** dialog.
The People list shows codes and supports searching by code; the People and access
export includes them. Leave a field blank to clear it. Enter the exact code from
the sales database: leading zeros and letter case are preserved, with only outer
spaces removed. Codes must be unique within the company, including disabled PS
accounts and other branches.

Both legacy and unified sales imports prioritize a supplied code over the source
name, and require a PS account in the same company and branch. Unknown or
wrong-branch codes remain unassigned rather than falling back to a possibly
incorrect name. Files without codes keep existing name/alias matching. Saving a
PS code does not rewrite existing sales or relink already-imported invoices.
Enter existing PS codes manually before importing new sales databases. Existing
usernames and passwords are not changed by this release or by editing a code.

Staff Profiles shows active accounts only. Open **Disabled accounts** to find
disabled staff, search/filter them, update their details or **Restore** them.
Restoring uses the existing role and branch and returns the account to Staff
Profiles; disabling/restoring never deletes sales or changes credentials.

Apply [`20261126000000_ps_salesperson_codes.sql`](supabase/migrations/20261126000000_ps_salesperson_codes.sql),
deploy the matching `admin-create-user` Edge Function, then publish shell v95.
Shell v96 adds required new-PS usernames and the disabled-account view; deploy
the updated `admin-create-user` function before publishing that frontend.
The account-edit API delegates to existing profile authorization and saves the
code in the same transaction. Account creation stores the code with the profile;
duplicate-code failures roll back the new login.

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

## Sale delivery and DELIVERY GUARRANTY

Apply `20261124000000_delivery_guarranty.sql` before deploying cache v92. New manual sales require **Delivery / Pick up**. Existing sales remain unspecified until edited; existing unspecified sales can retain that value. Fulfillment can be changed through the existing PS/BM sale-edit permissions.

For Delivery, the PS can select **DELIVERY GUARRANTY (DG)** and enter a positive fee (up to two decimal places). Switching to Pick up removes DG when saved. Fees are stored separately from product lines and never contribute to product sales, targets, payment-mix sales, brand performance, inventory quantities or PS sales totals. A fee has no inventory barcode. Each invoice with DG counts once, regardless of product-unit count.

The Sales menu shows DG monitoring only to Branch Managers, District Managers and Administrators within their existing branch scope. It follows the sales log's date, branch and search filters and excludes test sales. Click a PS name for customer, address, invoice/date, fee and total. Manager sales exports include a separate DG worksheet; product sales worksheets remain fee-free. PS accounts can load their own fee only for entry/editing, not other PS fees or the management monitoring.

`save_sale_with_delivery` atomically validates fulfillment/fee, delegates existing address/role/stock/serial checks, and writes the fee. Edits retain the previous fulfillment and fee in edit history. Deleting a sale cascades its fee. Direct fee writes and the old client-facing save API are denied; older clients must reload. No existing sales or imports are reclassified or given DG fees.

PS **+ Record sale** stays at the bottom-right while scrolling. Serialized lines show current available quantity separately from retained sales-only choices. Selecting unavailable stock opens an availability modal and prevents saving unavailable quantities; zero-current-stock items can still use eligible retained serials for late sales. Uninitialized inventory is explicitly unknown, not assumed zero.

Cache v93 uses a compact availability warning, omits the DG explanation from the entry form, and filters known unavailable products out of suggestions. Exact barcode entry and automatically linked outdoor units still validate stock. Saving an unavailable line always reopens the warning, even after dismissing it, before other form validation or any save request. Increasing quantity also validates linked outdoor units. Eligible retained serials and unchanged historical-sale edits remain supported; no database migration is needed for v93.

Cache v94 requires `20261125000000_manual_sale_serials.sql`. DG now occupies the third cell beside Delivery / Pick up instead of a full-width panel. For missed inventory reports, enable **Show unavailable products for manual late-sale serial entry**, select the product, and select **Enter a missing serial manually**. Enter one serial per unit (listed suggestions remain available) and confirm adding missing serials. No reason is required; changing a serial clears confirmation. This is an explicit exception for late sales, not an unrestricted stock override.

The server validates every serial within the existing dealer/branch lock. A previously unknown serial requires explicit confirmation metadata and is recorded as sales-only, with actor/time/sale provenance in `manual_sale_serial_entries`. It does not create stock, invent a receipt date, or deduct current quantity. Available imported units still deduct normally, including mixed listed/manual sales. Existing sold, other-branch available, in-transit and conflicting transferred serials cannot be re-entered as missing. Case-insensitive duplicates are rejected. Uninitialized inventory stays uninitialized, while fully confirmed manual serial sales remain possible. Existing address, fulfillment, role, edit-history and quantity/serial-count rules apply atomically. Edits/deletions preserve sales-only allocation and audit history; direct audit writes and the internal save function are denied to clients.

Focused validation: `node --test sales-delivery.test.js inventory-source-branch.test.js`. Real PostgreSQL integration also uses `sales-delivery-db.test.js` with `BRANCHLINE_PGLITE` and `BRANCHLINE_MIGRATIONS` pointing to the existing PGlite installation and complete foundational migration chain.

## Required sale address and retained serial choices

Inventory report locations must match the selected branch name/code in both the paired-report and unified importers. Explicit mappings cannot relabel Santiago reports as another branch. Current clients attach `source_location` to inventory items; apply [`20261123000000_inventory_source_branch.sql`](supabase/migrations/20261123000000_inventory_source_branch.sql) before deploying cache v91. Both backend import APIs atomically validate supplied provenance, including mixed or blank provenance; older clients that omit it remain compatible.

The approved 2026-11-02 correction backed up and voided three Santiago reports saved under Cauayan/Tuguegarao, removing only their incorrect stock/serial copies and marking those branches' inventory uninitialized until correct reports are imported. Original import events remain, with explicit correction events. Santiago inventory, sales, sale allocations, products, prices and profiles are preserved. Private source manifests, full backups and preservation checks remain in the restricted `branchline_repair_audit` schema. The correction is not part of the schema migration.

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
