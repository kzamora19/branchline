import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseEvidence, SOURCE } from "./evidence.mjs";

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret" };
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "POST required." });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } });
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return reply(401, { error: "Sign in required." });
    const user = await admin.auth.getUser(token);
    if (user.error || !user.data.user) return reply(401, { error: "Sign in required." });
    const profile = await admin.from("profiles").select("role,active").eq("id", user.data.user.id).single();
    if (profile.error) return reply(500, { error: profile.error.message });
    if (!profile.data.active || profile.data.role !== "admin") return reply(403, { error: "Administrator access required to check the source." });
  }
  const checked_at = new Date().toISOString();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  try {
    const response = await fetch(SOURCE, { signal: AbortSignal.timeout(15000), redirect: "error" });
    if (!response.ok) throw new Error(`Official source returned HTTP ${response.status}.`);
    const html = await response.text();
    if (html.length > 1000000) throw new Error("Official source response exceeds the supported size.");
    const evidence = parseEvidence(html, today);
    const saved = await admin.from("forecast_climate_evidence").upsert({ ...evidence, checked_at }, { onConflict: "source_url,issued_on" });
    if (saved.error) throw new Error(saved.error.message);
    const status = await admin.from("forecast_monitor_status").upsert({ id: true, checked_at, error: null });
    if (status.error) throw new Error(status.error.message);
    return reply(200, { checked_at, evidence, local_weather_status: "Unavailable: no verified official local forecast integration.", review_required: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Official climate monitoring failed", message);
    const status = await admin.from("forecast_monitor_status").upsert({ id: true, checked_at, error: message });
    if (status.error) {
      console.error("Unable to persist climate monitor failure", status.error.message);
      return reply(500, { error: message, status_error: status.error.message });
    }
    return reply(502, { error: message });
  }
});
