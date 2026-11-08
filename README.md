# Branchline

### Promotion bundles (shell v149)

Managers, District Managers and Admins can use **Settings → Import promotion
memo** to read one or more selectable-text PDFs locally and review suggested rows. Check all
rows against branch products, then import the clear single-product barcode
matches together. Duplicates, existing promotions, missing product prices,
bundles, missing tag prices and uncertain matches require individual review. The
detected SRP and TAG THIS/NOW PRICE are suggestions and must be checked against
the source; installment values are not substituted for the tag price. If a batch stops on
an error, the screen reports how many rows were saved; check the rows again
before retrying. The PDF
reader is loaded from a pinned CDN, so the first use requires a connection.
Scanned/image-only pages are flagged; OCR is not provided. Check the original
PDF, dates, source prices, and any duplicate barcode warnings. For flagged
rows, map actual branch-catalog barcodes, quantities and paid/free status,
then approve the offer for its branch. PDF extraction can miss rows: compare
the list with the source. A manager can retire an incorrect offer without changing past sales.
Promotional prices do not overwrite catalog SRP.

On Sales, a PS can use **+ Record sale** and search for an approved offer by
its promotion barcode. The bundle expands into its actual products with their
individual standard SRPs and fills the selling price from the reviewed tag
price. Older approved promotions have no saved tag price and require it to be
entered manually, or can be retired and reimported with a reviewed price.
The PS selects the serials
for its actual inventory products. Incomplete dates or conflicting prices
require explicit confirmation; known out-of-period offers are blocked.
This first workflow records one bundle per promotion sale; other distinct
products can be added as regular lines. Every component needs a catalog
SRP under existing manual-sale rules, and paid components must have a positive
combined SRP. The bundle total is allocated to paid units in proportion to SRP,
with free units allocated zero; rounding preserves the total exactly.
The promotion-price migration `20261220000000_promotion_memo_prices.sql`
must be applied before importing priced promotion memos.

Selecting a bundle item in Sales return selects the whole bundle. Choose the
actual serials for all included units; partial bundle returns are blocked.
Bundle sales cannot currently be edited or deleted; return the complete
bundle instead. Apply the four promotion migrations from
`20261216000000_promotion_review.sql` through
`20261219000000_promotion_return_details.sql` before deploying this shell.

### PS assistance comparison (shell v145)

In the daily Walk-in Traffic comparison for Managers, District Managers, and
Admins, a **Clients assisted** column appears before **This year**. It sums PS
daily assistance records within the selected branch scope for each date, so
leaders can compare client assistance with store visitors. An em dash means no
PS assistance was recorded that day; an explicit zero remains `0`. The existing
PS view is unchanged and does not show a duplicate column. The downloaded daily
comparison includes the same column and ordering. The comparison's current and
previous-year store counts and totals use manager-recorded store visitors, or
imported store history when no store entry exists, never PS counts as fallback.
Other traffic analytics retain their existing PS fallback rules. PS totals are
based only on entries received and can be incomplete.

### Collapsible sections (shell v144)

Sales, Analytics, Settings, Targets, and People & access sections start collapsed.
Click a section header to expand its table/chart/content; click it again to hide
the content. The title button also supports Enter/Space and reports its expanded
state to assistive technology. Each section's choice is remembered on this device,
including after filtering, sorting, paging, navigation, or reopening the app.
Header downloads and other controls remain separate and do not toggle the section.
Tables, totals, charts and exports retain their existing data and permissions;
dialog tables and other pages are unchanged. If device storage is unavailable,
preferences last for the current session and a warning is logged.

### Desktop daily sales drilldown (shell v143)

On desktop (over 900px), click a past/current day bar in Sales > Daily sales
summary to open that day's individual invoices. Enter/Space also opens a focused
day. The popup follows the chart's authorized branch scope and current Price/SRP
basis, includes signed returns, and excludes TEST sales. It does not inherit the
separate sales log's search or date range. Click a transaction, or use Enter/Space
on its row, to open the existing transaction details with products and serials.
Empty days explicitly report no invoices. Summary-only historical amounts are
not invented as invoice records; the popup explains possible total differences.
Mobile hover/long-press tooltip behavior and the View table action are unchanged.

### Sales return presentation (shell v142)

The return dialog expands to 1200px on desktop. Its header and close button stay
outside the scrolling form. On screens up to 760px, product lines become labeled
cards with quantities and serial selection on additional rows. Long descriptions
and serials wrap within the screen without horizontal dialog scrolling. Return
validation, permissions and inventory posting are unchanged.

### Sales returns (shell v141)

The Sales page has a **− Sales return** action for Product Specialists (their own
sales), managers (assigned branches), and district managers/admins (authorized
branches). Inventory-only accounts cannot post sales returns.

Search an invoice number or customer name and choose the matching invoice.
Customer, original sale date, branch, salesperson, address and payment details
fill automatically. Check individual product lines, enter partial or full return
quantities, and choose the exact recorded serials. Legacy units without recorded
serials remain blank; no serial numbers are invented. Previously returned units
and serials cannot be returned again.

