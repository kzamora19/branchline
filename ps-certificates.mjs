// Standalone, read-only certificate composition. No database writes or side effects.
import { firstMegasaverLogo } from "./first-megasaver-logo-data.mjs";
import { firstMegasaverCertificateFrame } from "./certificate-corporate-frame.mjs";
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
  const date = String(options.issuedOn || "");
  const branchManagerName = String(options.branchManagerName ?? "").trim().slice(0, 80);
  const districtManagerName = String(options.districtManagerName ?? "").trim().slice(0, 80);
  const color = { navy: "#092D68", royal: "#093F91", gold: "#B27C17", gray: "#304461", ink: "#0B2F68" };

  function centered(text, top, fontSize, extra = {}) {
    return { text, fontSize, color: color.ink, alignment: "center",
      absolutePosition: { x: 72, y: top }, width: 698, ...extra };
  }
  const pages = awardees.map((person, index) => {
    if (!person.name || !Number.isFinite(person.total) || person.total <= 0) {
      throw new Error("Certificate recipient data is invalid.");
    }
    const recipientSize = person.name.length > 52 ? 19 : person.name.length > 36 ? 23 : 29;
    return {
      pageBreak: index ? "before" : undefined,
      stack: [
        { image: firstMegasaverLogo, width: 315, absolutePosition: { x: 263.5, y: 39 } },
        centered("EXCELLENCE IN SALES PERFORMANCE", 120, 11, {
          color: color.gold, bold: true, characterSpacing: 2.2,
        }),
        centered("CERTIFICATE OF RECOGNITION", 148, 27.5, { color: color.navy, bold: true }),
        centered("This certificate is proudly presented to", 201, 13, {
          color: color.gray, characterSpacing: 1.5,
        }),
        centered(person.name, 230, recipientSize, { color: color.navy, bold: true }),
        centered("RANK #" + person.rank + "  •  TOP 10 PRODUCT SPECIALISTS", 283, 14, {
          color: color.gold, bold: true, characterSpacing: 0.5,
        }),
        centered("In grateful recognition of your outstanding sales performance, unwavering dedication, and valuable contributions to the continued success of 1st Megasaver.", 309, 11.4, {
          width: 695, color: color.ink, lineHeight: 1.13,
        }),
        centered(period, 351, period.length > 50 ? 10.7 : 14.2, {
          color: "#FFFFFF", bold: true, characterSpacing: 0.5,
        }),
        centered("Branch: " + person.branch + "   •   Brand assignment: " + person.brand, 400, 10, {
          color: color.gray,
        }),
        {
          columns: [
            { width: 300, stack: [
              { text: "____________________________", fontSize: 10, color: color.navy, alignment: "center" },
              { text: branchManagerName || " ", fontSize: branchManagerName.length > 33 ? 9 : 11,
                bold: true, color: color.navy, alignment: "center", margin: [0, 5, 0, 2] },
              { text: "Branch Manager / Authorized Signatory", fontSize: 9, color: color.gray, alignment: "center" },
            ], alignment: "center" },
            { width: 300, stack: [
              { text: "____________________________", fontSize: 10, color: color.navy, alignment: "center" },
              { text: districtManagerName || " ", fontSize: districtManagerName.length > 33 ? 9 : 11,
                bold: true, color: color.navy, alignment: "center", margin: [0, 5, 0, 2] },
              { text: "District / Management Representative", fontSize: 9, color: color.gray, alignment: "center" },
            ], alignment: "center" },
          ],
          columnGap: 35, absolutePosition: { x: 103, y: 464 }, width: 635,
        },
        centered(date ? "Issued: " + date : "", 542, 8.5, { color: color.gray, characterSpacing: 0.5 }),
      ],
      alignment: "center",
    };
  });

  return {
    info: { title: "1st Megasaver Top 10 Product Specialist Certificates", author: "Branchline Sales Tracker" },
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [0, 0, 0, 0],
    background: (_currentPage, pageSize) => ({
      svg: firstMegasaverCertificateFrame(), width: pageSize.width, height: pageSize.height,
      absolutePosition: { x: 0, y: 0 },
    }),
    content: pages,
    defaultStyle: { font: "Roboto", color: color.ink },
  };
}
