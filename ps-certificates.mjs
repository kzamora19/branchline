// Standalone, read-only certificate composition. No database writes or side effects.
export function topSpecialistAwardees(rankedRows, profiles, limit = 10) {
  const people = new Map((profiles || []).map(profile => [profile.id, profile]));
  const testName = value => /^\s*test([^a-z]|$)/i.test(String(value || ""));
  return (rankedRows || [])
    .filter(row => {
      const p = people.get(row.id);
      return p && p.role === "ps" && p.active !== false
        && !testName(p.full_name) && !testName(p.login_id)
        && Number.isFinite(Number(row.total)) && Number(row.total) > 0;
    })
    .sort((a, b) => Number(b.total) - Number(a.total)
      || String(a.name).localeCompare(String(b.name), "en", { sensitivity: "base", numeric: true })
      || String(a.id).localeCompare(String(b.id)))
    .slice(0, Math.max(0, Math.min(10, Number(limit) || 0)))
    .map((row, index) => ({
      id: row.id, name: String(row.name || people.get(row.id).full_name || "—"),
      rank: index + 1, total: Number(row.total),
      branch: String(row.branch || "—"), brand: String(row.brand || "—"),
    }));
}

function money(value) {
  return "₱" + Number(value).toLocaleString("en-PH", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

export function certificateDocument(awardees, options = {}) {
  if (!Array.isArray(awardees) || !awardees.length) throw new Error("There are no eligible Product Specialists to award.");
  if (awardees.length > 10) throw new Error("Certificates are limited to the top 10 Product Specialists.");
  const period = String(options.period || "Selected reporting period");
  const branchManagerName = String(options.branchManagerName ?? "").trim().slice(0, 80);
  const districtManagerName = String(options.districtManagerName ?? "").trim().slice(0, 80);
  const date = String(options.issuedOn || "");
  const color = { ink: "#132A4C", navy: "#142E53", gold: "#B58B3D", gray: "#526175" };
  const pages = awardees.map((person, index) => {
    if (!person.name || !Number.isFinite(person.total) || person.total <= 0) throw new Error("Certificate recipient data is invalid.");
    return {
      pageBreak: index ? "before" : undefined,
      stack: [
        { text: "BRANCHLINE  |  SALES TRACKER", fontSize: 11, bold: true, color: color.navy, characterSpacing: 3, margin: [0, 38, 0, 8] },
        { text: "EXCELLENCE IN SALES PERFORMANCE", fontSize: 11, color: color.gold, bold: true, characterSpacing: 2, margin: [0, 1, 0, 12] },
        { text: "CERTIFICATE OF RECOGNITION", fontSize: 27, bold: true, color: color.ink, margin: [0, 0, 0, 12] },
        { text: "This certificate is proudly presented to", fontSize: 12, color: color.gray, margin: [0, 0, 0, 7] },
        { text: person.name, fontSize: person.name.length > 38 ? 23 : 32, bold: true, color: color.navy, margin: [0, 0, 0, 8] },
        { text: "RANK #" + person.rank + "  •  TOP 10 PRODUCT SPECIALISTS", fontSize: 14, bold: true, color: color.gold, margin: [0, 3, 0, 13] },
        { text: "In grateful recognition of your outstanding sales performance, unwavering dedication, and valuable contributions to the continued success of 1st Megasaver.", fontSize: 11, color: color.ink, margin: [0, 4, 0, 13] },
        { text: period, fontSize: 12, bold: true, color: color.navy, margin: [0, 0, 0, 5] },
        { text: "Branch: " + person.branch + "   •   Brand assignment: " + person.brand, fontSize: 9.5, color: color.gray, margin: [0, 0, 0, 38] },
        { columns: [
          { width: "*", stack: [
            { text: "____________________________", fontSize: 10, color: color.navy, alignment: "center" },
            { text: branchManagerName || " ", fontSize: branchManagerName.length > 33 ? 9 : 11, bold: true, color: color.navy, alignment: "center", margin: [0, 5, 0, 2] },
            { text: "Branch Manager / Authorized Signatory", fontSize: 9, color: color.gray, alignment: "center" },
          ], alignment: "center" },
          { width: "*", stack: [
            { text: "____________________________", fontSize: 10, color: color.navy, alignment: "center" },
            { text: districtManagerName || " ", fontSize: districtManagerName.length > 33 ? 9 : 11, bold: true, color: color.navy, alignment: "center", margin: [0, 5, 0, 2] },
            { text: "District / Management Representative", fontSize: 9, color: color.gray, alignment: "center" },
          ], alignment: "center" },
        ], columnGap: 48 },
        { text: date ? "Issued: " + date : "", fontSize: 8, color: color.gray, margin: [0, 30, 0, 0] },
      ],
      alignment: "center",
    };
  });
  return {
    info: { title: "Branchline Top 10 Product Specialist Certificates", author: "Branchline Sales Tracker" },
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [62, 32, 62, 36],
    background: (_currentPage, pageSize) => ({
      canvas: [
        { type: "rect", x: 18, y: 18, w: pageSize.width - 36, h: pageSize.height - 36, lineColor: color.navy, lineWidth: 2 },
        { type: "rect", x: 26, y: 26, w: pageSize.width - 52, h: pageSize.height - 52, lineColor: color.gold, lineWidth: 1.5 },
        { type: "line", x1: 62, y1: 89, x2: pageSize.width - 62, y2: 89, lineWidth: 0.6, lineColor: color.gold },
      ],
    }),
    content: pages,
    defaultStyle: { font: "Roboto", color: color.ink },
  };
}