Posting is immediate: negative quantities at the original selling prices/SRPs
reduce sales on the selected return date, and stock/serials return to the original
selling branch. The return date must be between the sale date and today (Manila).
Existing catalog SRPs are not replaced. A missing stock record initializes with
only the returned quantity, not an inferred historical balance.

Apply `supabase/migrations/20261213000000_sales_returns.sql` and
`supabase/migrations/20261214000000_return_export_serials.sql`, followed by
`supabase/migrations/20261215000000_return_catalog_reactivation.sql`, before publishing
the new shell. Posting, inventory restoration and audit records are one database
transaction, serialized with existing inventory operations. Request keys protect
retries, including changed-payload detection. Original invoices and return
financials/serials cannot be edited or deleted after posting; harmless product
classification/description synchronization remains allowed. Restricted return
audit tables retain the source invoice/line, negative return line, actor, reason,
serials and original product values. Inventory history also records each return.
Restored serials become eligible for resale; later return/resale cycles remain
protected. The demo does not pretend to post live returns.
Older imported negative transactions remain unchanged and are not automatically
matched to original invoices; review them before posting a new return.
Return details and exports use the audited line-to-serial links, including
repeated barcodes with different original selling prices.
Returning an archived product reactivates only its original branch catalog
record, so restored stock stays visible and sellable without changing saved SRP.

### Historical sale downloads (shell v140)

Missing serials no longer block downloads: unnumbered units export with blank
serial cells. Legacy excess serial counts also export blank rather than guessing
an assignment. A serial-load failure leaves serial cells blank and logs a warning,
without blocking the workbook. Valid signed return quantities remain negative in
both sales and brand-log exports, preserving their original amounts. Zero,
fractional or otherwise invalid product quantities still block export explicitly.
This changes downloads only, not saved transactions or serial-entry requirements.

### Table controls (shell v139)

Data-column headers sort ascending/descending throughout the workspace,
including static detail dialogs, daily tables, import review tables and MOH
brand/product drilldowns. Existing paginated tables still sort the complete
filtered dataset before paging. MOH search retains the chosen sort, and its
export follows the filtered/sorted rows with numeric values intact.
Totals, action/selection columns and calendar weekday headings stay fixed.
Download/export controls share an icon-only design with accessible names and
tooltips. Table dialogs place their single-table export at the upper right;
page-wide and multi-table downloads keep their broader scope. The shared table
controls are included in the offline cache.

### Numeric MOH display (shell v138)

Confirmed zero stock value and zero completed sell-out calculate as `0.00` MOH.
MOH card, brand/product dialogs and their exports keep quantitative columns
numeric, displaying unavailable values as zero placeholders while preserving
Status and load-error warnings. The dialogs explicitly identify this convention.
These placeholders do not replace missing data in calculations or saved records.
Stock with no sell-out still has an undefined underlying ratio and a red
`No sell-out` warning; a displayed zero must not be interpreted as healthy MOH.
Missing SRP, unmatched sales, January and failed loads remain flagged rather
than becoming successful zero-valued calculations.

### Confirmed multiword brands

Follow with `supabase/migrations/20261212000000_approved_brand_aliases.sql`
to enforce **all previously approved aliases** on every product and sale-line
write: `ALPHA` -> `ALPHA STEEL`, `MULTI` -> `MULTI-PURPOSE`,
`ROYAL` -> `ROYAL KLUDGE`, and `TOUGH` -> `TOUGH MAMA`.
These match the extraction engine's existing approved alias reference.
Source-verified shortened `FISHER` and `G` resolve only from explicit
`FISHER & PAYKEL` and `G SKILL` description prefixes. Import review uses the same
rules for these, `LA` / `LAGERMANIA` and the American brands; ambiguous shortened
names block jobs before submission, rather than only failing during a save.
Regression tests compare the database behavior with that reference, check all
390 approved labels and preserve all `CON-` labels. Adding an approved alias
requires updating both the import reference and database mapping, with tests.

Apply `supabase/migrations/20261211000000_confirmed_brand_names.sql` to enforce
confirmed names across catalog imports, inventory imports, manual product saves
and sale-line writes. `LA` resolves only when the description explicitly starts
with `LA GERMANIA` or `LA-Z-BOY`; `LAGERMANIA` is the confirmed spelling alias for
`LA GERMANIA`. `AMERICAN` resolves only from an explicit `AMERICAN HOME` or
`AMERICAN MASTER` description prefix. Unresolved `LA` / `AMERICAN` saves fail
with the barcode and a full-brand review message rather than guessing. The
follow-up migration extends that safeguard to unresolved `FISHER` / `G`.
Already complete brand names and other brands, including consignment labels,
are unchanged. Existing role and branch restrictions remain enforced.

The migration installs write safeguards only; existing labels need a separately
audited, backed-up correction against original sources. Do not blanket-merge
American brands or change prices, descriptions, quantities or historical amounts.

### Zero SRP valuation (shell v136)

For MOH, explicit SRP `0.00` is a valid zero stock/sell-out valuation, not missing
pricing, regardless of sales history. A blank SRP is valued at zero only when
there is no recorded product sales history through today in the authorized
loaded data. Prior-year, current-month and offsetting sale/return records still
count as history, although MOH sell-out continues to use completed current-year
months only. Blank prices with history remain flagged. Failed sales loads never
prove that history is absent. Saved product prices are unchanged.

