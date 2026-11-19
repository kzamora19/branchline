// Small, page-safe vector charts for management PDF summaries only.
// No customer or person data is rendered; top five aggregated branches/brands.
export function managementPdfChartBlocks(charts = []) {
  if (!Array.isArray(charts)) return [];
  const sections = [];
  const pesos = n => "₱" + Number(n).toLocaleString("en-PH", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  for (const section of charts) {
    const rows = (Array.isArray(section.rows) ? section.rows : [])
      .filter(row => Number.isFinite(Number(row.amount)) && Number(row.amount) >= 0)
      .slice(0, 5);
    if (!rows.length) continue;
    const largest = Math.max(1, ...rows.map(row => Number(row.amount)));
    sections.push({
      text: String(section.title || "Sales comparison"),
      bold: true, fontSize: 11, color: "#264c7f", margin: [0, 8, 0, 6],
    });
    sections.push({
      table: {
        widths: [130, 210, 110],
        body: rows.map(row => [
          { text: String(row.label || "Unspecified"), fontSize: 9, color: "#16243a" },
          { canvas: [{
            type: "rect", x: 0, y: 2,
            w: Math.max(0, 198 * Number(row.amount) / largest),
            h: 10, fillColor: "#547cae", lineColor: "#547cae",
          }], margin: [0, 0, 0, 1] },
          { text: pesos(row.amount), alignment: "right", fontSize: 9, bold: true, color: "#16243a" },
        ]),
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0,
        paddingLeft: () => 4, paddingRight: () => 4,
        paddingTop: () => 4, paddingBottom: () => 4 },
      margin: [0, 0, 0, 6],
    });
  }
  return sections;
}
