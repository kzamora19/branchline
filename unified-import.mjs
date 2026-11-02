import { detect, extractSheet, consolidate, dateISO, filenameYear, text, key, FIELDS } from "./import-engine/core.mjs";

export { FIELDS };
export const TYPES = {
  products: "Product catalog", memo: "Memo / kiosk memo", forecast: "Sales forecast",
  reference: "Sales database", inventory: "Inventory quantities", serials: "Serialized items",
  daily: "Daily Monitoring", unknown: "Unrecognized - map or exclude", skip: "Exclude this sheet",
};
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const normalized = value => text(value).toLowerCase();
const error = (message, source = "") => ({ severity: "ERROR", issue: "IMPORT_VALIDATION", message, source_file: source });

function metadata(rows) {
  const cells = rows.slice(0, 20).flat().map(text);
  const period = cells.find(value => /period covered/i.test(value)) || "";
  const months = "(January|February|March|April|May|June|July|August|September|October|November|December)";
  const match = new RegExp(`${months}\\s+(\\d{1,2}),?\\s+(20\\d{2})\\s*[-\\u2013\\u2014]\\s*${months}\\s+(\\d{1,2}),?\\s+(20\\d{2})`, "i").exec(period);
  const make = at => match ? dateISO(`${match[at + 2]}-${String(MONTHS.indexOf(match[at].toLowerCase()) + 1).padStart(2, "0")}-${match[at + 1].padStart(2, "0")}`) : "";
  let memoNumber = "", reportDate = "";
  cells.forEach((value, index) => {
    if (/memo\s*(?:number|no\.?)\b/i.test(value)) {
      memoNumber ||= `${value} ${cells[index + 1] || ""}`.match(/\b[A-Z][A-Z0-9]*-\d+(?:-\d{6}-\d{6})?\b/i)?.[0] || "";
    }
    if (!reportDate && /execute|report date|as of|macarthur/i.test(value)) {
      const stamp = /(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(value);
      if (stamp) {
        const day = dateISO(stamp[1]);
        let hour = Number(stamp[2]);
        if (stamp[5]) hour = hour % 12 + (stamp[5].toUpperCase() === "PM" ? 12 : 0);
        if (day && hour < 24 && Number(stamp[3]) < 60 && Number(stamp[4] || 0) < 60) {
          reportDate = `${day}T${String(hour).padStart(2, "0")}:${stamp[3]}:${stamp[4] || "00"}+08:00`;
        }
      }
    }
  });
  return { validFrom: make(1), validTo: make(4), memoNumber, reportDate };
}

export function inspectWorkbook(book, file, fileId, XLSX) {
  if (book.SheetNames.includes("Import Manifest")) {
    throw new Error(`${file}: saved Extractor workbooks need the workbook adapter, which is not supported in this first raw-file release. Upload the original sources instead.`);
  }
  return book.SheetNames.map((name, index) => {
    const sheet = book.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "", blankrows: true, range: 0 });
    const mapping = detect(rows, file);
    const dailyHeader = rows.slice(0, 100).findIndex(row => row.some(value => key(value) === "ftty") && row.some(value => key(value) === "ftly"));
    const daily = MONTHS.includes(normalized(name)) && dailyHeader >= 0;
    return {
      id: `${fileId}:${index}`, file, name, rows, merges: sheet["!merges"] || [],
      date1904: !!book.Workbook?.WBProps?.date1904, ...metadata(rows),
      config: {
        ...mapping, role: daily ? "daily" : mapping.role,
        year: filenameYear(file) || "", forecastYear: filenameYear(file) || "",
        cutoff: "", branch: "", complete: false, blankZero: false,
        dateOrder: "mdy", repairExcelDates: false, ...metadata(rows),
      },
    };
  });
}

export function sourceLocations(sheets) {
  const locations = new Set();
  for (const sheet of sheets) {
    const config = sheet.config;
    if (config.role === "inventory") {
      for (const location of config.locationCols || []) locations.add(location.name);
    }
    if (["inventory", "serials"].includes(config.role) && config.cols?.location >= 0) {
      for (const row of sheet.rows.slice(config.header + 1)) {
        const value = text(row[config.cols.location]);
        if (value && !/^(?:total|loc code|location)$/i.test(value)) locations.add(value);
      }
    }
  }
  return [...locations].sort();
}

