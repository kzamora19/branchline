// Only our registered PTG Auth callback may receive Branchline OAuth codes.
// Never trust an arbitrary URL supplied in the browser or an unvalidated
// redirect from the authorization API.
const callback = new URL("https://agknxlowackphvwyvxge.supabase.co/auth/v1/callback");

export function validatedPtgOAuthCallback(raw) {
  const target = new URL(raw);
  if (target.protocol !== "https:" ||
      target.origin !== callback.origin ||
      target.pathname !== callback.pathname ||
      target.username || target.password || target.hash) {
    throw Error("Unrecognized application callback. Contact the administrator.");
  }
  return target.href;
}
