import { validatedPtgOAuthCallback } from "./oauth-redirect-policy.mjs";

(() => {
  "use strict";

  const status = document.querySelector("#oauth-status");
  const details = document.querySelector("#oauth-details");
  const intro = document.querySelector("#oauth-desc");
  const approve = document.querySelector("#oauth-approve");
  const deny = document.querySelector("#oauth-deny");
  const authId = new URLSearchParams(location.search).get("authorization_id") || "";
  const pendingKey = "branchline-oauth-pending";
  function message(text) {
    status.textContent = text;
  }
  function redirectToLogin() {
    const url = new URL("./oauth-consent.html", location.href);
    url.searchParams.set("authorization_id", authId);
    sessionStorage.setItem(pendingKey, url.href);
    location.replace(new URL("./index.html", location.href).href);
  }
  function makeStorage() {
    return {
      getItem(key) {
        return sessionStorage.getItem(key) ?? localStorage.getItem(key);
      },
      setItem(key, value) {
        const remembered = localStorage.getItem(key) !== null ||
          localStorage.getItem("branchline-remember") !== "0";
        const primary = remembered ? localStorage : sessionStorage;
        const other = remembered ? sessionStorage : localStorage;
        primary.setItem(key, value);
        other.removeItem(key);
      },
      removeItem(key) {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      },
    };
  }

  async function start() {
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(authId)) {
      message("Invalid or missing OAuth authorization request.");
      return;
    }
    const config = window.BRANCHLINE_SUPABASE_CONFIG;
    if (!window.supabase?.createClient || !config?.url || !config?.publishableKey) {
      message("Branchline authentication is unavailable.");
      return;
    }
    const client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { storage: makeStorage(), detectSessionInUrl: false },
    });
    try {
      const { data: identity, error: identityError } = await client.auth.getUser();
      if (identityError || !identity?.user) {
        message("Sign in with your Branchline account to continue.");
        redirectToLogin();
        return;
      }
      const { data: profile, error: profileError } = await client.from("profiles")
        .select("id,active,dealer_id")
        .eq("id", identity.user.id).maybeSingle();
      if (profileError || !profile?.active || !profile.dealer_id) {
        throw Error("Your Branchline account is inactive or has no assigned profile.");
      }
      const { data: authorization, error: authError } =
        await client.auth.oauth.getAuthorizationDetails(authId);
      if (authError || !authorization) throw Error(authError?.message || "Authorization request expired.");
      if (!("authorization_id" in authorization)) {
        location.replace(validatedPtgOAuthCallback(authorization.redirect_url));
        return;
      }
      validatedPtgOAuthCallback(authorization.redirect_uri);
      document.querySelector("#oauth-app").textContent = authorization.client?.name || "PTG";
      document.querySelector("#oauth-destination").textContent = authorization.redirect_uri;
      document.querySelector("#oauth-scopes").textContent = authorization.scope || "openid";
      intro.textContent = "A verified Branchline application is requesting your permission.";
      details.hidden = false;
      message("");

      async function decide(allow) {
        approve.disabled = deny.disabled = true;
        message(allow ? "Authorizing…" : "Cancelling…");
        try {
          const { data, error } = await (allow
            ? client.auth.oauth.approveAuthorization(authId)
            : client.auth.oauth.denyAuthorization(authId));
          if (error || !data?.redirect_url) throw Error(error?.message || "Authorization request failed.");
          sessionStorage.removeItem(pendingKey);
          location.replace(validatedPtgOAuthCallback(data.redirect_url));
        } catch (error) {
          message(error instanceof Error ? error.message : "Could not complete authorization.");
          approve.disabled = deny.disabled = false;
        }
      }
      approve.addEventListener("click", () => void decide(true));
      deny.addEventListener("click", () => void decide(false));
    } catch (error) {
      message(error instanceof Error ? error.message : "Authorization is currently unavailable.");
    }
  }
  void start();
})();