### Branch-wide sales-log timeout repair

Apply `supabase/migrations/20261210000000_brand_scope_read_performance.sql` for
slow branch-wide brand logs. The new dealer/canonical-brand index accelerates
catalog-backed PS scope resolution, including peer assignments. It does not
change RPC results, brand aliases, category scope exclusions, serial allocation,
signed returns, price privacy, or saved sales. Reload the workspace to retry a
previously failed log.

### Inventory SRP read timeout repair

Apply `supabase/migrations/20261209000000_product_read_performance.sql` if the
workspace reports **Unable to load inventory SRP prices** with a statement
timeout. Product SELECT authorization now caches the permitted dealer and branch
sets instead of calling both permission helpers for each product row. Existing
dealer, branch, role, active-account and enabled-dealer restrictions are unchanged.
This complements the earlier inventory-table read optimization; it does not
replace missing SRPs with zero or change recorded prices. Reload the workspace
after applying the migration. No app cache reset is required.

### Analytics MOH summary and drill-down (shell v135)

**Months-on-Hand (MOH)** is now a clickable summary card in the Analytics
metrics grid, after Conversion rate, for both monthly and all-time analysis.
The lower inline brand MOH table is removed. The summary uses total authorized
stock value divided by total average monthly sell-out value, not an average
of individual brand MOH. It shows total available units and priced stock value;
incomplete pricing/loading stays explicit, and MOH above three remains red.

Click the card to open branch/brand detail. Click **anywhere in a brand row**
to view only that branch/brand's products. Rows support keyboard Enter/Space,
and dialogs provide search, Back to brands, numeric exports and normal Close.
The summary and brand totals do not follow the product table's local search.
Branch/district scope and PS brand/category permissions remain enforced.
Export All retains the registered numeric brand summary even though the full
table is no longer rendered inline.

### Live SRP valuation and visible stock quantities (shell v134)

The inventory catalog RPC deliberately omits SRP. Sales-role workspace loading
now separately pages authorized active product prices through normal products
RLS and joins them by **exact branch + barcode**, including refreshes. It does
not reuse another branch's catalog prices. Inventory-only roles still do not
request or receive sales prices. Failed price loading raises an explicit error.

The Analytics **Inventory overview** panel and all its metric cards are removed.
The brand MOH table now shows **Available units** before currency values:
missing SRP does not turn real stock into zero units. Currency columns are
explicitly **priced subtotals**. No recorded sell-out shows numeric zero for
sell-out, monthly average and target value, including brands with missing stock
SRP. Columns count stock/sell-out units missing SRP and unmatched sell-out units.
Uninitialized stock remains unknown. Partial pricing does not produce a valid
MOH; missing prices/unmatched products remain explicit in status. Real failed
sales loads still show unavailable, not invented zero sales. Stock with zero
sell-out retains No sell-out rather than claiming finite zero months of coverage.

### Annual-based three-month stock target and Months-on-Hand (shell v133)

The automatic baseline is net branch/product units sold **January through the
last completed month**, divided by elapsed calendar months (Jan-Oct = 10).
Quiet months count even before the first recorded item sale; the current partial
month is excluded. This assumes the recorded year-to-date data is complete; it
does not prove an item was stocked throughout. January has no completed months
and shows unavailable until a completed current-year month exists.

The visible **3-month stock target** is the unrounded monthly average times 3,
with verified seasonal, approved climate/event and adjustment-month closure
factors, rounded up once. **Adjustment month** chooses those modifiers, not a
different annual averaging window. Historical adjustment months stop learning
before that month. Older complete years remain available for seasonal evidence.
`Re-order qty = max(0, 3-month stock target - available now)`.
Current-month sales are not subtracted again: this is a stock-coverage target,
not the old remaining-single-month-demand calculation. Old saved learning-date
overrides no longer control this table. Technical monthly figures remain in
Show details and exports; the core helper still supports explicit dates for
deliberate historical analysis.

Stock status is available units divided by the **three-month target**, without
rounding the percentage: **Critical <=30%** (red), **Low >30% to 60%** (amber),
**Moderate >60% to 90%** (blue), **Sufficient >90%**. Zero stock with a positive
target is critical and bold. Zero target is No recorded demand, not a
divide-by-zero ratio. Unknown stock and failed demand loading remain explicit.