function validateSalesSheet(sheet, api) {
  if (sheet.date1904) throw new Error("Sales History supports only the 1900-date-system export.");
  const parsed = api.parseSalesHistory(sheet.rows, { repairExcelDates: !!sheet.config.repairExcelDates });
  if (parsed.stats.skipped || parsed.stats.datesBad) {
    throw new Error(`${parsed.stats.skipped} unusable sales row(s). Correct the source rather than silently dropping transactions.`);
  }
  for (const sale of parsed.sales) {
    if (!dateISO(sale.sold_on)) throw new Error(`Invalid sale date for invoice ${sale.invoice}.`);
    for (const line of sale.lines) {
      if (!text(line.barcode) || !Number.isSafeInteger(line.qty) || line.qty === 0 || !Number.isFinite(line.price)) {
        throw new Error(`Invalid sale line in invoice ${sale.invoice}.`);
      }
    }
  }
  // The legacy parser intentionally tolerates malformed prices/quantities. New imports must not.
  const header = sheet.rows.findIndex(row => row.some(value => key(value) === "invoiceno") && row.some(value => key(value) === "trandate"));
  const names = sheet.rows[header].map(key);
  const qtyAt = names.indexOf("qty"), netAt = names.indexOf("net");
  const number = value => Number(text(value).replace(/[,\s\u20b1]/g, ""));
  for (const [index, row] of sheet.rows.slice(header + 1).entries()) {
    if (!row.some(value => text(value))) continue;
    if (!text(row[netAt]) || !Number.isFinite(number(row[netAt])) || !Number.isSafeInteger(number(row[qtyAt]))) {
      throw new Error(`Sales row ${header + index + 2}: NET and integer QTY must be valid; values will not be rounded or defaulted.`);
    }
  }
  return parsed;
}

