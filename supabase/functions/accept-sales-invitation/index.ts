import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "https://kzamora19.github.io",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed." });
  const body = await request.json().catch(() => null);
  const token = body?.token;
  const invalid = "This invitation is invalid, expired, or already used. Ask your administrator for a new link if you still need access.";
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return reply(400, { error: invalid });

  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc("accept_sales_account_invitation", { invitation_hash: hash });
    if (error) return reply(503, { error: "Invitation acceptance is unavailable. Try again in a moment." });
    return data === true ? reply(200, { ok: true }) : reply(400, { error: invalid });
  } catch {
    return reply(503, { error: "Invitation acceptance is unavailable. Try again in a moment." });
  }
});