The product table adds **Months-on-Hand (MOH)**. A separate **Brand
Months-on-Hand (MOH)** box appears in **Analytics**, not Overview. It groups by
authorized branch/brand (PS sees assigned brand/category stock, not other
staff's personal sales). Both stock and completed-year sell-out are valued at
**current catalog SRP**, never selling price, cost or a fallback invented price:

- Average monthly sell-out value = completed-year net units x SRP / elapsed months.
- Three-month target value = unadjusted average monthly sell-out value x 3.
- Actual MOH = available stock value at SRP / average monthly sell-out value at SRP.
- Brand MOH uses summed values, **not an average of product MOH**.

Example: Jan-Oct SRP sell-out 100,000 / 10 = 10,000 per month; target value
30,000. Available stock worth 40,000 gives **4 MOH**, displayed red. Actual
MOH is unadjusted; modifiers affect the unit stock target, not this historical
ratio. Exactly 3 is not red; above 3 is red using the unrounded ratio. Positive
stock with zero/negative net sell-out shows **No sell-out** in red instead of a
finite zero. Missing required SRP, unknown stock, unmatched sold products and
failed sales loads make MOH explicitly unavailable. Brand currency columns
show priced subtotals with missing-unit counts (v134), never a partial-success
MOH. Zero units do not require a fictitious valuation.
January shows No completed months, never a prior-year fallback.

Product search does not filter brand totals. Basic/detail modes, sorting,
pagination and numeric exports retain both MOH tables; currencies and MOH are
formatted only on screen. Annual MOH uses all completed current-year months
regardless of adjustment month or Analytics sales display filters.

The basic product table replaces Units sold with **Annual sell-out (YTD)**:
authorized branch-wide product units, net of returns, from January 1 through
today. It is independent of Analytics display dates and forecast learning/target
dates, including for PS accounts. Negative net returns remain visible. Show
details and downloads retain selected-period units separately (personal for PS);
sales amounts retain their original scope. No peer identities or prices are
added. Calendar errors block forecasts but do not hide successfully loaded annual
sales; a failed branch-sales load shows Unavailable, never personal sales or zero.

### Settings-only event calendar (shell v131)

The full event calendar is now shown only in Settings, not Analytics. Event
details, memo links, campaign colors and authorized management remain available
there. Forecasts still use calendar events, approved adjustments and store
closures; only the duplicate calendar display was removed.

### Basic inventory/product view and search (shell v130)

Inventory and product sales now defaults to Branch, Barcode, Product, Brand,
Category, Sub-category, Available now, Annual sell-out (YTD), 90+ day serials,
3-month stock target, Re-order qty, Stock status, Movement status and MOH. Sales amounts, duplicate observations
and technical forecast columns are hidden until **Show details** is checked.
The lengthy notice above this table is removed entirely, including in the detail
view. Real forecast-loading errors and red shortage warnings remain visible.

The table's own **Search products** field searches all authorized rows, not just
the current page, by branch, barcode, product/model, brand, category or
subcategory. Search is case-insensitive, resets this table to page one and does
not filter other Analytics panels or change forecast history. Clear it to restore
all scoped products. Search/details reset on account changes. Downloads retain
all numeric source columns; Export All ignores this local search as it does
other display filters.

Automatic learning and stock-target policy follow shell v133 above. Longer
history remains available for verified two-year seasonal patterns.

Movement status is independent of stock status: fewer than one net branch unit
per month with at least three calendar history months is **Slow moving**; higher
rates are **Regular movement**. Separate labels identify No recorded net sales,
Insufficient history and unavailable demand. Show details includes the branch
units, history dates/months, rate and movement explanation. One sale across a
year with two available units, without a justified demand increase, forecasts
one unit and reorders zero when there is one sale across ten completed current-year
months. Detailed selected-period PS units remain personal; demand
and movement consistently use the authorized whole-branch product history.

### Campaign calendar colors (shell v129)

Major Sale Event dates are orange/gold, Major Campaign dates purple and Special
Campaign dates teal, with a soft static glow (no flashing). Regular campaigns
and other events remain blue. The highlight follows scheduled occurrences only,
including weekday repeats. Overlaps show one color in this priority order:
store closure (red), Major Sale Event, Major Campaign, Special Campaign, regular.
Hover or focus a date to identify the highlighted campaign type; open the date
to see every applicable event. Today's outline and keyboard focus are retained.

### Event status labels (shell v128)

Event details omit the redundant "Store open" label. Only closures display
"Store closed"; closure calculations and event management are unchanged.

## Recurring promotions and memo links (v127)

In the Event calendar, choose **Add event / closure**, enter the required start
and end dates, then choose **Every weekend (Sat + Sun)** or select other weekly
days. The app saves one event series and highlights only its scheduled dates.
The form previews the number of dates; editing or cancelling affects the whole
series. Existing events continue to occur every day within their date range.

Campaign types include Major Campaign, Major Sale Event, Special Campaign and
Regular Campaign, plus a custom campaign type. These are descriptive
classifications, separate from the event's store-open/closed status.

Add any number of named memo/mechanics links. Clicking a highlighted calendar
date shows the campaign, schedule and links; links open in a new tab for all
users allowed to view that event, including inventory roles through Settings.
Only HTTP(S) links without embedded login credentials are accepted. Google Drive,
SharePoint or other document permissions must separately allow recipients to
open them; Branchline cannot override external sharing restrictions.

Apply `supabase/migrations/20261208000000_recurring_calendar_memos.sql` after the
event-calendar migration before deploying this UI. It preserves existing events
and approval snapshots. Weekday recurrence applies to store closures, forecast
exposure, calendar details and monthly approval eligibility. Promotion schedules
do not invent sales uplift: an authorized reviewer must still approve a combined
monthly demand adjustment. Edits revoke previous related approvals. Export All
includes campaign types, weekday schedules and named links.

Event-detail Edit, Cancel event and Revoke buttons are handled inside their
dialog rather than the underlying page, so they open their respective forms.

### Date-driven calendar layout (shell v126)

Analytics no longer displays the external monitoring notice; monitoring setup,
approval controls and health remain in Settings. Forecast eligibility, failure
handling and numerical calculations are unchanged.

The calendar uses seven equal weekday columns. Event dates are bold blue;
dates including store closures are bold red. Click or keyboard-activate a date
to view all applicable events, company closure details, permitted edit/cancel
actions and related approval history. Date cells contain numbers only; the
event list, empty-state messages and explanatory notes below the grid are removed.
Existing closure records, approval audit and exports are retained.

### Contribution chart details (shell v125)

PS contribution-chart clicks render the authorized price-free branch brand log
directly, independently of personal sales-page rendering. A failed log request
retains the popup source and shows its actual loading error and reload guidance;
it is never replaced with a missing-table alert or a false zero-sales table.
Successful and empty logs retain existing filters, pagination and exports.
Multi-brand assignments use the same authorized log, not a personal-sales fallback.

### Workspace loading and action buttons (shell v124)

Live calendar/climate loaders use the shared paginated query helper with an
explicit client, including initial sign-in and later refreshes. Query failures
remain visible; the demo never queries live monitoring tables.

Normal action buttons use solid brand blue with white text, consistent hover
and visible keyboard focus. Destructive actions keep red styling; disabled
buttons retain their disabled appearance/behavior. Stateful toggle buttons
(including stock availability) retain distinct selected/unselected styles.
Navigation, tabs and icon-only controls retain their existing purpose-specific
styles.

### Event calendar and store closures (shell v123)

**Settings > Event calendar** and the **Analytics inventory section** display
a monthly calendar plus event details and approval history. Admins and district
managers can manage company-wide events or selected branches; branch managers
can manage only events entirely within their assigned branches. PS and inventory
roles cannot edit or approve. Events cover inclusive date ranges and include
promotions, mall sales, holidays, local events, closures and other events.
A holiday does not imply the store is closed: explicitly mark full-day closures.
Existing **Store-closed dates** remain company-wide and appear in the calendar;
they are not migrated, deleted or duplicated.

Closures apply immediately to selling-day calculations. Product forecasts assume
every day is open unless recorded closed. Historical exposure is normalized as
open days divided by calendar days for each observed month; this avoids treating
known closures as quiet selling days. Seasonal category totals are normalized
the same way. The target month's full-month baseline is scaled by its open-day
fraction. Overlapping closure events and old company dates count once per day.
If there are no remaining open days, remaining demand/reorder is zero. Unknown
history or stock remains unknown. **History months** now reports open-day
equivalents; with no closures results remain unchanged. Analytics sales pace uses
the selected weekday basis and average open branch-days across scoped branches.
Closure impact assumes equal demand across otherwise open days, not a proven
weekday sales pattern; partial-day opening hours are not inferred.

Open-store events are informational until an admin, district manager or assigned
branch manager approves one **combined monthly event percentage** per
branch/category/month, selecting the supporting events and justifying the number.
No percentage is prefilled or inferred from an event title. Replacement/revocation
preserves the approval audit and event snapshots; editing/cancelling any referenced
event revokes related approvals. Branch/category/month and current event validity
are checked both server-side and before application. Approval is limited to the
current month through twelve months ahead.

Approved event and climate percentages multiply separately on the unrounded,
calendar-adjusted seasonal baseline, followed by rounding up, subtracting
nonnegative net fulfilled units and available stock. Reviewers must avoid
double-counting causes already reflected in seasonality/climate. For example,
baseline 30 units, 15 of 30 days open, climate +20% and combined events +10%
gives `ceil(30 * 0.5 * 1.2 * 1.1) = 20` units before fulfillment/stock.
Exports append open days, remaining open days, calendar factor, event percentage
and justification, with numeric quantities preserved. Export All also includes
calendar records and event approval audit sheets.

Deploy `20261207000000_event_calendar.sql` after existing migrations before
publishing this frontend. Failed calendar loading is explicitly reported and
disables item forecasts, rather than silently ignoring unknown closures.
No event, closure or approval is seeded into live business data.

### Official climate evidence and approved demand adjustments (shell v122)

**Settings** and **Analytics > Inventory and product sales** show official ENSO
evidence separately from forecasts. The daily `forecast-climate` monitor reads
only the fixed NOAA CPC ENSO bulletin URL, validates its issue date and alert
status, and never sends sales, customers, staff or branch coordinates to NOAA.
It does not scrape general news, generate an uplift percentage, or pretend a
global ENSO advisory is a local temperature forecast. Local weather is explicitly
**unavailable** until a suitable verified official public integration exists.
No paid weather endpoint or non-commercial business API is used.

Admins verify each branch's city/province and map coordinates. Admins, district
managers and assigned branch managers may review a fresh official advisory,
enter a category/month percentage and a substantive local justification, and
approve it. PS users cannot approve. Approval is never automatic; zero is a
valid reviewed adjustment and negative percentages reduce demand (minimum -100%).
One active decision per branch/category/month is allowed; replacement and
revocation preserve the approving/revoking identities and timestamps. Changing
a location revokes its active adjustments for fresh review.

Applied adjustments require verified location, non-revoked approval, matching
branch/category/month, evidence no more than 45 days old and a successful source
check within 48 hours. Source failures or stale evidence visibly disable
external adjustments; the existing baseline remains available, not an invented
weather estimate. The approved percentage multiplies the **unrounded** seasonal
estimate before rounding up, deducting fulfilled demand and available stock.
Exports retain baseline forecast, approved percentage and justification.
Net returns cannot make fulfilled demand negative: if forecast-month net sales
are negative, zero fulfilled units are deducted rather than inflating demand.

Deployment, in order:
1. Apply `20261206000000_forecast_climate_review.sql` after existing migrations.
2. Deploy `supabase/functions/forecast-climate/` with gateway JWT verification
   off. The handler verifies real administrator sessions itself; scheduled calls
   require the existing `CRON_SECRET` in `x-cron-secret`. Use built-in service
   credentials only in the backend; never put secrets in frontend configuration.
3. Configure Supabase Cron to POST to `forecast-climate` daily, e.g.
   `0 22 * * *` (06:00 Asia/Manila), using protected scheduler credentials (Vault
   preferred; an existing authenticated project schedule can be reused server-side). Do not copy
   secret values into source, logs or chat. A saved schedule alone is not proof
   of operation: invoke it and verify a successful persisted source check.
4. Verify branch locations in Settings, then review evidence. No branch
   coordinates or demand adjustments are prefilled or invented.

Monitoring covers ENSO context only, not every possible demand driver.
Promotions, supplier lead times, incoming orders, economic changes and
unrecorded lost sales are not automatically inferred.

### Seasonal product stock forecasts

**Forecast month** defaults to the current month and can be changed in **Filters >
Inventory and product sales**. The forecast multiplies each item's recorded
monthly average by its branch/category's seasonal factor before rounding up.
The factor is target-calendar-month units divided by overall average monthly
category units across qualifying years. Category labels ignore case and spaces;
different branches are never pooled. PS patterns use only their authorized
brand/category log, not inaccessible brands or peer prices.

At least two complete prior calendar years must lie inside Forecast from/to,
with recorded positive authorized branch/product activity in all twelve months
and category activity in each qualifying year. Category months without sales
count as zero only within these observed branch years, so Q4-only categories
can have quiet first-three-quarter months and higher October/November/December
forecasts. Missing branch months are not assumed to be zero. This uses recorded
activity as coverage evidence, not proof that imports are complete.
Returns reduce category demand; negative monthly net units are clamped to zero
when learning the seasonal shape. Incomplete years, unknown categories
or insufficient history use factor 1 and **Monthly average (insufficient seasonal
history)**. No hardcoded summer boost is applied. Current-month forecasts include
elapsed sales through today. For other target months, learning dates stop before
the forecast month and never after today, preventing historical target-month hindsight.
**Forecast month**, numeric **Seasonal factor**, and **Forecast basis** accompany
each row and its downloads, including Export All. The target-month choice is
saved per account; clear/invalid months are rejected or reset on restore.

Analytics **Inventory and product sales** uses the annual-based three-month
target and MOH rules documented in shell v133 above. Monthly forecast, monthly
fulfillment and remaining monthly demand remain technical details, not the
stock-target reorder formula. Sorting preserves horizontal scroll. Detailed
selected-period units/Sales and other Analytics panels retain their own period.

Forecasts use shared branch demand even for PS accounts, via the existing complete
price-free brand log. **Annual sell-out (YTD)** is branch-wide; PS detailed
selected-period units and **Sales** remain personal and forecasts
stay within assigned brand/category and authorized branches. No peer prices or
customer details are added. Branch/barcode pairs are separate; barcode leading
zeroes are retained. Current available stock excludes reserved/in-transit units.
Coverage of the three-month target at/below 30% is critical, through 60% low,
through 90% moderate and above 90% sufficient.
Zero stock with a positive target is critical and bold.
Zero forecast is labelled **No recorded demand**.

Unknown stock has an unknown re-order quantity, not a zero balance. A failed
branch-demand load shows an explicit error and unavailable forecasts, never a
personal-sales substitute. No elapsed history means forecast unavailable.
These are three-month recorded-sell-out stock targets, not supplier orders or
lead-time/safety-stock estimates. Summary-only sales have no item quantities and
are not apportioned; incomplete recorded history can understate actual demand.
Table downloads and Export All include numeric forecast/re-order columns and
plain-text stock alerts.

Apply migration `20261205000000_brand_log_returns.sql` after the itemized-export
migration. It fixes `LIMIT must not be negative` for imported returns: signed
quantities remain unchanged, while serial allocation only consumes positive sale
units. Existing RPC authorization, grants and price privacy are unchanged.

Branchline is a sales tracker for Product Specialists and branch teams.

## Compact filters and staff actions

PS **My sales log** highlights **My total sales** in the left card instead of
the small header note. It totals all matching log rows across pages, following
the period, log dates and search, excluding TEST sales. The right **My daily
sales** card retains today's/selected day's total, or **My date-range sales**
when log calendars are set; search does not change that card. Both follow the
selected Price/SRP comparison basis. Other roles' cards remain unchanged.

For every role, Overview no longer repeats the **Brand performance** table
below the charts. Click **Sales by brand** to open that table, including sort,
pagination, product drilldowns and download. Empty charts also open the table.
Export All still includes brand performance; Targets' brand table is unchanged.

Spreadsheet/CSV exports include separate Sales code and PS name columns.
Unattributed stock, target and summary rows leave them blank; they never use the
downloading account as the seller. Imported sale codes are preserved as text,
including leading zeroes, with linked profile codes used only when absent.
Sales downloads, PS/brand breakdown downloads and Export All itemize recorded
serials into separate rows (quantity 1 each), repeating transaction/product
details and prorating extended amounts through each row's quantity. Quantities
without serials remain in a blank-serial remainder row, so quantities and totals
are preserved. Repeated-barcode lines receive disjoint serial slices. Brand-wide
PS exports remain price-free, and stock transfers also use one serial per row.
Apply migration 20261204000000_itemized_brand_exports.sql before shell v116;
the versioned RPC adds export metadata without changing the existing RPC.
PNG chart downloads remain images, not tabular data exports.

Brand targets and PS brand matching recognize slash-separated groups, such as
FUJIDENZO / WHIRLPOOL and MIDEA / TOSHIBA. Each row has one combined target.
A category suffix belongs only to its part: CARRIER / CONDURA - AIRCON includes
all Carrier products and only Condura air conditioners. In that branch/month,
a separate general CONDURA target excludes the category claimed by the scoped
target. General PS assignments likewise exclude active peers' category scopes.
CON- brand prefixes are ignored for matching (CON-DEVANT = DEVANT), including
targets, PS contributions, branch-wide brand logs and PS inventory views.
Other known hyphenated brand names remain intact. Stored product/sale/assignment
labels are not rewritten. Apply migration 20261203000000_canonical_brand_matching.sql
with shell v115 to align the live contribution/log RPCs with client matching.

The PS Sales **+ Record sale** button stays fixed at the lower-right corner
while scrolling, independently of the filter container (shell v103).

Overview, Sales, Analytics and Targets use one collapsed **Filters** summary.
Expand it to change district, branch, period/month and the current menu's options.
Expanded filters float over the next panel without shifting page content.
Click outside, press Escape, or click the Filters header to collapse them.
The expanded body scrolls within the available viewport height on small screens.
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

The Daily sales summary hover, keyboard-focus and mobile long-press details
include walk-ins (personal clients assisted for PS) and conversion rate.
Conversion matches Analytics: unique transactions on counted branch-days divided
by their traffic. Store counts override summed PS counts; historical fallback and
role/branch scope are retained. Missing counts display Not recorded; zero traffic
displays 0 with conversion n/a. Partial branch coverage is labeled.

Daily Clients assisted / Walk-in traffic popups support X, Close, outside click
and Escape. These read-only views have no save-in-progress form guard; shell
v113 fixes a stale form reference that previously blocked pointer dismissal.

**Store-closed dates** now lives in Settings instead of Analytics (shell v104).
PS and branch managers can view the dates; district managers and administrators
retain Add/Delete. Existing dates, forecasts and export data remain unchanged.

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
amounts use the Sales Database, even when individual days have no invoices.
**2025 fallback:** branch/months with no database sales use the supplied
Sales Summary total. Any database sales in that branch/month (even zero-value
invoices) keep the entire month database-only. The temporary exception is **October 2026**:
for each branch with an October monitoring summary, the full supplied summary
replaces that branch's entire October database amount (including partial
database imports). A branch without an October summary retains its database
sales. Other 2026 summary amounts never fill gaps.

