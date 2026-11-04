export const SOURCE = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml";

export function parseEvidence(html, today) {
  const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<[^>]*>/g, " ")
    .replace(/&ntilde;|&#241;/gi, "n").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ");
  if (!/ENSO Diagnostic Discussion/i.test(text) || !/Climate Prediction Center/i.test(text)) throw new Error("Official source format is unrecognized.");
  const date = text.match(/\b(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\b/);
  if (!date) throw new Error("Official bulletin issue date could not be verified.");
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const issued = `${date[3]}-${String(months.indexOf(date[2]) + 1).padStart(2,"0")}-${date[1].padStart(2,"0")}`;
  const time = Date.parse(issued + "T00:00:00Z");
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== issued) throw new Error("Official bulletin has an invalid issue date.");
  const age = (Date.parse(today + "T00:00:00Z") - time) / 86400000;
  if (age < 0 || age > 45) throw new Error("Official bulletin is future-dated or older than 45 days.");
  const status = text.match(/ENSO Alert System Status:\s*(.{0,100}?)(?:Synopsis:|Summary:)/i)?.[1];
  if (!status) throw new Error("Official ENSO status could not be verified.");
  const phase = /Watch/i.test(status) ? "Watch" : /El Nino Advisory/i.test(status) ? "El Nino"
    : /La Nina Advisory/i.test(status) ? "La Nina" : /Not Active|Neutral/i.test(status) ? "Neutral" : null;
  if (!phase) throw new Error("Official ENSO status is unsupported; manual review is required.");
  return { source_url: SOURCE, issued_on: issued, phase, valid_until: new Date(time + 45 * 86400000).toISOString().slice(0,10) };
}
