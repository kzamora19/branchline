# Branchline

Branchline is a sales tracker for Product Specialists and branch teams.

## Import Center (first stage)

Admins open **Products > Import Center** to choose Product catalog, Sales History, Daily Monitoring, or Branch inventory. **Inventory > Import stock** also opens the center; non-Admin stock managers see only Branch inventory, and PS users have no import access.

Choosing Branch inventory opens the existing inline paired-report form and retains the selected branch/district scope. Each route retains its existing formats, validation, preview/confirmation, permissions, save rules, and recovery behavior. Opening the center does not save anything; route changes are blocked while a save is running.

**Extractor consolidated workbooks are not supported yet.** Extractor workbook integration, including dedicated Sales History, salespersoncode/directory, and Daily Monitoring sheets, remains future work. This frontend update applies no Supabase migrations; the existing importer backend requirements still apply.