Transaction counts use the Sales Summary for each branch/month that has summary
rows, including zero counts; invoice counts are used only for branch/months
without summary rows. Walk-in counts retain their existing priority: entered
store counts, then imported monitoring counts, then PS counts where applicable.
Average sale and conversion use these transaction counts, independently of
sales amounts. Yearly/YTD comparisons, Analytics, branch Overview/Targets and
daily sales summaries share these rules. Invoice logs and product/staff
breakdowns and PS personal sales remain database-only; October's summary cannot
be attributed to individual PSs or products.

Verified monitoring channels can supply the last-year payment comparison for
empty 2025 database branch/months (never PS personal reports). Comparison groups:
Cash + COD = Store Operations; Debit Card + Credit Card = Credit Card;
Non-Store = Digital Payment; Deferred = Flexi Deals; Goldmine = Gold Mine;
Techzone, Home Credit, Corporate and Subdealer retain their corresponding groups.
Entry choices and original transaction payment labels are unchanged. Targets
are summed within each group, counting each branch/month's target base once.
Apply `20261128000000_monitoring_payment_breakdown.sql` before deploying this UI.
Re-import the monitoring workbook to load channels omitted by older imports.
The new admin-only import validates channel totals and fills only missing
breakdowns whose saved sales and invoice counts match; it never replaces saved
daily totals or existing breakdowns. Skipped/conflicting breakdowns are reported.

