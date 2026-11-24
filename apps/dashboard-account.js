(() => {
  "use strict";

  const welcome = document.querySelector(".welcome h1");
  const summary = document.getElementById("dashboard-account");
  const recent = document.getElementById("dashboard-recent");
  const roleLabels = {
    admin: "Administrator",
    manager: "Branch Manager",
    district_manager: "District Manager",
    ps: "Product Specialist",
    inventory_controller: "Inventory Controller",
    stock_custodian: "Stock Custodian",
  };
  const config = window.BRANCHLINE_SUPABASE_CONFIG;
  if (!config || !window.supabase?.createClient) return;

  // Read the Sales Tracker session without rotating its refresh token.
  const storageKey = "sb-" + new URL(config.url).hostname.split(".")[0] + "-auth-token";
  const readSession = () => sessionStorage.getItem(storageKey) ?? localStorage.getItem(storageKey);
  let revision = 0;

  async function verifyAccount() {
    const current = ++revision;
    welcome.textContent = "Welcome to Branchline Workspace";
    summary.textContent = "Sign-in and access are verified by each application.";
    recent.textContent = "Recent Sales Tracker activity appears when available.";
    try {
      const saved = readSession();
      const session = JSON.parse(saved || "null");
      if (!session?.access_token || session.expires_at * 1000 <= Date.now()) return;
      const token = session.access_token;
      const client = window.supabase.createClient(config.url, config.publishableKey, {
        auth: { storageKey: storageKey + "-dashboard", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: "Bearer " + token } },
      });
      const { data: { user }, error } = await client.auth.getUser(token);
      if (error || !user || current !== revision) return;
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("full_name,role,active,branch_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError || !profile?.active || !Object.hasOwn(roleLabels, profile.role)) return;

      let branchName = "";
      if (profile.branch_id) {
        const { data: branch } = await client.from("branches").select("name").eq("id", profile.branch_id).maybeSingle();
        branchName = branch?.name || "";
      }
      if (current !== revision || document.hidden || saved !== readSession()) return;
      const name = profile.full_name?.trim();
      if (name) welcome.textContent = "Welcome, " + name;
      summary.textContent = ["Signed in to Sales Tracker", name, roleLabels[profile.role], branchName].filter(Boolean).join(" · ");
      const activity = JSON.parse(localStorage.getItem("branchline-recent-sales:" + user.id) || "null");
      if (activity?.page !== "apps" && activity && /^[a-z]+$/.test(activity.page) && typeof activity.label === "string") {
        const link = document.createElement("a");
        link.href = "../?continue=" + encodeURIComponent(activity.page);
        link.textContent = "Sales Tracker · " + activity.label;
        recent.replaceChildren(link);
      }
    } catch {
      // Unavailable identity stays private until verified again.
    }
  }

  document.addEventListener("visibilitychange", verifyAccount);
  window.addEventListener("pageshow", verifyAccount);
  window.addEventListener("storage", event => {
    if (event.key === storageKey || event.key === null) void verifyAccount();
  });
})();
