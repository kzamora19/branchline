(function () {
  "use strict";

  const icon = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>';
  const sorts = new WeakMap();
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  function key(value) {
    const text = String(value ?? "").trim();
    const empty = !text || ["—", "-", "n/a", "Unavailable"].includes(text);
    const numeric = text.replace(/[₱$,%#\s]/g, "").replace(/^\((.*)\)$/, "-$1");
    const number = numeric && /^[+-]?\d*\.?\d+$/.test(numeric) ? Number(numeric) : null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? Date.parse(text) : null;
    return { text, empty, number: number ?? (Number.isFinite(date) ? date : null) };
  }

  function compare(a, b, direction) {
    const left = key(a), right = key(b);
    if (left.empty !== right.empty) return left.empty ? 1 : -1;
    const result = left.number !== null && right.number !== null
      ? left.number - right.number : collator.compare(left.text, right.text);
    return result * (direction === "desc" ? -1 : 1);
  }

  function sortTable(table, col) {
    const previous = sorts.get(table);
    const dir = previous?.col === col && previous.dir === "asc" ? "desc" : "asc";
    sorts.set(table, { col, dir });
    for (const body of table.tBodies) {
      const rows = [...body.rows];
      const fixed = row => row.matches(".total-row, [data-sort-fixed]") ||
        [...row.cells].some(cell => cell.colSpan > 1) ||
        /^(grand total|subtotal|total|year to date|full year)$/i.test(row.cells[0]?.textContent.trim() || "");
      const sorted = rows.filter(row => !fixed(row)).map((row, index) => ({ row, index }))
        .sort((a, b) => compare(a.row.cells[col]?.dataset.sort ?? a.row.cells[col]?.textContent,
          b.row.cells[col]?.dataset.sort ?? b.row.cells[col]?.textContent, dir) || a.index - b.index)
        .map(entry => entry.row);
      let next = 0;
      body.append(...rows.map(row => fixed(row) ? row : sorted[next++]));
    }
    table.querySelectorAll("thead [data-local-sort]").forEach(button => {
      const active = Number(button.dataset.localSort) === col;
      button.closest("th").setAttribute("aria-sort", active ? dir === "asc" ? "ascending" : "descending" : "none");
      button.querySelector(".sort-arrow").textContent = active ? dir === "asc" ? "\u25b2" : "\u25bc" : "\u2195";
    });
  }

  function enhance(root = document) {
    root.querySelectorAll("table:not(.event-calendar)").forEach(table => {
      const head = table.tHead;
      if (!head || head.rows.length !== 1) return;
      [...head.rows[0].cells].forEach((cell, col) => {
        if (cell.colSpan !== 1 || !cell.textContent.trim() ||
          cell.querySelector("button, input, select, a")) return;
        const label = cell.textContent.trim();
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sort-btn";
        button.dataset.localSort = String(col);
        button.append(document.createTextNode(label));
        const arrow = document.createElement("span");
        arrow.className = "sort-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "\u2195";
        button.append(arrow);
        button.addEventListener("click", () => sortTable(table, col));
        cell.replaceChildren(button);
        cell.setAttribute("aria-sort", "none");
      });
    });
    root.querySelectorAll("button, a[download]").forEach(button => {
      if (button.classList.contains("export-icon")) return;
      const text = button.textContent.trim();
      if (!button.matches("a[download]") && !/^(export|download)\b/i.test(text)) return;
      button.title ||= text;
      button.setAttribute("aria-label", button.getAttribute("aria-label") || text);
      button.classList.add("export-icon");
      button.innerHTML = icon;
    });
    root.querySelectorAll("[role=dialog], dialog").forEach(dialog => {
      dialog.querySelectorAll(".export-icon").forEach(button => {
        if (button.closest(".panel-actions, .table-tools, .chart-download, .table-export-tools")) return;
        const tables = [...dialog.querySelectorAll("table")];
        if (tables.length !== 1) return;
        const wrap = tables[0].closest(".connected-table-wrap, .table-wrap") || tables[0];
        let tools = wrap.previousElementSibling;
        if (!tools?.classList.contains("table-export-tools")) {
          tools = document.createElement("div");
          tools.className = "table-export-tools";
          wrap.before(tools);
        }
        tools.append(button);
      });
    });
  }

  window.BranchlineTableUI = { enhance, compare };
  const observer = new MutationObserver(() => enhance());
  observer.observe(document.body, { childList: true, subtree: true });
  enhance();
})();
