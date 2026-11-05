export function returnPayload(lines, selections) {
  const result = selections.map(selection => {
    const line = lines.find(item => item.id === selection.line_id);
    const quantity = Number(selection.quantity);
    if (!line || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > line.remaining) {
      throw new Error("Choose a whole return quantity within the remaining units for each selected product.");
    }
    const serials = selection.serials || [];
    if (new Set(serials.map(serial => serial.trim().toLowerCase())).size !== serials.length || serials.some(serial => !line.serials.includes(serial)) ||
      serials.length !== Math.min(quantity, line.serials.length)) {
      throw new Error("Select the exact recorded serials for each returned unit. Unnumbered legacy units stay blank.");
    }
    return { line_id: line.id, quantity, serials };
  });
  if (!result.length) throw new Error("Select at least one product to return.");
  if (new Set(result.map(item => item.line_id)).size !== result.length) throw new Error("A product line cannot be selected twice.");
  const serialKeys = result.flatMap(item => {
    const line = lines.find(row => row.id === item.line_id);
    return item.serials.map(serial => `${line.barcode}\0${serial.trim().toLowerCase()}`);
  });
  if (new Set(serialKeys).size !== serialKeys.length) throw new Error("A serial cannot be returned on multiple product lines.");
  return result;
}

export function openSalesReturn(env) {
  const { openModal, rpc, escapeHTML: esc, today, formatMoney } = env;
  const request = crypto.randomUUID();
  let detail = null, revision = 0, pending = false;
  openModal({
    title: "\u2212 Sales return", wide: true, submitLabel: "Post sales return",
    intro: "Find the original invoice or customer, choose an invoice, then select products and quantities. Stock and selected serials return to the original branch. The return reduces sales on the return date; the original invoice is retained.",
    body: `<label class="field"><span>Sales invoice or customer name</span><input name="reference" type="search" autocomplete="off" placeholder="Enter at least 2 characters"><button class="button button-outline" type="button" data-return-find>Find invoices</button></label>
      <label class="field"><span>Matching sales invoices (up to 50; refine search if needed)</span><select name="invoice"><option value="">Search for an invoice or customer first</option></select></label>
      <p role="status" data-return-status></p>
      <div data-return-details></div>
      <label class="field"><span>Return date</span><input name="returned_on" type="date" required max="${esc(today)}" value="${esc(today)}"></label>
      <label class="field"><span>Reason for return</span><textarea name="reason" required maxlength="1000"></textarea></label>`,
    onReady: form => {
      form.closest(".dlg")?.classList.add("sales-return-dialog");
      const status = form.querySelector("[data-return-status]");
      const target = form.querySelector("[data-return-details]");
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      const clear = () => { detail = null; submit.disabled = true; target.innerHTML = ""; };
      const fail = error => {
        console.error("Sales return lookup failed.", error);
        status.textContent = `Unable to load return references: ${error.message}`;
      };
      const find = async () => {
        const query = form.elements.reference.value.trim();
        const token = ++revision;
        clear();
        form.elements.invoice.innerHTML = '<option value="">Choose a sales invoice</option>';
        if (query.length < 2) { status.textContent = "Enter at least 2 characters."; return; }
        status.textContent = "Finding invoices...";
        try {
          const matches = await rpc("search_return_sales", { p_query: query });
          if (token !== revision) return;
          form.elements.invoice.innerHTML += matches.map(row => `<option value="${esc(row.id)}">${esc(`${row.invoice_number} \u00b7 ${row.customer_name} \u00b7 ${row.sold_on} \u00b7 ${row.branch_name}`)}</option>`).join("");
          status.textContent = matches.length ? "Choose an invoice to load its remaining returnable products." : "No returnable invoices match within your sales access.";
          if (matches.length === 1) {
            form.elements.invoice.value = matches[0].id;
            await load();
          }
        } catch (error) { if (token === revision) fail(error); }
      };
      const load = async () => {
        const id = form.elements.invoice.value, token = ++revision;
        clear();
        if (!id) { status.textContent = "Choose a sales invoice."; return; }
        status.textContent = "Loading invoice...";
        try {
          const loaded = await rpc("return_sale_details", { p_sale: id });
          if (token !== revision) return;
          detail = loaded;
          const sale = detail.sale;
          form.elements.returned_on.min = sale.sold_on;
          const info = [["Invoice", sale.invoice_number], ["Customer", sale.customer_name], ["Sale date", sale.sold_on],
            ["Branch", detail.branch], ["Salesperson", sale.ps_name || ""], ["City", sale.city || ""],
            ["Barangay", sale.barangay || ""], ["Payment mode", sale.payment_mode || ""]];
          target.innerHTML = `<div class="dlg-grid">${info.map(([label,value]) => `<label class="field"><span>${esc(label)}</span><input readonly value="${esc(value)}"></label>`).join("")}</div>
            <div class="connected-table-wrap return-products"><table class="connected-table"><thead><tr><th></th><th>Barcode</th><th>Product</th><th>Purchased</th><th>Remaining</th><th>Unit price</th><th>Return qty</th><th>Serials to restore</th></tr></thead><tbody>${detail.lines.map(line =>
              `<tr data-return-line="${esc(line.id)}"><td data-label="Return product"><input type="checkbox" data-return-select aria-label="Return ${esc(line.model_description)}" ${line.remaining <= 0 ? "disabled" : ""}></td>
                <td data-label="Barcode">${esc(line.barcode)}</td><td data-label="Product">${esc(line.model_description)}</td><td data-label="Purchased">${line.quantity}</td><td data-label="Remaining">${line.remaining}</td><td data-label="Unit price">${esc(formatMoney(line.selling_price))}</td>
                <td data-label="Return qty"><input type="number" data-return-quantity aria-label="Return quantity for ${esc(line.barcode)}" min="1" max="${line.remaining}" step="1" value="${line.remaining > 0 ? 1 : 0}" disabled></td>
                <td data-label="Serials to restore"><div class="return-serials">${line.serials.length ? line.serials.map(serial => `<label class="check-row"><input type="checkbox" data-return-serial value="${esc(serial)}" disabled><span>${esc(serial)}</span></label>`).join("") : "No recorded serials; serial cells will stay blank."}</div></td></tr>`).join("")}</tbody></table></div>`;
          status.textContent = "Select only the returned products and exact recorded serials. Returns posted here are excluded from remaining quantities. Review any older imported returns before posting; they are not automatically linked.";
          submit.disabled = false;
        } catch (error) { if (token === revision) { clear(); fail(error); } }
      };
      let timer;
      form.querySelector("[data-return-find]").addEventListener("click", () => { clearTimeout(timer); find(); });
      form.elements.reference.addEventListener("input", () => {
        ++revision; clear(); clearTimeout(timer);
        form.elements.invoice.innerHTML = '<option value="">Finding matching invoices...</option>';
        timer = setTimeout(find, 300);
      });
      form.elements.reference.addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); find(); }
      });
      form.elements.invoice.addEventListener("change", load);
      form.addEventListener("change", event => {
        if (!event.target.matches("[data-return-select]")) return;
        const row = event.target.closest("[data-return-line]");
        row.querySelectorAll("[data-return-quantity],[data-return-serial]").forEach(input => {
          input.disabled = !event.target.checked;
          if (!event.target.checked && input.type === "checkbox") input.checked = false;
        });
      });
    },
    onSubmit: async form => {
      if (pending) throw new Error("This return is already being posted.");
      if (!detail || form.elements.invoice.value !== detail.sale.id) throw new Error("Find and choose the original invoice first.");
      const selected = [...form.querySelectorAll("[data-return-line]")].filter(row => row.querySelector("[data-return-select]").checked)
        .map(row => ({ line_id: row.dataset.returnLine, quantity: row.querySelector("[data-return-quantity]").value,
          serials: [...row.querySelectorAll("[data-return-serial]:checked")].map(input => input.value) }));
      const lines = returnPayload(detail.lines, selected);
      const returnedOn = form.elements.returned_on.value, reason = form.elements.reason.value.trim();
      if (!returnedOn || returnedOn < detail.sale.sold_on || returnedOn > today || !reason) throw new Error("Enter a valid return date and reason.");
      const selectedDetail = detail;
      const controls = [...form.querySelectorAll("input,select,textarea,[data-return-find]")].map(input => [input,input.disabled]);
      controls.forEach(([input]) => { input.disabled = true; });
      pending = true;
      try {
        const saleId = await rpc("process_sales_return", { p_sale: selectedDetail.sale.id, p_returned_on: returnedOn,
          p_lines: lines, p_reason: reason, p_request: request });
        await env.refresh();
        return `<p role="status">Sales return posted against invoice ${esc(selectedDetail.sale.invoice_number)}. Stock and selected serials were restored to ${esc(selectedDetail.branch)}. Negative sales are dated ${esc(returnedOn)}.</p><p>Return transaction ID: ${esc(saleId)}</p>`;
      } finally {
        pending = false;
        controls.forEach(([input,disabled]) => { input.disabled = disabled; });
      }
    },
  });
}