`SUMMARY_SALES_MONTHS` in `daily-history.js` records the approved October 2026
exception. Remove it only after confirming October's database import is complete;
the presence of a few October invoices does not prove completeness. This is a
display/aggregation correction, not a deletion or rewrite of imported records.
Shell v98 refreshes the corrected aggregation code offline as well.

## Administrator sale corrections and item prices

Administrators can **Edit** or **Delete** an existing sale in its transaction pop-up.
Editing keeps the original branch and Product Specialist attribution. Active
administrators can correct sales across their dealer's branches, including older
sales; they still cannot record new PS sales. Other roles retain their existing
editing scope. Customer, price, quantity, serial, address, payment, fulfillment
and Delivery Guarranty corrections use the existing audited, atomic save flow.
Inventory reconciliation and serial-availability checks remain in force.

The Sales log is a compact summary: Transaction/Invoice, Customer, Sale date,
Product Specialist, Branch and Total. Click anywhere on a row (or focus the row
and press Enter/Space) to open the full transaction. Product/address/serial
search and detailed sales exports still work even though those details are
hidden from the summary. All roles can inspect sales already visible within
their authorized scope; this does not grant access to additional transactions.

The pop-up shows customer/address, payment, fulfillment, PS/branch, recorded
date, products, barcodes, recorded SRPs and the overall quantity/transaction
total. Product, Serial number, Qty and Unit price are shared column headers;
there is no repeated price label or line-total column. Quantity remains visible
because a multi-unit line's amount is unit price times quantity. Non-serialized
products show a dash; repeated barcode lines consume serials in line order.
Edit/Delete move into the pop-up and keep their existing permissions. DG fees
remain separate from sales and read-only monitoring remains BM-and-above only.
Shell v101 refreshes the compact summary and pop-up.

