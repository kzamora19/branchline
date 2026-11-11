import { inspectPromotionPdf, promotionPdfCandidates } from "./import-engine/promotion-pdf.mjs";
import { preparePromotionImport } from "./import-engine/promotion-import.mjs";
import { promotionSheetCandidates } from "./import-engine/promotion-sheet.mjs";

const PDF_READER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.mjs";
const PDF_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs";

export function openPromotionReview(env) {
  const { openModal, escapeHTML: esc, branches, companyImport = false, rpc, findProducts, listProducts, listPromotions, confirm } = env;
  let candidates = [], revision = 0, selected = null, saved = new Set(), prepared = [], importing = false;
  const component = () => `<div data-promotion-component class="dlg-grid">
    <label class="field"><span>Actual product barcode</span><input data-product-code required autocomplete="off"></label>
    <label class="field"><span>Quantity</span><input data-product-quantity type="number" min="1" max="999999" step="1" value="1" required></label>
    <label class="field"><span>Paid or free</span><select data-product-free required><option value="false">Paid</option><option value="true">Free</option></select></label>
    <button class="button button-outline" type="button" data-remove-component>Remove product</button></div>`;
  openModal({
    title: "Import promotional memo", wide: true, submitLabel: "Approve selected exception",
    intro: "Choose your promotion files and import them. Clear matches are saved automatically; only uncertain rows need attention.",
    body: `${companyImport ? '<label class="field"><span>Import scope</span><select name="scope"><option value="company">All branches</option><option value="branch">Selected branch only</option></select></label>' : ""}
      <label class="field"><span>Branch for exception review</span><select name="branch" ${companyImport ? "" : "required"}><option value="">Choose branch</option>${branches.map(branch => `<option value="${esc(branch.id)}">${esc(branch.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Promotion files</span><input name="file" type="file" accept=".pdf,.xlsx,.xls,.csv,application/pdf" multiple></label>
      <div class="dlg-grid"><label class="field"><span>Start date, if missing from files</span><input name="batch_from" type="date"></label>
      <label class="field"><span>End date, if missing from files</span><input name="batch_to" type="date"></label></div>
      <button class="button button-primary" type="button" data-import-files>Import files</button>
      <p data-simple-status role="status">Choose one or more files to begin.</p>
      <details data-import-details><summary>Import details and exceptions</summary>
      <button class="button button-outline" type="button" data-read-pdf>Read files</button>
      <p data-pdf-status role="status">Choose one or more files and read them first.</p>
      <button class="button button-outline" type="button" data-prepare-import>Check files against products</button>
      <p data-import-status role="status">Read the files and check their rows.</p>
      <div data-import-results></div>
      <button class="button button-outline" type="button" data-import-ready disabled>Import clear matches</button>
      <p>For a row marked for review, choose it below and check the actual products before approval.</p>
      <label class="field"><span>Suggested offer row</span><select name="candidate"><option value="">Read files first</option></select></label>
      <p data-candidate-warnings role="status"></p>
      <label class="field"><span>Promotion barcode</span><input name="barcode" maxlength="80" required></label>
      <label class="field"><span>Promotion description</span><input name="description" maxlength="500" required></label>
      <div class="dlg-grid"><label class="field"><span>Memo SRP (optional)</span><input name="memo_srp" type="number" min="0" max="9999999999.99" step="0.01"></label>
      <label class="field"><span>Tag / now selling price</span><input name="tag_price" type="number" min="0" max="9999999999.99" step="0.01" required></label></div>
      <div class="dlg-grid"><label class="field"><span>Start date (leave blank if unknown)</span><input name="valid_from" type="date"></label>
      <label class="field"><span>End date (leave blank if unknown)</span><input name="valid_to" type="date"></label></div>
      <label class="field"><span>Conflicting prices or terms for this barcode?</span><select name="price_conflict" required>
        <option value="">Review and choose</option><option value="false">No conflict found</option><option value="true">Conflict or uncertainty found</option></select></label>
      <label class="field"><span>Source evidence (read-only)</span><textarea name="evidence" readonly></textarea></label>
      <fieldset><legend>Actual products included in one bundle</legend><p>Enter the real inventory barcode and quantity for each paid or free item. Add separate rows when the same barcode has paid and free units.</p>
        <button class="button button-outline" type="button" data-match-products>Suggest matching branch products</button>
        <p data-match-status role="status"></p><div data-match-results></div>
        <div data-components>${component()}</div><button class="button button-outline" type="button" data-add-component>Add product</button></fieldset>
      <label class="check-row"><input name="confirm_review" type="checkbox" required> I checked the source, dates, terms, product barcodes, quantities and paid/free status.</label>
      <p data-save-status role="status"></p>
      <details><summary>Reviewed promotions in selected branch</summary><button type="button" class="button button-outline" data-refresh-promotions>Refresh list</button><p data-list-status role="status"></p><div data-promotion-list></div></details></details>`,
    onReady: form => {
      const status = form.querySelector("[data-pdf-status]");
      const candidate = form.elements.candidate;
      const details = form.querySelector("[data-import-details]");
      const exceptionSubmit = form.querySelector('[type="submit"]');
      if (exceptionSubmit) exceptionSubmit.hidden = true;
      details.addEventListener("toggle", () => { if (exceptionSubmit) exceptionSubmit.hidden = !details.open; });
      if (!companyImport && branches.length === 1) form.elements.branch.value = branches[0].id;
      const renderResults = company => {
        form.querySelector("[data-import-results]").innerHTML = prepared.map((item, index) =>
          `<div class="field"><span>${esc(`${company ? `${item.branchName} · ` : ""}${item.row.barcode} · ${item.row.description || "(description missing)"} · ${item.ready ? `Ready: ${item.components.map(part => `${part.barcode} × ${part.quantity} ${part.free ? "free" : "paid"}`).join(", ")}` : `Review: ${item.reasons.join(" ")}`}`)}</span>
          <small>${esc(`${item.row.sourceName}, page ${item.row.sourcePage}: ${item.row.sourceExcerpt}`)}</small>
          <small>${esc(`Memo SRP: ${item.row.memoSrp ?? "not detected"} · Tag price: ${item.row.tagPrice ?? "not detected"}`)}</small>
          ${item.ready || item.imported ? "" : `<button type="button" class="button button-outline button-small" data-review-row="${index}">Review this row</button>`}</div>`).join("");
      };
      let listRevision = 0;
      const refreshPromotions = async () => {
        const branch = form.elements.branch.value, token = ++listRevision;
        const listStatus = form.querySelector("[data-list-status]"), target = form.querySelector("[data-promotion-list]");
        target.innerHTML = "";
        if (!branch) { listStatus.textContent = "Choose a branch."; return; }
        listStatus.textContent = "Loading reviewed promotions...";
        try {
          const rows = await listPromotions(branch);
          if (token !== listRevision || form.elements.branch.value !== branch) return;
          target.innerHTML = rows.map(row => `<div class="field"><span>${esc(`${row.barcode} · ${row.description} · ${row.source_name}, page ${row.source_page}`)}</span>
            <button type="button" class="button button-outline button-small" data-retire-promotion="${esc(row.id)}">Retire promotion</button></div>`).join("");
          listStatus.textContent = rows.length ? `${rows.length} reviewed promotion(s). Retiring does not change past sales.` : "No active reviewed promotions.";
        } catch (error) {
          if (token === listRevision) { console.error("Promotion list failed.", error); listStatus.textContent = `Unable to load promotions: ${error.message}`; }
        }
      };
      const setCandidate = () => {
        selected = candidate.value === "" ? null : candidates[Number(candidate.value)];
        form.elements.barcode.value = selected?.barcode || "";
        form.elements.description.value = selected?.description || "";
        form.elements.memo_srp.value = selected?.memoSrp ?? "";
        form.elements.tag_price.value = selected?.tagPrice ?? "";
        form.elements.evidence.value = selected?.sourceExcerpt || "";
        form.elements.price_conflict.value = "";
        form.elements.valid_from.value = selected?.validFrom || "";
        form.elements.valid_to.value = selected?.validTo || "";
        form.elements.confirm_review.checked = false;
        form.querySelector("[data-components]").innerHTML = component();
        form.querySelector("[data-match-results]").innerHTML = "";
        form.querySelector("[data-match-status]").textContent = "";
        form.querySelector("[data-candidate-warnings]").textContent = selected
          ? `${selected.warnings.join(" ")} Check this row against the original file; suggested text and product associations are not automatically approved.`
          : "Choose a suggested row.";
        form.querySelector("[data-save-status]").textContent = selected && saved.has(`${form.elements.branch.value}\0${candidate.value}`) ? "This row was already approved for this branch in this session." : "";
      };
      candidate.addEventListener("change", setCandidate);
      form.elements.scope?.addEventListener("change", () => {
        revision++; prepared = [];
        form.querySelector("[data-import-ready]").disabled = true;
        form.querySelector("[data-import-results]").innerHTML = "";
        form.querySelector("[data-import-status]").textContent = "Scope changed. Check all rows again.";
      });
      form.elements.branch.addEventListener("change", () => {
        revision++; prepared = [];
        form.querySelector("[data-import-results]").innerHTML = "";
        form.querySelector("[data-import-ready]").disabled = true;
        form.querySelector("[data-import-status]").textContent = "Branch changed. Check all rows again.";
        listRevision++;
        form.querySelector("[data-promotion-list]").innerHTML = "";
        form.querySelector("[data-list-status]").textContent = "Refresh the list for this branch.";
        form.querySelector("[data-match-results]").innerHTML = "";
        form.querySelector("[data-match-status]").textContent = "";
        form.querySelector("[data-save-status]").textContent = "";
        form.elements.confirm_review.checked = false;
      });
      form.elements.file.addEventListener("change", () => {
        revision++; candidates = []; selected = null; saved = new Set(); prepared = [];
        form.querySelector("[data-import-results]").innerHTML = "";
        form.querySelector("[data-import-ready]").disabled = true;
        candidate.innerHTML = '<option value="">Read the selected files</option>';
        setCandidate();
        status.textContent = "Files changed. Read the selected files.";
      });
      for (const input of [form.elements.batch_from, form.elements.batch_to]) {
        input.addEventListener("change", () => {
          revision++; prepared = [];
          form.querySelector("[data-import-ready]").disabled = true;
          form.querySelector("[data-import-results]").innerHTML = "";
          form.querySelector("[data-import-status]").textContent = "Dates changed. Read and check the files again.";
        });
      }
      const readFiles = async () => {
        const button = form.querySelector("[data-read-pdf]"), files = [...form.elements.file.files], token = ++revision;
        candidates = []; selected = null; saved = new Set(); prepared = [];
        form.querySelector("[data-import-results]").innerHTML = "";
        form.querySelector("[data-import-ready]").disabled = true;
        candidate.innerHTML = '<option value="">Reading...</option>'; setCandidate();
        if (!files.length || files.some(file => !/\.(?:pdf|xlsx|xls|csv)$/i.test(file.name))) { status.textContent = "Choose PDF, Excel or CSV files."; return; }
        const batchFrom = form.elements.batch_from.value, batchTo = form.elements.batch_to.value;
        if ((batchFrom && !batchTo) || (!batchFrom && batchTo) || (batchFrom && batchFrom > batchTo)) {
          status.textContent = "Enter both start and end dates, with the end date on or after the start date.";
          return false;
        }
        button.disabled = true;
        status.textContent = "Reading files on this device...";
        try {
          const warnings = [];
          let pdfjs;
          for (const file of files) {
            if (/\.pdf$/i.test(file.name)) {
              if (!pdfjs) {
                pdfjs = await import(PDF_READER);
                pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
              }
              const document = await inspectPromotionPdf(pdfjs, new Uint8Array(await file.arrayBuffer()), file.name);
              if (token !== revision) return;
              candidates.push(...promotionPdfCandidates(document));
              warnings.push(...document.pages.flatMap(page => page.warnings.map(warning => `${file.name}, page ${page.number}: ${warning}`)));
            } else {
              if (!window.XLSX) throw new Error("Excel and CSV reading is unavailable. Connect and reload.");
              if (!file.size || file.size > 30 * 1024 * 1024) throw new Error(`${file.name}: choose a nonempty file no larger than 30 MB.`);
              const book = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
              if (!book.SheetNames.length || book.SheetNames.length > 100) throw new Error(`${file.name}: expected 1 to 100 sheets.`);
              for (const [index, name] of book.SheetNames.entries()) {
                const rows = window.XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, raw: false, defval: "" });
                candidates.push(...promotionSheetCandidates(rows, file.name, name, index + 1));
              }
              if (token !== revision) return;
            }
          }
          if (batchFrom && batchTo) candidates = candidates.map(row => {
            if ((row.validFrom && row.validFrom !== batchFrom) || (row.validTo && row.validTo !== batchTo)) return row;
            return { ...row, validFrom: row.validFrom || batchFrom, validTo: row.validTo || batchTo };
          });
          candidate.innerHTML = '<option value="">Choose a source row</option>' + candidates.map((row, index) =>
            `<option value="${index}">${esc(`${row.sourceName}, page ${row.sourcePage} · ${row.barcode} · ${row.description || "(description missing)"}`)}</option>`).join("");
          status.textContent = `${candidates.length} candidate rows found in ${files.length} file(s). ${warnings.join(" ")}${candidates.length ? "" : " No rows were recognized; review the files manually."}`;
          return candidates.length > 0;
        } catch (error) {
          if (token === revision) {
            candidates = [];
            candidate.innerHTML = '<option value="">Read the selected files</option>';
            console.error("Promotion file reading failed.", error);
            status.textContent = `Unable to read files; no rows are ready to import: ${error.message}`;
          }
        } finally { button.disabled = false; }
        return false;
      };
      form.querySelector("[data-read-pdf]").addEventListener("click", readFiles);
      const prepareFiles = async () => {
        const status = form.querySelector("[data-import-status]");
        const button = form.querySelector("[data-prepare-import]");
        const branch = form.elements.branch.value, token = revision;
        const company = form.elements.scope?.value === "company";
        const targets = company ? branches : branches.filter(item => item.id === branch);
        if (!targets.length || !candidates.length) { status.textContent = "Choose a branch or all branches and read the files first."; return; }
        button.disabled = true;
        form.querySelector("[data-import-ready]").disabled = true;
        status.textContent = "Checking branch products and existing promotions...";
        try {
          const next = [];
          for (const target of targets) {
            status.textContent = `Checking ${target.name}...`;
            const [products, existing] = await Promise.all([listProducts(target.id), listPromotions(target.id)]);
            if (revision !== token) return;
            next.push(...preparePromotionImport(candidates, products, existing).map((item, index) =>
              ({ ...item, branch: target.id, branchName: target.name, candidateIndex: index })));
          }
          prepared = next;
          const ready = prepared.filter(item => item.ready).length;
          renderResults(company);
          status.textContent = `${ready} ready to import; ${prepared.length - ready} need review${company ? ` across ${targets.length} branches` : ""}. Dates missing from the source remain blank and will be flagged during sales.`;
          form.querySelector("[data-import-ready]").disabled = ready === 0;
          return true;
        } catch (error) {
          console.error("Promotion import check failed.", error);
          status.textContent = `Unable to check rows: ${error.message}`;
        } finally { button.disabled = false; }
        return false;
      };
      form.querySelector("[data-prepare-import]").addEventListener("click", prepareFiles);
      const importReady = async () => {
        if (importing) return;
        const token = revision;
        const ready = prepared.filter(item => item.ready);
        if (!ready.length) return;
        importing = true; form.querySelector("[data-import-ready]").disabled = true;
        form.elements.branch.disabled = true; form.elements.file.disabled = true;
        form.elements.batch_from.disabled = true; form.elements.batch_to.disabled = true;
        if (form.elements.scope) form.elements.scope.disabled = true;
        form.querySelector("[data-read-pdf]").disabled = true;
        form.querySelector("[data-prepare-import]").disabled = true;
        let count = 0;
        try {
          for (const branch of [...new Set(ready.map(item => item.branch))]) {
            const [products, existing] = await Promise.all([listProducts(branch), listPromotions(branch)]);
            if (revision !== token) throw new Error("The import changed. Check the remaining rows again.");
            const checked = preparePromotionImport(candidates, products, existing);
            const branchRows = ready.filter(item => item.branch === branch);
            if (branchRows.some(item => !checked[item.candidateIndex].ready ||
                JSON.stringify(checked[item.candidateIndex].components) !== JSON.stringify(item.components))) {
              throw new Error("Products or promotions changed. Check all rows again.");
            }
            for (const item of branchRows) {
              if (revision !== token) throw new Error("The import changed. Check the remaining rows again.");
              await rpc("import_new_priced_promotion", {
                p_branch: branch, p_barcode: item.code, p_description: item.row.description,
                p_valid_from: item.row.validFrom || null, p_valid_to: item.row.validTo || null,
                p_price_conflict: false, p_source_name: item.row.sourceName,
                p_source_page: item.row.sourcePage, p_source_excerpt: item.row.sourceExcerpt,
                p_components: checked[item.candidateIndex].components,
                p_memo_srp: item.row.memoSrp, p_tag_price: item.row.tagPrice,
              });
              item.ready = false;
              item.imported = true;
              item.reasons = ["Imported in this session."];
              saved.add(`${branch}\0${item.candidateIndex}`);
              count++;
            }
          }
          form.querySelector("[data-import-status]").textContent = `Imported ${count} promotion(s). Check all rows again to see what still needs review.`;
          return true;
        } catch (error) {
          console.error("Promotion batch import failed.", error);
          form.querySelector("[data-import-status]").textContent = `Imported ${count} promotion(s) before an error: ${error.message}. Check all rows again before retrying.`;
        } finally {
          importing = false;
          form.elements.branch.disabled = false; form.elements.file.disabled = false;
          form.elements.batch_from.disabled = false; form.elements.batch_to.disabled = false;
          if (form.elements.scope) form.elements.scope.disabled = false;
          form.querySelector("[data-read-pdf]").disabled = false;
          form.querySelector("[data-prepare-import]").disabled = false;
          renderResults(form.elements.scope?.value === "company");
        }
        return false;
      };
      form.querySelector("[data-import-ready]").addEventListener("click", importReady);
      form.querySelector("[data-import-files]").addEventListener("click", async event => {
        const button = event.currentTarget, simpleStatus = form.querySelector("[data-simple-status]");
        if (button.disabled) return;
        button.disabled = true;
        try {
          simpleStatus.textContent = "Reading files...";
          if (!await readFiles()) { simpleStatus.textContent = status.textContent; return; }
          simpleStatus.textContent = "Checking products and prices...";
          if (!await prepareFiles()) {
            details.open = true;
            simpleStatus.textContent = form.querySelector("[data-import-status]").textContent;
            return;
          }
          for (const item of prepared) {
            if (!item.row.validFrom || !item.row.validTo) {
              item.reasons.push("The promotion start and end dates are needed to determine when its price applies.");
              item.ready = false;
            }
          }
          renderResults(form.elements.scope?.value === "company");
          const ready = prepared.filter(item => item.ready).length;
          const issues = prepared.length - ready;
          if (ready && !await importReady()) {
            details.open = true;
            simpleStatus.textContent = form.querySelector("[data-import-status]").textContent;
            return;
          }
          const warnings = status.textContent;
          simpleStatus.textContent = `${ready} promotion(s) imported. ${issues ? `${issues} row(s) need attention; see details below.` : "No rows need attention."} ${warnings}`;
          if (issues) details.open = true;
        } finally { button.disabled = false; }
      });
      form.addEventListener("click", event => {
        const review = event.target.closest("[data-review-row]");
        if (review) {
          const item = prepared[Number(review.dataset.reviewRow)];
          if (!item) return;
          form.elements.branch.value = item.branch;
          candidate.value = item.candidateIndex;
          setCandidate();
          if (item.reasons.length === 1 && item.reasons[0] === "An active promotion already uses this barcode.") {
            const target = form.querySelector("[data-components]");
            target.innerHTML = item.components.map(() => component()).join("");
            [...target.querySelectorAll("[data-promotion-component]")].forEach((row, index) => {
              const part = item.components[index];
              row.querySelector("[data-product-code]").value = part.barcode;
              row.querySelector("[data-product-quantity]").value = part.quantity;
              row.querySelector("[data-product-free]").value = String(part.free);
            });
            form.elements.price_conflict.value = "false";
          }
          candidate.scrollIntoView({ block: "start" });
        }
        if (event.target.closest("[data-add-component]")) form.querySelector("[data-components]").insertAdjacentHTML("beforeend", component());
        const remove = event.target.closest("[data-remove-component]");
        if (remove) remove.closest("[data-promotion-component]").remove();
        const suggestion = event.target.closest("[data-suggest-barcode]");
        if (suggestion) {
          let empty = [...form.querySelectorAll("[data-product-code]")].find(input => !input.value.trim());
          if (!empty) {
            form.querySelector("[data-components]").insertAdjacentHTML("beforeend", component());
            empty = [...form.querySelectorAll("[data-product-code]")].at(-1);
          }
          empty.value = suggestion.dataset.suggestBarcode;
        }
      });
      form.querySelector("[data-refresh-promotions]").addEventListener("click", refreshPromotions);
      form.querySelector("[data-promotion-list]").addEventListener("click", async event => {
        const button = event.target.closest("[data-retire-promotion]");
        if (!button || !confirm("Retire this promotion? It will no longer be available for new sales. Past sales stay unchanged.")) return;
        button.disabled = true;
        try {
          await rpc("revoke_promotion", { p_id: button.dataset.retirePromotion });
          await refreshPromotions();
        } catch (error) {
          console.error("Promotion retirement failed.", error);
          form.querySelector("[data-list-status]").textContent = `Unable to retire promotion: ${error.message}`;
          button.disabled = false;
        }
      });
      form.querySelector("[data-match-products]").addEventListener("click", async event => {
        const button = event.currentTarget, matchStatus = form.querySelector("[data-match-status]");
        if (!selected || !form.elements.branch.value) { matchStatus.textContent = "Choose a branch and source row first."; return; }
        const source = selected, branch = form.elements.branch.value, token = revision;
        button.disabled = true; matchStatus.textContent = "Finding possible product matches...";
        try {
          const matches = await findProducts(branch, source.sourceExcerpt);
          if (selected !== source || form.elements.branch.value !== branch || token !== revision) return;
          form.querySelector("[data-match-results]").innerHTML = matches.map(product =>
            `<div class="field"><span>${esc(`${product.barcode} · ${product.brand} · ${product.model_description}`)}</span><button class="button button-outline button-small" type="button" data-suggest-barcode="${esc(product.barcode)}">Add this product</button></div>`).join("");
          matchStatus.textContent = matches.length ? "Possible matches only—verify every product, quantity, and paid/free status against the source." : "No exact model-token matches found. Enter actual inventory barcodes manually.";
        } catch (error) {
          console.error("Promotion product lookup failed.", error);
          matchStatus.textContent = `Unable to search branch products: ${error.message}`;
        } finally { button.disabled = false; }
      });
    },
    onSubmit: async form => {
      if (importing) throw new Error("Wait for the current import to finish.");
      if (!selected) throw new Error("Read the files and select the source row before approval.");
      const savedCandidate = `${form.elements.branch.value}\0${form.elements.candidate.value}`;
      if (saved.has(savedCandidate)) throw new Error("This source row was already approved for this branch in this session.");
      const savedRevision = revision, source = selected;
      const components = [...form.querySelectorAll("[data-promotion-component]")].map((row, index) => ({
        id: `component-${index + 1}`,
        barcode: row.querySelector("[data-product-code]").value.trim(),
        quantity: Number(row.querySelector("[data-product-quantity]").value),
        free: row.querySelector("[data-product-free]").value === "true",
      }));
      if (!components.length || components.some(row => !row.barcode || !Number.isSafeInteger(row.quantity) || row.quantity <= 0)) {
        throw new Error("Enter every included product barcode and a positive whole quantity.");
      }
      const code = form.elements.barcode.value.trim(), branch = form.elements.branch.value;
      if (!branch) throw new Error("Choose a branch for this exception.");
      const normalized = value => /^\d{1,7}$/.test(value) ? value.padStart(8, "0") : value;
      const existing = await listPromotions(branch);
      if (revision !== savedRevision || selected !== source || form.elements.branch.value !== branch || form.elements.barcode.value.trim() !== code) {
        throw new Error("The selection changed. Review it again before saving.");
      }
      const matches = existing.filter(row => normalized(row.barcode) === normalized(code));
      if (matches.length > 1) throw new Error("Multiple active promotions use this barcode. Retire duplicates before replacing.");
      if (matches.length && !confirm("Replace the existing promotion for this branch with these reviewed details? Past sales stay unchanged.")) return false;
      await rpc(matches.length ? "replace_priced_promotion" : "import_new_priced_promotion", {
        ...(matches.length ? { p_old: matches[0].id } : {}),
        p_branch: branch, p_barcode: code,
        p_description: form.elements.description.value.trim(), p_valid_from: form.elements.valid_from.value || null,
        p_valid_to: form.elements.valid_to.value || null, p_price_conflict: form.elements.price_conflict.value === "true",
        p_source_name: source.sourceName, p_source_page: source.sourcePage, p_source_excerpt: source.sourceExcerpt,
        p_components: components, p_memo_srp: form.elements.memo_srp.value === "" ? null : Number(form.elements.memo_srp.value),
        p_tag_price: form.elements.tag_price.value === "" ? null : Number(form.elements.tag_price.value),
      });
      if (revision === savedRevision) saved.add(savedCandidate);
      prepared = [];
      form.querySelector("[data-import-ready]").disabled = true;
      form.querySelector("[data-import-status]").textContent = "Promotion approved. Check all rows again before importing.";
      form.elements.confirm_review.checked = false;
      form.querySelector("[data-save-status]").textContent = "Promotion approved for this branch. Check the current selection before approving another row.";
      return false;
    },
  });
}
