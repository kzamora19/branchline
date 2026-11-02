import { inspectWorkbook, sourceLocations, prepareImport, createImportJobs, executeImportJobs, TYPES, FIELDS } from "./unified-import.mjs";

export function openUnifiedImporter(env) {
  const { openModal, escapeHTML: esc, branches, admin, today, XLSX } = env;
  const sheets = [], files = new Set(), failures = new Map();
  let preview = null, jobs = null, reading = false, reviewing = false, saving = false, locked = false, nextFile = 0, revision = 0;
  const branchOptions = [["", "Choose branch"], ...branches.map(branch => [branch.id, branch.name])];
  const select = (name, values, selected, attrs = "") => `<select name="${name}" ${attrs}>${values.map(([id, label]) =>
    `<option value="${esc(id)}" ${String(id) === String(selected) ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
  const input = (label, name, value, type = "text", attrs = "") =>
    `<label class="field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
  openModal({
    title: "Unified file importer", wide: true, submitLabel: "Import reviewed data",
    intro: "Upload different raw Excel / CSV layouts together. Review detected sheets and metadata, map branches, then confirm. Catalog, sales, daily totals and inventory remain separate save steps, not one database transaction.",
    body: `<div data-unified-settings>
      <label class="field"><span>Add Excel / CSV files</span><input name="files" type="file" multiple accept=".xlsx,.xls,.xlsm,.csv"></label>
      <p class="dlg-intro">PDF/OCR and saved Extractor workbooks are not supported in this raw-file stage. Use the original Excel / CSV reports. Files are processed locally.</p>
      ${input("Select current SRP as of", "asof", today, "date", "required")}
      <fieldset><legend>Data to import</legend>
      ${[...(admin ? [["catalog", "Product catalog and current SRP (all dealer branches)"], ["sales", "Historical sales with salesperson codes"], ["daily", "Daily branch totals and walk-ins"]] : []),
        ["inventory", "Replace stock snapshots (complete quantity + serial reports required)"]].map(([id, label]) =>
        `<label class="check-row"><input type="checkbox" name="op-${id}" ${id === "catalog" ? "checked" : ""}>${esc(label)}</label>`).join("")}
      </fieldset>
      <div data-unified-sources></div><div data-unified-maps></div>
      </div>
      <p role="status" data-unified-status>No files selected.</p>
      <button class="button button-outline" type="button" data-unified-review>Consolidate and review</button>
      <button class="button button-outline" type="button" data-unified-download hidden>Download review workbook</button>
      <button class="button button-outline" type="button" data-unified-legacy>Existing import tools / previous batches</button>
      <div data-unified-preview></div>
      <label class="check-row"><input name="confirm" type="checkbox"> I reviewed the preview and warnings. I understand each step commits separately; completed catalog/stock changes have no automatic undo.</label>
      <p data-unified-progress role="status"></p>`,
    onReady: form => {
      const status = form.querySelector("[data-unified-status]");
      const result = form.querySelector("[data-unified-preview]");
      const sources = form.querySelector("[data-unified-sources]");
      const maps = form.querySelector("[data-unified-maps]");
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      const backdrop = form.closest(".dlg-backdrop");
      const guardClose = event => {
        const closing = event.type === "keydown" ? event.key === "Escape"
          : event.target === backdrop || event.target.closest("[data-modal-close]");
        if (!closing) return;
        const partial = jobs?.some(job => job.status !== "pending") && jobs.some(job => job.status !== "done");
        if (saving || partial && !env.confirm("Some steps may already be saved. Closing loses this dialog's retry progress and batch IDs. Close anyway?")) {
          event.preventDefault(); event.stopImmediatePropagation();
          status.textContent = saving ? "An import step is running. Wait for its result before closing." : "Import progress retained. Keep this dialog open to resume.";
        }
      };
      backdrop?.addEventListener("pointerdown", guardClose, true);
      backdrop?.addEventListener("keydown", guardClose, true);
      const invalidate = () => {
        revision++;
        preview = null; jobs = null; submit.disabled = true;
        form.elements.confirm.checked = false;
        result.textContent = "Selection or settings changed. Consolidate and review again.";
        form.querySelector("[data-unified-download]").hidden = true;
      };
      function syncConfig() {
        sheets.forEach(sheet => {
          for (const control of sources.querySelectorAll(`[data-sheet="${sheet.id}"]`)) {
            const field = control.dataset.config;
            if (field.startsWith("col:")) sheet.config.cols[field.slice(4)] = Number(control.value);
            else sheet.config[field] = control.type === "checkbox" ? control.checked
              : ["header", "year", "forecastYear"].includes(field) && control.value ? Number(control.value) : control.value;
          }
          sheet.config.header = Number(sheet.config.header);
        });
      }
      const control = (sheet, label, name, type = "text") => input(label, `s-${sheet.id}-${name}`,
        sheet.config[name] || "", type, `data-sheet="${sheet.id}" data-config="${name}"`);
      function renderMaps() {
        const selected = new Map([...maps.querySelectorAll("select")].map(item =>
          [item.dataset.location ? `loc:${item.dataset.location}` : `div:${item.dataset.division}`, item.value]));
        const locations = sourceLocations(sheets);
        const divisions = new Set();
        sheets.filter(sheet => sheet.config.role === "reference").forEach(sheet => {
          const header = sheet.rows[sheet.config.header] || [];
          const index = header.findIndex(value => String(value).toLowerCase().replace(/[^a-z0-9]/g, "") === "divisioncode");
          if (index >= 0) sheet.rows.slice(sheet.config.header + 1).forEach(row => {
            const value = String(row[index] || "").trim().toUpperCase();
            if (value) divisions.add(value);
          });
        });
        maps.innerHTML = `<h3>Explicit branch mapping</h3><p>No filename or name guess is used to select a branch.</p>` +
          locations.map((name, index) => `<label class="field"><span>${esc(name)}</span>${select(`loc-${index}`, branchOptions, selected.get(`loc:${name}`) || "",
            `data-location="${esc(name)}"`)}</label>`).join("") +
          [...divisions].sort().map((name, index) => `<label class="field"><span>Sales division ${esc(name)}</span>${select(`div-${index}`, branchOptions, selected.get(`div:${name}`) || "",
            `data-division="${esc(name)}"`)}</label>`).join("");
      }
      function renderSources() {
        sources.innerHTML = [...failures].map(([id, message]) => `<p class="connected-error">${esc(message)} <button type="button" class="button button-outline button-small" data-remove-file="${id}">Remove failed file</button></p>`).join("") +
          sheets.map(sheet => {
            const c = sheet.config;
            const attr = name => `data-sheet="${sheet.id}" data-config="${name}"`;
            const columns = [["-1", "Not supplied"], ...(sheet.rows[c.header] || []).map((value, index) => [index, `${index + 1}: ${String(value || "(blank)").slice(0, 60)}`])];
            const rows = sheet.rows.slice(c.header, c.header + 4);
            return `<details><summary>${esc(sheet.file)} / ${esc(sheet.name)} - ${esc(TYPES[c.role])} (${sheet.rows.length} rows)</summary>
              <label class="field"><span>Layout</span>${select(`role-${sheet.id}`, Object.entries(TYPES), c.role, attr("role"))}</label>
              ${c.role === "skip" ? "" : c.role === "daily" ?
                `<label class="field"><span>Branch</span>${select(`branch-${sheet.id}`, branchOptions, c.branch, attr("branch"))}</label>
                ${control(sheet, "This-year columns", "year", "number")}${control(sheet, "This year's cutoff", "cutoff", "date")}` :
                `${control(sheet, "Header row (zero-based)", "header", "number")}
                <details><summary>Column mapping</summary>${Object.keys(FIELDS).map(field =>
                  `<label class="field"><span>${esc(field)}</span>${select(`col-${sheet.id}-${field}`, columns, c.cols?.[field] ?? -1, attr(`col:${field}`))}</label>`).join("")}</details>
                ${c.role === "forecast" ? control(sheet, "Forecast reference year (confirm; not inferred from export date)", "forecastYear", "number") : ""}
                ${c.role === "memo" ? `${control(sheet, "Memo start", "validFrom", "date")}${control(sheet, "Memo end (retained for reference)", "validTo", "date")}${control(sheet, "Memo number", "memoNumber")}` : ""}
                ${c.role === "reference" ? `<label class="check-row"><input type="checkbox" ${attr("repairExcelDates")} ${c.repairExcelDates ? "checked" : ""}>Repair day/month-swapped Excel dates (confirmed legacy exports only; normally leave unchecked).</label>` : ""}
                ${control(sheet, "Source timestamp (ISO with +08:00)", "reportDate")}
                ${["inventory", "serials"].includes(c.role) ?
                  `<label class="check-row"><input type="checkbox" ${attr("complete")} ${c.complete ? "checked" : ""}>Complete report for every included location; missing stock is zero on replacement.</label>
                  ${c.role === "inventory" ? `<label class="check-row"><input type="checkbox" ${attr("blankZero")} ${c.blankZero ? "checked" : ""}>I confirm blank quantity cells mean zero (otherwise they remain unknown).</label>` : ""}
                  <label class="field"><span>Text received-date order</span>${select(`order-${sheet.id}`, [["mdy", "MM/DD/YYYY"], ["dmy", "DD/MM/YYYY"]], c.dateOrder, attr("dateOrder"))}</label>` : ""}
                <div class="table-wrap"><table><tbody>${rows.map(row => `<tr>${row.slice(0, 12).map(value => `<td>${esc(String(value).slice(0, 100))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`}
              </details>`;
          }).join("");
        renderMaps();
      }
      const settingsChanged = event => {
        if (event.target.name === "files" || event.target.name === "confirm" || locked) return;
        syncConfig();
        invalidate();
        if (event.type === "change" && ["role", "header"].includes(event.target.dataset.config)) renderSources();
      };
      form.addEventListener("input", settingsChanged);
      form.addEventListener("change", settingsChanged);
      form.elements.files.addEventListener("change", async () => {
        if (locked || reading) return;
        invalidate(); reading = true;
        form.querySelector("[data-unified-review]").disabled = true;
        try {
          if (!XLSX) throw new Error("Spreadsheet reading is unavailable. Connect and reload.");
          for (const file of form.elements.files.files) {
            const signature = `${file.name}\0${file.size}\0${file.lastModified}`;
            if (files.has(signature)) throw new Error(`Already selected: ${file.name}. Duplicate file selection was not added.`);
            const id = String(nextFile++);
            status.textContent = `Inspecting ${file.name}...`;
            await new Promise(resolve => setTimeout(resolve, 20));
            try {
              if (!/\.(xlsx|xls|xlsm|csv)$/i.test(file.name)) throw new Error("Choose an Excel / CSV source. PDF/OCR is not supported in this stage.");
              const book = XLSX.read(await file.arrayBuffer(), { type: "array", raw: true, cellDates: false, cellFormula: false, cellHTML: false });
              const found = inspectWorkbook(book, file.name, id, XLSX);
              sheets.push(...found);
              files.add(signature);
            } catch (caught) {
              console.error("Unified import file inspection failed.", caught);
              failures.set(id, `${file.name}: ${caught.message}`);
            }
          }
          renderSources();
          status.textContent = `${sheets.length} sheet(s) inspected. ${failures.size} file(s) failed. Review each sheet; exclude unwanted summaries explicitly.`;
        } catch (caught) {
          console.error("Unified import inspection failed.", caught);
          status.textContent = caught.message;
        } finally {
          reading = false; form.elements.files.value = "";
          form.querySelector("[data-unified-review]").disabled = false;
        }
      });
      sources.addEventListener("click", event => {
        const id = event.target.closest("[data-remove-file]")?.dataset.removeFile;
        if (id === undefined || locked) return;
        failures.delete(id); invalidate(); renderSources();
      });
      form.querySelector("[data-unified-legacy]").addEventListener("click", () => {
        if (!locked && !reading) env.openLegacy();
      });
      form.querySelector("[data-unified-review]").addEventListener("click", async () => {
        if (reading || reviewing || locked) return;
        reviewing = true;
        invalidate();
        const reviewedRevision = revision;
        try {
          if (failures.size) throw new Error("Remove failed files or fix them before reviewing; no file will be silently omitted.");
          syncConfig();
          status.textContent = "Consolidating and validating locally...";
          await new Promise(resolve => setTimeout(resolve, 20));
          if (reading || revision !== reviewedRevision) throw new Error("Files or settings changed while reviewing. Wait for file inspection, then consolidate again.");
          const operations = ["catalog", "sales", "daily", "inventory"].filter(id => form.elements[`op-${id}`]?.checked);
          const locationMap = Object.fromEntries([...maps.querySelectorAll("[data-location]")].map(item => [item.dataset.location, item.value]));
          const divisionMap = Object.fromEntries([...maps.querySelectorAll("[data-division]")].map(item => [item.dataset.division, item.value]));
          preview = prepareImport(sheets, { branches, operations, locationMap, divisionMap, asOf: form.elements.asof.value, today,
            knownProducts: env.knownProducts, knownStock: env.knownStock }, env.apis);
          const errors = preview.issues.filter(item => item.severity === "ERROR");
          const warnings = preview.issues.filter(item => item.severity === "WARNING");
          const table = (heads, rows) => `<div class="table-wrap"><table><thead><tr>${heads.map(head => `<th>${esc(head)}</th>`).join("")}</tr></thead><tbody>${rows.map(row =>
            `<tr>${row.map(value => `<td>${esc(value ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
          result.innerHTML = `<h3>Review</h3><p>${preview.catalog.length} catalog products; ${preview.sales.reduce((sum, item) => sum + item.sales.length, 0)} invoices; ${preview.daily.reduce((sum, item) => sum + item.rows.length, 0)} branch/day totals; ${preview.inventory.length} stock replacements; ${preview.salespeople.length} salesperson codes.</p>
            <p>${errors.length} blocking errors; ${warnings.length} warnings. Tables below show the first 20 rows; download the workbook for the complete review and all issues.</p>
            <p>Blank catalog fields preserve existing values; explicit SRP zero is retained. Historical SRPs stay on sale lines. Salesperson codes are retained as text; codes without a configured PS roster match remain unassigned, not name-guessed. Sales are imported before daily totals to avoid double counting.</p>
            ${preview.sales.length ? table(["Sales source", "Invoices", "First sale date", "Last sale date", "Legacy date repairs (rows)"], preview.sales.map(item => [item.source, item.sales.length, item.dateFrom, item.dateTo, item.datesFixed])) : ""}
            ${[...preview.issues].sort((a, b) => ["ERROR", "WARNING", "INFO"].indexOf(a.severity) - ["ERROR", "WARNING", "INFO"].indexOf(b.severity)).slice(0, 30).map(item => `<p class="${item.severity === "ERROR" ? "connected-error" : "dlg-intro"}">${esc(item.severity)}: ${esc(item.message)} ${esc(item.barcode || "")} ${esc(item.source_file || "")}</p>`).join("")}
            ${table(["Barcode", "Brand", "Category", "Subcategory", "Description", "SRP"], preview.catalog.slice(0, 20).map(item => [item.barcode, item.brand, item.category, item.sub_category, item.description, item.srp]))}
            ${table(["Salesperson code", "Original name(s)", "Division(s)"], preview.salespeople.slice(0, 20).map(item => [item.salespersoncode, item.names.join(" / "), item.divisions.join(", ")]))}
            ${table(["Branch", "Products", "Quantity", "Snapshot"], preview.inventory.map(item => [branches.find(branch => branch.id === item.branch)?.name || item.branch, item.items.length, item.items.reduce((sum, row) => sum + row.quantity, 0), item.reportedAt]))}`;
          status.textContent = preview.valid ? "Review ready. No data has been saved." : "Review has blocking issues. Nothing can be saved.";
          submit.disabled = !preview.valid;
          form.querySelector("[data-unified-download]").hidden = false;
        } catch (caught) {
          console.error("Unified import review failed.", caught);
          status.textContent = caught.message;
        } finally {
          reviewing = false;
        }
      });
      form.querySelector("[data-unified-download]").addEventListener("click", () => {
        if (!preview) return;
        try {
          const book = XLSX.utils.book_new();
          const collections = {
            Products: preview.catalog, "Sales History": preview.sales.flatMap(entry => entry.sales.flatMap(sale => sale.lines.map(line => ({
              branch_id: sale.branch_id, invoice: sale.invoice, sold_on: sale.sold_on, salespersoncode: sale.salespersoncode, ps_name: sale.ps_name,
              customer: sale.customer, payment_mode: sale.payment_mode, ...line,
            })))),
            "Daily Monitoring": preview.daily.flatMap(entry => entry.rows.map(row => ({ branch_id: entry.branch, ...row }))),
            Salespeople: preview.salespeople.map(person => ({ salespersoncode: person.salespersoncode, names: person.names.join(" / "), divisions: person.divisions.join(", ") })),
            Inventory: preview.result?.inventory || [], Serials: preview.result?.serials || [],
            Issues: preview.issues, Sources: preview.sources, "Source Evidence": preview.result?.evidence || [],
          };
          for (const [name, rows] of Object.entries(collections)) {
            if (rows.length > 1048575 || rows.some(row => Object.values(row).some(value => typeof value === "string" && value.length > 32767))) {
              throw new Error(`${name} exceeds Excel row/cell limits. Export was not truncated.`);
            }
            XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), name);
          }
          XLSX.writeFile(book, `Branchline-Import-Review-${today}.xlsx`);
        } catch (caught) {
          console.error("Unified import review export failed.", caught);
          status.textContent = `Review export failed: ${caught.message}`;
        }
      });
      form.unifiedSubmit = async () => {
        if (reading || !preview?.valid || !form.elements.confirm.checked) throw new Error("Consolidate, resolve blocking issues and confirm your review first.");
        if (saving) throw new Error("An import step is already running. Wait for its result.");
        saving = true;
        const reviewed = preview;
        try {
          env.checkPermission(preview.operations);
          const setup = await env.rpc("unified_import_capabilities", {});
          if (setup.error || setup.data?.version !== 1) {
            throw new Error(`Unified import backend setup is not available. No writes started. Apply migration 20261119000000 only after confirming the target environment.${setup.error ? ` ${setup.error.message}` : ""}`);
          }
          if (preview !== reviewed || !form.elements.confirm.checked) throw new Error("Review settings changed during setup checks. Consolidate and confirm again.");
          env.checkPermission(reviewed.operations);
          if (!env.confirm(`Import reviewed data into ${env.demo ? "this local demo" : "the live database"}? Each step commits separately. Inventory replaces stock and has no automatic undo.`)) throw new Error("Import cancelled.");
          jobs ||= createImportJobs(preview, env.uuid);
          locked = true;
          form.querySelectorAll("[data-unified-settings] input,[data-unified-settings] select,[data-unified-settings] button,[data-unified-review],[data-unified-legacy]").forEach(control => { control.disabled = true; });
          const progress = form.querySelector("[data-unified-progress]");
          try {
            await executeImportJobs(jobs, env.rpc, job => {
              progress.textContent = `${jobs.filter(item => item.status === "done").length}/${jobs.length} steps saved. ${job.label}. Keep this dialog open to retain retry progress.`;
            });
            await env.refresh();
            return `<p>All ${jobs.length} import steps completed. Inspect Products, Sales History, Daily Monitoring and Inventory as applicable. Existing invoices/days skipped by the backend were not overwritten.</p>`;
          } catch (caught) {
            progress.textContent = `${jobs.filter(item => item.status === "done").length}/${jobs.length} steps confirmed saved. ${caught.message} Keep this dialog open to resume; completed steps will not run again.`;
            throw caught;
          }
        } finally {
          saving = false;
        }
      };
    },
    onSubmit: form => form.unifiedSubmit(),
  });
}