export function prepareImport(sheets, options, apis) {
  const { branches, operations, locationMap = {}, divisionMap = {}, asOf, today, knownProducts = [], knownStock = [] } = options;
  if (!dateISO(asOf) || !dateISO(today)) throw new Error("Confirm valid pricing and review dates.");
  if (!operations.length) throw new Error("Select at least one operation.");
  const allowed = new Set(branches.map(branch => branch.id));
  const issues = [], parts = [], sales = [], daily = [], directory = new Map(), sourceSummary = [];
  const locations = sourceLocations(sheets);
  const branchCodes = new Map();
  for (const location of locations) {
    const code = /^([A-Z][A-Z0-9]{1,19})\s*-\s*/i.exec(location)?.[1]?.toUpperCase();
    const branch = locationMap[location];
    if (code && branch) {
      if (branchCodes.has(branch) && branchCodes.get(branch) !== code && operations.includes("inventory")) {
        issues.push(error(`Different source location codes were mapped to one branch: ${branchCodes.get(branch)} / ${code}. Confirm the mapping.`));
      }
      branchCodes.set(branch, code);
    }
  }
  const mappings = locations.flatMap(source_name => {
    const branch = locationMap[source_name];
    if (!operations.includes("inventory")) return [];
    if (!allowed.has(branch)) { issues.push(error(`Map inventory location "${source_name}" to an accessible branch.`)); return []; }
    return [{ source_name, location_name: branch, location_code: branchCodes.get(branch) || `B${branches.findIndex(item => item.id === branch) + 1}` }];
  });
  const saleKeys = new Set(), dayKeys = new Set();
  for (const original of sheets) {
    const sheet = { ...original, rows: original.rows.map(row => [...row]) };
    const config = sheet.config;
    const role = config.role;
    sourceSummary.push({ file: sheet.file, sheet: sheet.name, role, original_report_date: sheet.reportDate,
      confirmed_report_date: config.reportDate, forecast_year: config.forecastYear,
      valid_from: config.validFrom, valid_to: config.validTo, memo_number: config.memoNumber,
      complete: config.complete, blank_stock_zero: config.blankZero, repair_excel_dates: !!config.repairExcelDates });
    if (role === "skip") continue;
    if (role === "unknown" || !TYPES[role]) { issues.push(error(`${sheet.name}: map this layout or explicitly exclude it.`, sheet.file)); continue; }
    try {
      if (role === "daily") {
        if (!operations.includes("daily")) continue;
        if (!allowed.has(config.branch)) throw new Error("Choose an accessible branch for Daily Monitoring.");
        const year = Number(config.year);
        if (!Number.isInteger(year) || year < 2000 || year > 2100 || !dateISO(config.cutoff) || config.cutoff.slice(0, 4) !== String(year)) {
          throw new Error("Confirm the monitoring year and a cutoff in that same year.");
        }
        const parsed = apis.daily.parseMonitoring({ [sheet.name]: sheet.rows }, { year, cutoff: config.cutoff });
        if (parsed.warnings.length) throw new Error(parsed.warnings.join(" "));
        if (!parsed.rows.length) throw new Error("No nonempty monitoring days found before the cutoff.");
        for (const row of parsed.rows) {
          const id = `${config.branch}\0${row.day}`;
          if (dayKeys.has(id)) throw new Error(`Repeated branch/day ${row.day} across monitoring sources. Exclude overlapping sheets.`);
          dayKeys.add(id);
        }
        daily.push({ source: `${sheet.file} :: ${sheet.name}`, branch: config.branch, rows: parsed.rows });
        continue;
      }
      if (!Number.isInteger(config.header) || config.header < 0 || config.header >= sheet.rows.length) {
        throw new Error("Choose an existing header row before mapping columns.");
      }
      if (role === "reference" && operations.includes("sales")) {
        const parsed = validateSalesSheet(sheet, apis.sales);
        const mapped = [];
        for (const sale of parsed.sales) {
          if (sale.sold_on > today) throw new Error(`Invoice ${sale.invoice} has future sale date ${sale.sold_on}. Check the source dates and legacy repair setting.`);
          const branch_id = divisionMap[sale.division];
          if (!allowed.has(branch_id)) throw new Error(`Map sales division "${sale.division}" to an accessible branch.`);
          const id = `${branch_id}\0${normalized(sale.invoice)}`;
          if (saleKeys.has(id)) throw new Error(`Repeated invoice ${sale.invoice} for one branch across sales sources. Exclude overlapping sources.`);
          saleKeys.add(id);
          mapped.push({ ...sale, branch_id });
          if (sale.salespersoncode) {
            const person = directory.get(sale.salespersoncode) || { salespersoncode: sale.salespersoncode, names: new Set(), divisions: new Set() };
            for (const name of sale.source_ps_names || [sale.ps_name]) if (name) person.names.add(name);
            person.divisions.add(sale.division);
            directory.set(sale.salespersoncode, person);
          }
        }
        if (!mapped.length) throw new Error("No usable sales found.");
        sales.push({ source: `${sheet.file} :: ${sheet.name}`, sales: mapped,
          dateFrom: parsed.stats.from, dateTo: parsed.stats.to, datesFixed: parsed.stats.datesFixed });
      }
      if (!operations.includes("catalog") && !operations.includes("inventory")) continue;
      const part = extractSheet(sheet, config);
      if (!operations.includes("inventory")) { part.inventory = []; part.serials = []; }
      parts.push(part);
    } catch (caught) {
      issues.push(error(`${sheet.name}: ${caught.message}`, sheet.file));
    }
  }
  const result = parts.length ? consolidate(parts, mappings, `${today}T12:00:00+08:00`, asOf) : null;
  if (result) issues.push(...result.issues);
  const catalog = operations.includes("catalog") ? (result?.products || []).map(item => ({
    barcode: item.barcode, brand: item.brand, description: item.description,
    category: item.category, sub_category: item.subcategory, srp: item.srp,
  })) : [];
  for (const item of catalog) {
    if ((!item.brand || !item.description) && branches.some(branch => {
      const previous = knownProducts.find(product => product.branch_id === branch.id && normalized(product.barcode) === normalized(item.barcode));
      return !(item.brand || previous?.brand) || !(item.description || previous?.model_description);
    })) issues.push(error(`Barcode ${item.barcode}: a new catalog item needs brand and description in Branchline. The missing fields remain blank; correct the source or import another data type.`));
  }
  const inventory = [];
  if (operations.includes("inventory") && result) {
    for (const coverage of result.coverage) {
      const branch = coverage.location_name;
      if (!allowed.has(branch)) continue;
      const stock = result.inventory.filter(item => item.location_name === branch);
      if (!stock.length) continue;
      const sourceSheets = sheets.filter(sheet => ["inventory", "serials"].includes(sheet.config.role)
        && sourceLocations([sheet]).some(location => locationMap[location] === branch));
      if (!sourceSheets.some(sheet => sheet.config.role === "inventory") || !sourceSheets.some(sheet => sheet.config.role === "serials")) {
        issues.push(error("Inventory replacement requires both quantity and serialized reports for each selected branch."));
      }
      if (sourceSheets.some(sheet => !sheet.config.complete)) issues.push(error("Confirm complete quantity AND serial coverage for every inventory source."));
      const dates = new Set(sourceSheets.map(sheet => sheet.config.reportDate));
      if (dates.size !== 1 || ![...dates][0] || !Number.isFinite(Date.parse([...dates][0])) || [...dates][0].slice(0, 10) > today) {
        issues.push(error("Paired inventory sources must have one confirmed snapshot timestamp, not a future date. Confirm the same snapshot time on both reports."));
      }
      const items = stock.map(row => {
        const product = result.products.find(item => normalized(item.barcode) === normalized(row.barcode));
        const units = result.serials.filter(item => item.location_name === branch && normalized(item.barcode) === normalized(row.barcode));
        const knownSerialized = knownStock.some(item => item.branch_id === branch && normalized(item.barcode) === normalized(row.barcode) && item.serialized);
        if (knownSerialized && row.quantity !== units.length) issues.push(error(`Barcode ${row.barcode}: existing serialized stock requires one serial per available unit.`));
        if (units.some(unit => !unit.received_on || unit.received_on > today)) issues.push(error(`Barcode ${row.barcode}: every serial needs a valid, nonfuture received date before replacement.`));
        if (!Number.isSafeInteger(row.quantity) || row.quantity < 0) issues.push(error(`Barcode ${row.barcode}: quantity must be a nonnegative integer.`));
        return {
          barcode: row.barcode, description: product?.description || "", brand: product?.brand || "",
          category: product?.category || "", sub_category: product?.subcategory || "", srp: product?.srp ?? null,
          quantity: row.quantity, serialized: units.length > 0 || knownSerialized,
          serials: units.map(unit => ({ serial: unit.serial_number, received_on: unit.received_on })),
        };
      });
      inventory.push({ branch, reportedAt: [...dates][0], source: sourceSheets.map(sheet => `${sheet.file} :: ${sheet.name}`).join(" + "), items });
    }
  }
  for (const person of directory.values()) if (person.names.size > 1) {
    issues.push({ severity: "WARNING", issue: "SALESPERSON_NAMES", message: `Salesperson code ${person.salespersoncode} has multiple source names: ${[...person.names].join(" / ")}. The code and original names will be retained.` });
  }
  if (!catalog.length && !sales.length && !daily.length && !inventory.length) issues.push(error("No selected import operation contains usable data."));
  return {
    catalog, sales, daily, inventory, issues, sources: sourceSummary, result,
    salespeople: [...directory.values()].map(person => ({ ...person, names: [...person.names], divisions: [...person.divisions] })),
    operations: [...operations], valid: !issues.some(item => item.severity === "ERROR"),
  };
}

