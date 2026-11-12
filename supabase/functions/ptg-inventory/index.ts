import { createClient } from "npm:@supabase/supabase-js@2";

const ptgAuthUrl = "https://agknxlowackphvwyvxge.supabase.co/functions/v1/ptg-auth";
const ptgOrigin = "https://kzamora19.github.io";
const linkedBranches = ["CAU", "ILA", "STG", "TUG"];
const sales = createClient(Deno.env.get("SUPABASE_URL")!,
  (Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!,
  { auth: { persistSession: false, autoRefreshToken: false } });

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

Deno.serve(async request => {
  if (request.method !== "POST") return reply(405, { message: "POST required." });
  const authorization = request.headers.get("authorization") ?? "";
  const sessionId = request.headers.get("x-ptg-session-id") ?? "";
  const ptgKey = request.headers.get("x-ptg-public-key") ?? "";
  if (!authorization.startsWith("Bearer ") || !sessionId || !ptgKey) {
    return reply(401, { message: "Sign in to PTG to view stock." });
  }
  try {
    const verified = await fetch(ptgAuthUrl, {
      method: "POST",
      headers: { authorization, apikey: ptgKey, "x-ptg-session-id": sessionId,
        "content-type": "application/json", origin: ptgOrigin },
      body: JSON.stringify({ action: "session" }),
      signal: AbortSignal.timeout(10000),
    });
    if (!verified.ok) return reply(verified.status >= 500 ? 502 : 401, { message: "Could not verify the PTG session." });
    const { ok, account } = await verified.json();
    if (!ok || !account || account.mustChangePassword ||
      !["SYSTEM_ADMIN", "BRANCH_ADMIN", "BRANCH_USER"].includes(account.role)) {
      return reply(403, { message: "This PTG account cannot view stock." });
    }
    const codes = account.role === "SYSTEM_ADMIN" ? linkedBranches
      : linkedBranches.filter(code => code === account.branchCode);
    if (!codes.length) return reply(404, { message: "Sales Tracker inventory is unavailable for this branch." });
    const { data: branches, error: branchError } = await sales.from("branches")
      .select("id,code,name").in("code", codes);
    if (branchError || !branches?.length || new Set(branches.map(branch => branch.code)).size !== branches.length) {
      return reply(502, { message: "Could not identify the linked Sales Tracker branches." });
    }
    const ids = branches.map(branch => branch.id);
    const scope = branches.length === 1 ? branches[0].name : "All linked branches";
    const { mode, barcode: input } = await request.json();
    if (mode === "codes") {
      const barcodes = new Set<string>();
      for (let first = 0; ; first += 1000) {
        const { data, error } = await sales.from("inventory_stock").select("barcode,branch_id")
          .in("branch_id", ids).gt("quantity", 0).order("branch_id").order("barcode").range(first, first + 999);
        if (error) throw error;
        for (const row of data) barcodes.add(row.barcode);
        if (data.length < 1000) break;
      }
      return reply(200, { ok: true, barcodes: [...barcodes], scope });
    }
    const barcode = String(input ?? "").trim().toUpperCase();
    if (!["stock", "serials"].includes(mode) || !/^[A-Z0-9-]{1,64}$/.test(barcode)) {
      return reply(400, { message: "Choose a product barcode." });
    }
    const canonical = /^\d{1,7}$/.test(barcode) ? barcode.padStart(8, "0") : barcode;
    const { data: stock, error: stockError } = await sales.from("inventory_stock")
      .select("branch_id,quantity,serialized").in("branch_id", ids).eq("barcode", canonical);
    if (stockError) throw stockError;
    const quantity = stock.reduce((sum, row) => sum + row.quantity, 0);
    const serialized = stock.some(row => row.serialized);
    if (mode === "stock" || !serialized) return reply(200, { ok: true, quantity, serialized, scope });

    const serials = [];
    const serializedIds = stock.filter(row => row.serialized).map(row => row.branch_id);
    for (let first = 0; ; first += 1000) {
      const { data, error } = await sales.from("inventory_serials").select("branch_id,serial,received_on")
        .in("branch_id", serializedIds).eq("barcode", canonical).eq("status", "available")
        .order("branch_id").order("serial").range(first, first + 999);
      if (error) throw error;
      serials.push(...data.map(row => ({ serial: row.serial, receivedOn: row.received_on,
        branch: branches.find(branch => branch.id === row.branch_id)?.name })));
      if (data.length < 1000) break;
    }
    return reply(200, { ok: true, quantity, serialized, scope, serials });
  } catch {
    return reply(502, { message: "Sales Tracker inventory could not be loaded." });
  }
});
