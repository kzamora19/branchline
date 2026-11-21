# Creative Studios integration — coordinated release gates (2026-11-21)

**Development authorized. Production cutover is NOT yet approved or complete.**

## Agreed experience
- Branchline Applications keeps Sales Tracker, PTG, MegaFrame Studio and MegaFlyer Studio.
- Both Creative Studio cards point to the planned PTG Creative Studios launcher, not public editor HTML. The PTG GitHub Pages /studios/ route is NOT YET LIVE.
- PTG source of truth: active SYSTEM_ADMIN, BRANCH_ADMIN or BRANCH_USER with legacy role TEAM LEADER. Deny other branch users, disabled/revoked/expired sessions, branch OFF and password-change-required accounts.
- No Branchline account/session token is forwarded. PTG must authorize every launch server-side; Studio private delivery must also verify session state server-to-server.
- Public GitHub Pages cannot secure editor HTML/JS by hiding navigation. Remove publicly reachable editor bundles at coordinated cutover.

## Repository work and blockers
1. Branchline: this draft routes both Creative Studio cards to the PTG launcher and labels TL+ access. No change to production navigation.
2. PTG: draft #38 stages short-lived tickets and a portal, but is behind live GitHub Pages and not deployed. No Vercel issuer or destination may be used.
3. MegaFlyer: draft #10 stages a private Supabase editor bundle and Edge delivery. The real browser/account/export/project-restore tests are not complete.
4. MegaFrame: draft #16 depends on a Vercel proxy and MUST NOT be merged. Adapt the security design to Supabase private-bundle delivery; preserve existing MegaFrame app roles, cloud templates and backup workflows.
5. All apps under kzamora19.github.io share the same browser origin. Paths are not an isolation boundary; assess PTG token handling, iframe origin, and PWA caches.
6. Before cutover: secure delivery for BOTH editors, protect source and assets, issue/revoke PTG tickets, test redirects, configure only server-side secrets and stage editor-free Pages entry points.

## Acceptance checklist
- [ ] Real TL, Branch Admin and System Admin allowed; ordinary Branch User, Sales Tracker-only account, inactive/revoked/expired or branch-off users denied.
- [ ] Direct URL requests for editor HTML, JS and images denied without PTG authorization; historic PWA cache and offline draft transitions reviewed.
- [ ] Ticket expiry, renewal, replay/rate limits, forced logout and cross-app token isolation tested.
- [ ] PDF/PNG output, photos, autosave, Supabase projects across devices and optional Google Drive backup tested with real accounts.
- [ ] Each development branch rebased against live; coordinated CI and browser security checks passed.
- [ ] Explicit separate approval received for production merge and GitHub Pages + Supabase cutover.

**No Vercel deployment. No production app or Supabase change from this draft.**