Apply `supabase/migrations/20261127000000_admin_sale_edit.sql` before deploying
shell v99. It changes only function permissions/authorization logic, not existing
sales records. The migration fails closed if the expected function guards differ.

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

The signed-in PS sidebar shows `Name - Sales code`, preserving leading zeroes.
Accounts without a configured code show only the name; other roles are unchanged.

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

## Sales comparison basis

Manual Record Sale and sale corrections require a non-negative SRP on every product line, including added/linked units. Catalog SRP still fills automatically; if unavailable, the user must enter it. Explicit zero remains valid. Delivery also requires an explicit DG amount; enter **0.00** for free delivery. Pick up hides DG and removes it when saved. Apply `20261201000000_manual_sale_required_srp.sql` and `20261202000000_delivery_required_dg.sql` before shell v111. The database and demo reject missing required values before a manual save, without changing historical records, catalog/import rules or other sale permissions.

Overview, Sales, Analytics, rankings and report exports share a per-account **Sales comparison basis** filter. **Selling Price** is the default. **SRP (selling-price fallback)** uses each saved sale-line SRP times quantity, including an explicit zero SRP. Missing SRPs and imported summary-only totals/payment channels retain selling-price amounts, clearly labelled as a mixed-basis comparison. The PS contribution chart follows the same selection without revealing other staff's amounts. Inventory-only roles retain their existing access and do not gain sales reporting.

