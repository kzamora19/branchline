// Standalone, read-only certificate composition. No database writes or side effects.
import { firstMegasaverLogo } from "./first-megasaver-logo-data.mjs";
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
  const color = { ink: "#082E6B", navy: "#052E7A", royal: "#0753B2", gold: "#C29A39", gray: "#485A73" };
  const pages = awardees.map((person, index) => {
    if (!person.name || !Number.isFinite(person.total) || person.total <= 0) throw new Error("Certificate recipient data is invalid.");
    return {
      pageBreak: index ? "before" : undefined,
      stack: [
        { image: firstMegasaverLogo, width: 315, alignment: "center", margin: [0, 0, 0, 7] },
        { text: "EXCELLENCE IN SALES PERFORMANCE", fontSize: 11, color: color.gold, bold: true, characterSpacing: 2, margin: [0, 1, 0, 9] },
        { text: "CERTIFICATE OF RECOGNITION", fontSize: 27, bold: true, color: color.ink, margin: [0, 0, 0, 9] },
        { text: "This certificate is proudly presented to", fontSize: 12, color: color.gray, margin: [0, 0, 0, 7] },
        { text: person.name, fontSize: person.name.length > 38 ? 23 : 32, bold: true, color: color.navy, margin: [0, 0, 0, 8] },
        { text: "RANK #" + person.rank + "  •  TOP 10 PRODUCT SPECIALISTS", fontSize: 14, bold: true, color: color.gold, margin: [0, 3, 0, 8] },
        { text: "In grateful recognition of your outstanding sales performance, unwavering dedication, and valuable contributions to the continued success of 1st Megasaver.", fontSize: 11, color: color.ink, margin: [18, 3, 18, 10] },
        { table: { widths: ["*"], body: [[{
          text: period, fontSize: 12, bold: true, color: "#FFFFFF", fillColor: color.navy,
          alignment: "center", margin: [7, 5, 7, 5],
        }]] }, layout: "noBorders", margin: [90, 0, 90, 10] },
        { text: "Branch: " + person.branch + "   •   Brand assignment: " + person.brand, fontSize: 9.5, color: color.gray, margin: [0, 0, 0, 50] },
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
        { text: date ? "Issued: " + date : "", fontSize: 8, color: color.gray, margin: [0, 17, 0, 0] },
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
        { type: "rect", x: 14, y: 14, w: pageSize.width - 28, h: pageSize.height - 28, lineColor: color.navy, lineWidth: 3.3 },
        { type: "rect", x: 23, y: 23, w: pageSize.width - 46, h: pageSize.height - 46, lineColor: color.gold, lineWidth: 1.4 },
        { type: "rect", x: 29, y: 29, w: pageSize.width - 58, h: pageSize.height - 58, lineColor: "#C7D9F0", lineWidth: 0.5 },
        { type: "line", x1: 60, y1: 111, x2: 285, y2: 111, lineWidth: 0.55, lineColor: color.gold },
        { type: "line", x1: pageSize.width - 285, y1: 111, x2: pageSize.width - 60, y2: 111, lineWidth: 0.55, lineColor: color.gold },
        { type: "rect", x: 23, y: 23, w: 92, h: 5, color: color.navy, lineColor: color.navy, lineWidth: 0 },
        { type: "rect", x: pageSize.width - 115, y: pageSize.height - 28, w: 92, h: 5, color: color.navy, lineColor: color.navy, lineWidth: 0 },
      ],
    }),
    content: pages,
    defaultStyle: { font: "Roboto", color: color.ink },
  };
}
