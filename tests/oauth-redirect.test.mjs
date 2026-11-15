import assert from "node:assert/strict";
import test from "node:test";
import { validatedPtgOAuthCallback } from "../oauth-redirect-policy.mjs";

const callback = "https://agknxlowackphvwyvxge.supabase.co/auth/v1/callback";
test("OAuth callback accepts only registered PTG Auth endpoint", () => {
  assert.equal(validatedPtgOAuthCallback(callback + "?code=abc&state=xyz"), callback + "?code=abc&state=xyz");
});
test("OAuth callback rejects unknown hosts and open redirects", () => {
  for (const url of [
    "https://evil.example/auth/v1/callback",
    "https://agknxlowackphvwyvxge.supabase.co.evil.example/auth/v1/callback",
    "http://agknxlowackphvwyvxge.supabase.co/auth/v1/callback",
    "https://agknxlowackphvwyvxge.supabase.co/auth/v1/callback/evil",
    "https://user@agknxlowackphvwyvxge.supabase.co/auth/v1/callback",
    "javascript:alert(1)",
    "https://agknxlowackphvwyvxge.supabase.co/auth/v1/callback#token",
  ]) assert.throws(() => validatedPtgOAuthCallback(url), /callback|URL|protocol/i);
});
