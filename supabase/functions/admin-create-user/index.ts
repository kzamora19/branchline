import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Keep identical to loginEmail() in auth-app.js.
function loginEmail(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (value.includes("@")) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? value : "";
  if (/^\+?[\d\s-]{7,20}$/.test(value)) {
    let digits = value.replace(/\D/g, "");
    if (digits.startsWith("0")) digits = "63" + digits.slice(1);
    return digits.length >= 7 && digits.length <= 15 ? `${digits}@login.branchline.app` : "";
  }
  return /^[a-z0-9._-]{3,40}$/.test(value) ? `${value}@login.branchline.app` : "";
}

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Sends the invite through Resend when RESEND_API_KEY is set as a function secret.
async function sendInvite(o: { to: string; name: string; loginId: string; password: string; appUrl: string }) {
  const gmailUser = Deno.env.get("GMAIL_USER");
  const gmailPass = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/\s+/g, "");
  const key = Deno.env.get("RESEND_API_KEY");
  if (!(gmailUser && gmailPass) && !key) return "not_configured";
  const from = Deno.env.get("INVITE_FROM") ?? "Branchline <onboarding@resend.dev>";
  const base = (Deno.env.get("APP_URL") || o.appUrl).replace(/[?#].*$/, "").replace(/[^/]*\.[a-z]+$/i, "");
  const root = /^https?:\/\//.test(base) ? (base.endsWith("/") ? base : base + "/") : "";
  const link = root;
  const installLink = root ? root + "install.html" : "";
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;color:#1c2733">
    <h2 style="color:#2f5be7">branchline.</h2>
    <p>Hi ${esc(o.name)},</p>
    <p>You have been added to the Branchline sales workspace. Use these details to sign in:</p>
    <table style="background:#f3f6fd;border-radius:8px;padding:12px 16px;width:100%">
      <tr><td>Login ID</td><td><strong>${esc(o.loginId)}</strong></td></tr>
      <tr><td>Temporary password</td><td><strong>${esc(o.password)}</strong></td></tr>
    </table>
    ${link ? `<p><a href="${esc(link)}" style="display:inline-block;background:#2f5be7;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Open Branchline</a></p>` : ""}
    ${installLink ? `<p style="font-size:14px"><strong>Install it as an app</strong> on your phone or computer (Windows, Ubuntu, Android, iPhone):<br><a href="${esc(installLink)}" style="color:#2f5be7">${esc(installLink)}</a></p>` : ""}
    <p style="font-size:13px;color:#5d6b7a">After signing in, change your password using the Change password button. Passwords are case-sensitive. If you did not expect this email, ignore it.</p>
  </div>`;
  if (gmailUser && gmailPass) {
    try {
      const client = new SMTPClient({
        connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: gmailUser, password: gmailPass } },
      });
      await client.send({
        from: `Branchline <${gmailUser}>`,
        to: o.to,
        subject: "You have been invited to Branchline",
        content: `Hi ${o.name}, you have been added to Branchline. Login ID: ${o.loginId}  Temporary password: ${o.password}  ${root}`,
        html,
      });
      await client.close();
      return "sent";
    } catch (error) {
      return `failed: ${error instanceof Error ? error.message : "mail error"}`.slice(0, 200);
    }
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: o.to, subject: "You have been invited to Branchline", html }),
    });
    return res.ok ? "sent" : `failed: ${(await res.text()).slice(0, 160)}`;
  } catch (error) {
    return `failed: ${error instanceof Error ? error.message : "network error"}`;
  }
}

function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("") + "!7";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed." });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: caller, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !caller.user) return reply(401, { error: "Sign in again to continue." });

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("id, dealer_id, role, active")
      .eq("id", caller.user.id)
      .maybeSingle();
    if (!callerProfile || !callerProfile.active || callerProfile.role !== "admin") {
      return reply(403, { error: "Only administrators can add users." });
    }

    const input = await request.json();

    if (input.action === "reset_password") {
      const targetId = String(input.user_id ?? "");
      const { data: target } = await admin
        .from("profiles")
        .select("id")
        .eq("id", targetId)
        .eq("dealer_id", callerProfile.dealer_id)
        .maybeSingle();
      if (!target) return reply(400, { error: "That user was not found." });
      const newPassword = temporaryPassword();
      const { error: resetError } = await admin.auth.admin.updateUserById(targetId, { password: newPassword });
      if (resetError) return reply(400, { error: resetError.message });
      return reply(200, { temporary_password: newPassword });
    }

    if (input.action === "delete_user") {
      const targetId = String(input.user_id ?? "");
      if (targetId === caller.user.id) return reply(400, { error: "You cannot delete your own account." });
      const { data: target } = await admin
        .from("profiles")
        .select("id, role")
        .eq("id", targetId)
        .eq("dealer_id", callerProfile.dealer_id)
        .maybeSingle();
      if (!target) return reply(400, { error: "That user was not found." });
      if (target.role === "admin") return reply(400, { error: "Administrator accounts cannot be deleted here." });

      const used = async (table: string, column: string) => {
        const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq(column, targetId);
        if (error) throw new Error(`Unable to check account history: ${error.message}`);
        return (count ?? 0) > 0;
      };
      const hasRecords = (await used("sales", "ps_id")) || (await used("sale_edit_history", "edited_by"))
        || (await used("monthly_targets", "created_by")) || (await used("brand_targets", "created_by"))
        || (await used("manager_branch_assignments", "assigned_by"))
        || (await used("inventory_events", "actor_id")) || (await used("inventory_snapshots", "imported_by"))
        || (await used("inventory_transfers", "dispatched_by")) || (await used("inventory_transfers", "resolved_by"));
      if (hasRecords) {
        return reply(400, { error: "This user has recorded sales, targets, edits or inventory history. Use Disable instead to preserve these records." });
      }

      for (const [table, column] of [["notifications", "recipient_id"], ["manager_branches", "manager_id"], ["manager_branch_assignments", "manager_id"]]) {
        const { error: cleanError } = await admin.from(table).delete().eq(column, targetId);
        if (cleanError) return reply(400, { error: cleanError.message });
      }
      const { error: profileError } = await admin.from("profiles").delete().eq("id", targetId);
      if (profileError) return reply(400, { error: "This user is still linked to other records. Use Disable instead." });
      const { error: authError } = await admin.auth.admin.deleteUser(targetId);
      if (authError) return reply(400, { error: authError.message });
      return reply(200, { ok: true });
    }

    if (input.action === "update_contact") {
      const targetId = String(input.user_id ?? "");
      const { data: target } = await admin
        .from("profiles")
        .select("id, login_id")
        .eq("id", targetId)
        .eq("dealer_id", callerProfile.dealer_id)
        .maybeSingle();
      if (!target) return reply(400, { error: "That user was not found." });
      const newLogin = String(input.login ?? "").trim();
      const newContact = String(input.contact_email ?? "").trim().toLowerCase();
      if (newContact && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newContact)) return reply(400, { error: "Enter a valid contact email." });
      const changes: Record<string, unknown> = { email: newContact || null };
      if (newLogin) {
        const authEmail = loginEmail(newLogin);
        if (!authEmail) return reply(400, { error: "Enter a username (letters, numbers, . _ -), a mobile number or an email as the login ID." });
        const storedLogin = newLogin.includes("@") ? authEmail : authEmail.replace("@login.branchline.app", "");
        if (storedLogin !== target.login_id) {
          const { error: loginError } = await admin.auth.admin.updateUserById(targetId, { email: authEmail, email_confirm: true });
          if (loginError) return reply(400, { error: loginError.message });
          changes.login_id = storedLogin;
        }
      }
      const { error: updateError } = await admin.from("profiles").update(changes).eq("id", targetId);
      if (updateError) return reply(400, { error: updateError.message });
      return reply(200, { ok: true });
    }

    const role = String(input.role ?? "");
    const fullName = String(input.full_name ?? "").trim();
    const salespersonCode = String(input.salesperson_code ?? "").trim() || null;
    const testAccount = role === "ps" && input.test_account === true;
    const loginId = role === "ps" && salespersonCode ? salespersonCode : String(input.login || input.email || "").trim();
    const contactEmail = String(input.email ?? "").trim().toLowerCase();
    const email = loginEmail(loginId);
    const districtId = String(input.district_id ?? "");
    const branchId = String(input.branch_id ?? "");
    const brand = String(input.brand ?? "").trim();
    const inventoryRole = ["inventory_controller", "stock_custodian"].includes(role);
    const inventoryBranches = Array.isArray(input.branch_ids) ? [...new Set(input.branch_ids.map(String))] : [];

    if (!["ps", "manager", "district_manager", "inventory_controller", "stock_custodian"].includes(role)) return reply(400, { error: "Choose a valid staff role." });
    if (!fullName) return reply(400, { error: "Full name is required." });
    if (role === "ps" && !salespersonCode && !testAccount) return reply(400, { error: "Salesperson Code is required for a Product Specialist unless marked as a test account." });
    if (!email) return reply(400, { error: "Enter a username (letters, numbers, . _ -), a mobile number or an email as the login ID." });
    if (contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) return reply(400, { error: "Enter a valid email address for the invite." });
    if (!inventoryRole && !districtId) return reply(400, { error: "District is required." });
    if (!inventoryRole && role !== "district_manager" && !branchId) return reply(400, { error: "Branch is required." });
    if (inventoryRole && !inventoryBranches.length) return reply(400, { error: "Assign at least one inventory branch." });
    if (role === "ps" && !brand) return reply(400, { error: "Brand is required for a Product Specialist." });
    if (salespersonCode && role !== "ps") return reply(400, { error: "Salesperson Code is for Product Specialists only." });
    if (salespersonCode) {
      const { data: duplicate, error: codeError } = await admin.from("profiles").select("id")
        .eq("dealer_id", callerProfile.dealer_id).eq("salesperson_code", salespersonCode).maybeSingle();
      if (codeError) return reply(400, { error: `Unable to validate Salesperson Code: ${codeError.message}` });
      if (duplicate) return reply(400, { error: "This Salesperson Code is already assigned to another account in your company." });
    }

    if (inventoryRole) {
      const { data: allowed, error: branchesError } = await admin.from("branches").select("id")
        .eq("dealer_id", callerProfile.dealer_id).in("id", inventoryBranches);
      if (branchesError || allowed?.length !== inventoryBranches.length) return reply(400, { error: "All assigned inventory branches must belong to this company." });
    }
    const { data: district } = !inventoryRole ? await admin
      .from("districts")
      .select("id")
      .eq("id", districtId)
      .eq("dealer_id", callerProfile.dealer_id)
      .maybeSingle() : { data: null };
    if (!inventoryRole && !district) return reply(400, { error: "That district was not found." });

    if (!inventoryRole && role !== "district_manager") {
      const { data: branch } = await admin
        .from("branches")
        .select("id")
        .eq("id", branchId)
        .eq("district_id", districtId)
        .eq("dealer_id", callerProfile.dealer_id)
        .maybeSingle();
      if (!branch) return reply(400, { error: "That branch does not belong to the chosen district." });
    }

    const password = temporaryPassword();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, ...(role === "ps" ? { test_account: testAccount } : {}) },
    });
    if (createError || !created.user) {
      return reply(400, { error: createError?.message ?? "Unable to create the login." });
    }
    const userId = created.user.id;

    const rollback = async (message: string) => {
      await admin.from("manager_branches").delete().eq("manager_id", userId);
      await admin.from("manager_branch_assignments").delete().eq("manager_id", userId);
      await admin.from("inventory_branch_users").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
      return reply(400, { error: message });
    };

    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      dealer_id: callerProfile.dealer_id,
      district_id: inventoryRole ? null : districtId,
      branch_id: role === "ps" ? branchId : null,
      role,
      assigned_brand: role === "ps" ? brand : null,
      salesperson_code: role === "ps" ? salespersonCode : null,
      full_name: fullName,
      login_id: role === "ps" && salespersonCode ? salespersonCode : loginId.includes("@") ? email : email.replace("@login.branchline.app", ""),
      email: contactEmail || null,
    });
    if (profileError) return await rollback(profileError.code === "23505" && profileError.message.includes("profiles_dealer_salesperson_code")
      ? "This Salesperson Code is already assigned to another account in your company." : profileError.message);
    if (inventoryRole) {
      const { error: inventoryAssignmentError } = await admin.from("inventory_branch_users").insert(
        inventoryBranches.map(branch_id => ({ user_id: userId, branch_id })),
      );
      if (inventoryAssignmentError) return await rollback(inventoryAssignmentError.message);
    }

    if (role === "manager") {
      const { error: linkError } = await admin.from("manager_branches").insert({
        dealer_id: callerProfile.dealer_id,
        manager_id: userId,
        district_id: districtId,
        branch_id: branchId,
      });
      if (linkError) return await rollback(linkError.message);

      const { error: assignmentError } = await admin.from("manager_branch_assignments").insert({
        dealer_id: callerProfile.dealer_id,
        manager_id: userId,
        district_id: districtId,
        branch_id: branchId,
        assigned_by: callerProfile.id,
      });
      if (assignmentError) return await rollback(assignmentError.message);
    }

    let emailStatus = "not_configured";
    if (contactEmail) {
      emailStatus = await sendInvite({
        to: contactEmail,
        name: fullName,
        loginId: loginId.includes("@") ? email : email.replace("@login.branchline.app", ""),
        password,
        appUrl: String(input.app_url ?? ""),
      });
    }

    return reply(200, { user_id: userId, email, login_id: loginId, temporary_password: password, email_status: emailStatus });
  } catch (error) {
    return reply(500, { error: error instanceof Error ? error.message : "Unexpected error." });
  }
});
