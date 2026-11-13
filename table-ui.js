(function () {
  "use strict";

  const icon = '<span class="export-glyph" aria-hidden="true"></span>';
  const sorts = new WeakMap();
  const filters = new WeakMap();
  let openColumnMenu;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const sectionPages = new Set(["sales", "analytics", "settings", "targets", "users"]);
  const sectionStates = new Map();
  let sectionId = 0;
  let storageUnavailable = false;

  function sectionOpen(key, open) {
    if (open !== undefined) sectionStates.set(key, open);
    if (!storageUnavailable) {
      try {
        if (open !== undefined) localStorage.setItem(key, open ? "open" : "closed");
        else {
          const saved = localStorage.getItem(key);
          if (saved !== null && saved !== "open" && saved !== "closed") throw new Error("Invalid saved section state");
          sectionStates.set(key, saved === "open");
        }
      } catch (error) {
        storageUnavailable = true;
        console.warn("Unable to remember Branchline section preferences on this device. Changes will last for this session only.", error);
      }
    }
    return sectionStates.get(key) === true;
  }

  function enhanceSections(root, page) {
    if (!root || !sectionPages.has(page)) return;
    root.querySelectorAll(".connected-panel").forEach(panel => {
      if (panel.dataset.collapsibleSection) return;
      const heading = panel.querySelector(":scope > .connected-panel-heading");
      const title = heading?.querySelector("h2");
      if (!title) return;
      const label = title.textContent.trim();
      const identity = panel.dataset.pieSource || panel.querySelector("[data-table-key]")?.dataset.tableKey || "";
      const key = `branchline-sections-v1:${page}:${identity}:${label}`;
      for (const download of panel.querySelectorAll(":scope > .chart-download")) {
        let actions = heading.querySelector(".panel-actions");
        if (!actions) {
          actions = document.createElement("div");
          actions.className = "panel-actions";
          heading.classList.add("panel-heading-row");
          heading.append(actions);
        }
        actions.append(download);
      }
      const body = document.createElement("div");
      body.id = `section-body-${++sectionId}`;
      body.className = "section-collapse-body";
      body.append(...[...panel.childNodes].filter(node => node !== heading));
      panel.append(body);
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "section-toggle";
      toggle.textContent = label;
      toggle.setAttribute("aria-label", label);
      toggle.setAttribute("aria-controls", body.id);
      title.replaceChildren(toggle);
      panel.dataset.collapsibleSection = key;
      heading.classList.add("section-collapse-heading");
      function setOpen(open) {
        body.hidden = !open;
        toggle.setAttribute("aria-expanded", String(open));
        panel.classList.toggle("section-collapsed", !open);
      }
      setOpen(sectionOpen(key));
      heading.addEventListener("click", event => {
        const control = event.target.closest("button, a, input, select, textarea, label, [role=button]");
        if (control && control !== toggle) return;
        const open = body.hidden;
        setOpen(open);
        sectionOpen(key, open);
      });
    });
  }

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

  const fixedRow = row => row.matches(".total-row, [data-sort-fixed]") ||
    [...row.cells].some(cell => cell.colSpan > 1) ||
    /^(grand total|subtotal|total|year to date|full year)$/i.test(row.cells[0]?.textContent.trim() || "");
  const cellValue = (row, col) => row.cells[col]?.textContent.trim() ?? "";

  function sortTable(table, col, direction) {
    const previous = sorts.get(table);
    const dir = direction ?? (previous?.col === col && previous.dir === "asc" ? "desc" : "asc");
    sorts.set(table, { col, dir });
    for (const body of table.tBodies) {
      const rows = [...body.rows];
      const sorted = rows.filter(row => !fixedRow(row)).map((row, index) => ({ row, index }))
        .sort((a, b) => compare(a.row.cells[col]?.dataset.sort ?? a.row.cells[col]?.textContent,
          b.row.cells[col]?.dataset.sort ?? b.row.cells[col]?.textContent, dir) || a.index - b.index)
        .map(entry => entry.row);
      let next = 0;
      body.append(...rows.map(row => fixedRow(row) ? row : sorted[next++]));
    }
    table.querySelectorAll("thead [data-local-sort]").forEach(button => {
      const active = Number(button.dataset.localSort) === col;
      button.closest("th").setAttribute("aria-sort", active ? dir === "asc" ? "ascending" : "descending" : "none");
      button.querySelector(".sort-arrow").textContent = active ? dir === "asc" ? "\u25b2" : "\u25bc" : "▾";
    });
  }

  function columnMenu(table, col, button, label) {
    if (!openColumnMenu) return sortTable(table, col);
    const rows = [...table.tBodies].flatMap(body => [...body.rows]).filter(row => !fixedRow(row));
    const selected = filters.get(table) ?? new Map();
    filters.set(table, selected);
    openColumnMenu(button, label, rows.map(row => cellValue(row, col)), selected.get(col),
      direction => sortTable(table, col, direction), selection => {
        if (selection) selected.set(col, selection);
        else selected.delete(col);
        for (const row of rows) {
          row.classList.toggle("column-filter-hidden", [...selected].some(([index, values]) => !values.has(cellValue(row, index))));
        }
        button.classList.toggle("customer-filter-indicator", Boolean(selection));
        button.setAttribute("aria-label", "Sort and filter " + label + (selection ? " (filtered)" : ""));
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
        button.setAttribute("aria-haspopup", "dialog");
        button.setAttribute("aria-label", "Sort and filter " + label);
        button.dataset.localSort = String(col);
        button.append(document.createTextNode(label));
        const arrow = document.createElement("span");
        arrow.className = "sort-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "▾";
        button.append(arrow);
        button.addEventListener("click", () => columnMenu(table, col, button, label));
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
        if (button.closest(".dlg-head, .panel-actions, .table-tools, .chart-download, .table-export-tools")) return;
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

  window.BranchlineTableUI = { enhance, compare, enhanceSections, setColumnMenu: handler => { openColumnMenu = handler; } };
  const observer = new MutationObserver(() => enhance());
  observer.observe(document.body, { childList: true, subtree: true });
  enhance();
})();