This is display-only: targets, transaction unit prices, entry/edit forms, original record exports, DG fees, stock and pace notifications are unchanged. Transaction details show the actual transaction total separately from the SRP comparison. Sales-report exports follow the selected basis and include a comparison-basis information sheet; Export All retains raw actual amounts plus a separate comparison amount and applies the selection to generated reports. Filters are remembered per account/device. Apply `20261130000000_srp_comparison_fallback.sql` before shell v110; it changes only missing-SRP fallback in the existing scoped contribution calculation, not saved prices or permissions.

## Sale delivery and DELIVERY GUARRANTY

Apply `20261124000000_delivery_guarranty.sql` before deploying cache v92. New manual sales require **Delivery / Pick up**. Existing sales remain unspecified until edited; existing unspecified sales can retain that value. Fulfillment can be changed through the existing PS/BM sale-edit permissions.

Delivery requires an explicit **DELIVERY GUARRANTY (DG)** amount, zero or positive with up to two decimal places. Enter **0.00** for free delivery; it remains a DG invoice with a zero fee. Switching to Pick up removes DG when saved. Fees are stored separately from product lines and never contribute to product sales, targets, payment-mix sales, brand performance, inventory quantities or PS sales totals. A fee has no inventory barcode. Each invoice with DG counts once, regardless of product-unit count. The preceding `20261129000000_free_delivery_guarranty.sql` migration permits zero fees; shell v111 additionally requires the DG value for Delivery.

The Sales menu shows DG monitoring only to Branch Managers, District Managers and Administrators within their existing branch scope. It follows the sales log's date, branch and search filters and excludes test sales. Click anywhere on a PS row (or focus it and press Enter/Space) for customer, address, invoice/date, fee and total. Manager sales exports include a separate DG worksheet; product sales worksheets remain fee-free. PS accounts can load their own fee only for entry/editing, not other PS fees or the management monitoring.

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

The branch-wide brand log loads every permitted line using the same paginated, price-free RPC as Export All, rather than the legacy capped log. Its branch, assigned-brand/category and test-account scope matches the contribution aggregate. A failed detail request displays an explicit load error, not a misleading "no sales" message; the independently loaded chart can still be available.

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