export function createImportJobs(preview, uuid) {
  if (!preview.valid) throw new Error("Resolve all blocking review issues before importing.");
  const jobs = [];
  const chunks = (items, size, callback) => {
    for (let index = 0; index < items.length; index += size) callback(items.slice(index, index + size));
  };
  chunks(preview.catalog, 1000, items => jobs.push({ label: `${items.length} catalog products`, rpc: "import_unified_products", params: { p_items: items } }));
  for (const entry of preview.sales) {
    const batch = uuid();
    chunks(entry.sales, 200, sales => jobs.push({ label: `Sales: ${entry.source} (${sales.length} invoices)`, rpc: "import_unified_sales_history",
      params: { p_batch: batch, p_label: entry.source.slice(0, 80), p_file: entry.source, p_sales: sales } }));
  }
  for (const entry of preview.daily) {
    const batch = uuid();
    chunks(entry.rows, 400, rows => jobs.push({ label: `Daily totals: ${entry.source} (${rows.length} days)`, rpc: "import_daily_history",
      params: { p_batch: batch, p_label: entry.source.slice(0, 80), p_file: entry.source, p_branch: entry.branch, p_rows: rows } }));
  }
  for (const entry of preview.inventory) jobs.push({ label: `Replace inventory: ${entry.branch}`, rpc: "import_unified_inventory",
    params: { p_branch: entry.branch, p_reported_at: entry.reportedAt, p_files: entry.source, p_items: entry.items } });
  return jobs.map(job => ({ ...job, status: "pending", result: null }));
}

export async function executeImportJobs(jobs, rpc, progress = () => {}) {
  for (const job of jobs) {
    if (job.status === "done") continue;
    // Stock replacements are not safe to repeat automatically after a lost response.
    if (job.status === "uncertain" && job.rpc === "import_unified_inventory") {
      throw new Error("An inventory response was lost. Check Inventory history and prepare a fresh snapshot; automatic retry is blocked.");
    }
    progress(job);
    job.status = "uncertain";
    let response;
    try {
      response = await rpc(job.rpc, job.params);
    } catch (caught) {
      throw new Error(`${job.label}: response unavailable; the server may have committed. ${caught.message}`);
    }
    if (!response || typeof response !== "object") throw new Error(`${job.label}: missing server response; verify the saved data before continuing.`);
    if (response.error) {
      // Transport failures do not prove rollback.
      if (/^[0-9A-Z]{5}$/.test(response.error.code || "")) job.status = "pending";
      throw new Error(`${job.label}: ${response.error.message}. Earlier completed steps remain saved.`);
    }
    const countField = { import_unified_products: "products", import_unified_sales_history: "sales", import_daily_history: "days" }[job.rpc];
    const snapshot = typeof response.data === "string" ? response.data : response.data?.snapshot;
    const validResult = countField ? Number.isSafeInteger(response.data?.[countField]) && response.data[countField] >= 0
      : job.rpc === "import_unified_inventory" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(snapshot || "");
    if (!validResult) {
      throw new Error(`${job.label}: missing or invalid server result; verify the saved data before continuing.`);
    }
    job.result = response.data;
    job.status = "done";
    progress(job);
  }
  return jobs;
}
