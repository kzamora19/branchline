import { inspectPromotionPdf, promotionPdfCandidates } from "./import-engine/promotion-pdf.mjs";

const PDF_READER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.mjs";
const PDF_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs";

export function openPromotionReview(env) {
  const { openModal, escapeHTML: esc, branches, rpc, findProducts, listPromotions, confirm } = env;
  let candidates = [], revision = 0, selected = null, saved = new Set();
  const component = () => `<div data-promotion-component class="dlg-grid">
    <label class="field"><span>Actual product barcode</span><input data-product-code required autocomplete="off"></label>
    <label class="field"><span>Quantity</span><input data-product-quantity type="number" min="1" max="999999" step="1" value="1" required></label>
    <label class="field"><span>Paid or free</span><select data-product-free required><option value="false">Paid</option><option value="true">Free</option></select></label>
    <button class="button button-outline" type="button" data-remove-component>Remove product</button></div>`;
  openModal({
    title: "Review promotional PDF", wide: true, submitLabel: "Approve promotion",
    intro: "Files are read on this device. Review each suggested barcode and the PDF source; map every actual inventory product and quantity before approving. No standard product prices are changed.",
    body: `<label class="field"><span>Branch</span><select name="branch" required><option value="">Choose branch</option>${branches.map(branch => `<option value="${esc(branch.id)}">${esc(branch.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Promotion PDF</span><input name="file" type="file" accept=".pdf,application/pdf"></label>
      <button class="button button-outline" type="button" data-read-pdf>Read PDF</button>
      <p data-pdf-status role="status">Choose a PDF and read it first.</p>
      <label class="field"><span>Suggested offer row</span><select name="candidate"><option value="">Read a PDF first</option></select></label>
      <p data-candidate-warnings role="status"></p>
      <label class="field"><span>Promotion barcode</span><input name="barcode" maxlength="80" required></label>
      <label class="field"><span>Promotion description</span><input name="description" maxlength="500" required></label>
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
      <details><summary>Reviewed promotions in selected branch</summary><button type="button" class="button button-outline" data-refresh-promotions>Refresh list</button><p data-list-status role="status"></p><div data-promotion-list></div></details>`,
    onReady: form => {
      const status = form.querySelector("[data-pdf-status]");
      const candidate = form.elements.candidate;
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
        form.elements.evidence.value = selected?.sourceExcerpt || "";
        form.elements.price_conflict.value = "";
        form.elements.valid_from.value = selected?.validFrom || "";
        form.elements.valid_to.value = selected?.validTo || "";
        form.elements.confirm_review.checked = false;
        form.querySelector("[data-components]").innerHTML = component();
        form.querySelector("[data-match-results]").innerHTML = "";
        form.querySelector("[data-match-status]").textContent = "";
        form.querySelector("[data-candidate-warnings]").textContent = selected
          ? `${selected.warnings.join(" ")} Check this row against the original PDF; suggested text and product associations are not automatically approved.`
          : "Choose a suggested row.";
        form.querySelector("[data-save-status]").textContent = selected && saved.has(`${form.elements.branch.value}\0${candidate.value}`) ? "This row was already approved for this branch in this session." : "";
      };
      candidate.addEventListener("change", setCandidate);
      form.elements.branch.addEventListener("change", () => {
        listRevision++;
        form.querySelector("[data-promotion-list]").innerHTML = "";
        form.querySelector("[data-list-status]").textContent = "Refresh the list for this branch.";
        form.querySelector("[data-match-results]").innerHTML = "";
        form.querySelector("[data-match-status]").textContent = "";
        form.querySelector("[data-save-status]").textContent = "";
        form.elements.confirm_review.checked = false;
      });
      form.elements.file.addEventListener("change", () => {
        revision++; candidates = []; selected = null; saved = new Set();
        candidate.innerHTML = '<option value="">Read the selected PDF</option>';
        setCandidate();
        status.textContent = "File changed. Read the selected PDF.";
      });
      form.querySelector("[data-read-pdf]").addEventListener("click", async event => {
        const button = event.currentTarget, file = form.elements.file.files[0], token = ++revision;
        candidates = []; selected = null; saved = new Set();
        candidate.innerHTML = '<option value="">Reading...</option>'; setCandidate();
        if (!file || !/\.pdf$/i.test(file.name)) { status.textContent = "Choose a PDF file."; return; }
        button.disabled = true;
        status.textContent = "Reading PDF on this device...";
        try {
          const pdfjs = await import(PDF_READER);
          pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
          const document = await inspectPromotionPdf(pdfjs, new Uint8Array(await file.arrayBuffer()), file.name);
          if (token !== revision) return;
          candidates = promotionPdfCandidates(document);
          candidate.innerHTML = '<option value="">Choose a source row</option>' + candidates.map((row, index) =>
            `<option value="${index}">${esc(`Page ${row.sourcePage} · ${row.barcode} · ${row.description || "(description missing)"}`)}</option>`).join("");
          const warnings = document.pages.flatMap(page => page.warnings.map(warning => `Page ${page.number}: ${warning}`));
          status.textContent = `${candidates.length} candidate rows found. ${warnings.join(" ")}${candidates.length ? "" : " No rows were recognized; review the PDF manually."}`;
        } catch (error) {
          if (token === revision) { console.error("Promotion PDF reading failed.", error); status.textContent = `Unable to read PDF: ${error.message}`; }
        } finally { button.disabled = false; }
      });
      form.addEventListener("click", event => {
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
      if (!selected) throw new Error("Read the PDF and select the source row before approval.");
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
      await rpc("review_promotion", {
        p_branch: form.elements.branch.value, p_barcode: form.elements.barcode.value.trim(),
        p_description: form.elements.description.value.trim(), p_valid_from: form.elements.valid_from.value || null,
        p_valid_to: form.elements.valid_to.value || null, p_price_conflict: form.elements.price_conflict.value === "true",
        p_source_name: source.sourceName, p_source_page: source.sourcePage, p_source_excerpt: source.sourceExcerpt,
        p_components: components,
      });
      if (revision === savedRevision) saved.add(savedCandidate);
      form.elements.confirm_review.checked = false;
      form.querySelector("[data-save-status]").textContent = "Promotion approved for this branch. Check the current selection before approving another row.";
      return false;
    },
  });
}
