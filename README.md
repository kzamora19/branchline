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

Products consolidate by barcode. Current SRP belongs in the catalog; historical
SRP stays on sale lines. Conflicting prices, unreadable barcodes, incomplete stock
coverage, and other blocking issues must be resolved before saving. Missing
catalog values are not invented; new products require brand and description.
Download the full review workbook to inspect source evidence and all issues.

Salesperson codes remain text, including leading zeros. Code-based assignment
requires an exact configured `profiles.salesperson_code` within the same dealer
and branch. Unknown codes remain unassigned with their source names retained.
This release does not assign roster codes or provide a roster editor.

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
