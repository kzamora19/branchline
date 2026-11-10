"use strict";

const button = document.querySelector("#accept-invite");
const status = document.querySelector("#invite-status");
const token = new URLSearchParams(location.hash.slice(1)).get("token");
const endpoint = window.BRANCHLINE_SUPABASE_CONFIG?.url;

if (!token || !/^[0-9a-f]{64}$/.test(token) || !endpoint) {
  status.textContent = "Open the acceptance link from your invitation email or ask your administrator for a new one.";
} else {
  button.disabled = false;
  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "Accepting your invitation…";
    try {
      const response = await fetch(endpoint + "/functions/v1/accept-sales-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to accept this invitation.");
      history.replaceState(null, "", location.pathname);
      document.querySelector("#invite-title").textContent = "Invitation accepted";
      document.querySelector("#invite-intro").textContent = "Open Sales Tracker in Branchline Workspace and sign in with the details from your invitation.";
      status.textContent = "";
      button.hidden = true;
      document.querySelector("#invite-next").hidden = false;
      document.querySelector("#invite-next a").focus();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Try accepting your invitation again.";
      button.disabled = false;
    }
  });
}
