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
2. PTG: draft #40 stages one-time tickets, P-256 signed continuation, strict role checks, account-scoped draft recovery keys and an atomic 12-launch-per-minute per-account quota shared across Studios; actual local Supabase Auth/PostgREST, disposable PostgreSQL, Edge HTTP, and static CI passed, not deployed. No Vercel issuer or destination may be used.
3. MegaFlyer: draft #10 stages private Supabase bundle delivery, integrity checks, an opaque-origin editor, AES-GCM local recovery, and cloud Save/Retrieve. Mock cloud retrieval and session restoration remain under browser regression; real PTG/Drive tests not complete.
4. MegaFrame: draft #18 uses private Supabase bundle delivery without Vercel, reconciled the latest searchable emoji picker and named Save/Open Projects from production into staging, and passed protected browser CI including encrypted named-project and draft restoration, per-account isolation and tamper/revocation checks. The old Vercel-based #16 must NOT be merged. Live account, cloud templates and backup tests remain blocked.
5. All apps under kzamora19.github.io share the same browser origin. Paths are not an isolation boundary; assess PTG token handling, iframe origin, and PWA caches.
6. Before cutover: secure delivery for BOTH editors, protect source and assets, issue/revoke PTG tickets, test redirects, configure only server-side secrets and stage editor-free Pages entry points.

## Acceptance checklist
- [ ] Real TL, Branch Admin and System Admin allowed; ordinary Branch User, Sales Tracker-only account, inactive/revoked/expired or branch-off users denied.
- [ ] Direct URL requests for editor HTML, JS and images denied without PTG authorization; historic PWA cache and offline draft transitions reviewed.
- [ ] Complete ticket expiry, renewal, replay/rate limits, forced logout and cross-app token isolation with **hosted real PTG accounts**. [x] Local real GoTrue/PostgREST and PostgreSQL concurrent replay/quota simulation passed (PTG CI 44876054055).
- [ ] PDF/PNG output, photos, autosave, Supabase projects across devices and optional Google Drive backup tested with real accounts.
- [ ] Every development branch reconciled with current live and cross-app CI + browser security checks passed. MegaFrame #18 reconciliation/CI passed; MegaFlyer #10 cloud Save/Retrieve and local recovery still under regression.
- [ ] Explicit separate approval received for production merge and GitHub Pages + Supabase cutover.

**No Vercel deployment. No production app or Supabase change from this draft.**


### Current automated checkpoint
- PTG [local genuine Supabase / four jobs passed](https://github.com/kzamora19/first-megasaver-ptg/actions/runs/44876054055).
- MegaFlyer [protected Chromium/mock Cloud passed](https://github.com/kzamora19/flyer-studio/actions/runs/44869892335).
- MegaFrame [protected named projects + Chromium passed](https://github.com/kzamora19/megaframe-studio/actions/runs/44876506308).
- Browser origin isolation, provider OAuth, hosted deployment + real account acceptance, public asset cutover and real printing remain blocked; **DO NOT MERGE OR DEPLOY** until separately approved.


## Approved unified Branchline UI standard — staged with integration

- Branchline Workspace source remains the master styling reference, not a new theme: navy `#1d2836`, royal blue `#355ee8`, active blue `#2348c7`, soft blue `#eef2ff`, white surfaces `#fff` and border `#e9edf1`.
- The Sales Tracker live and demo sidebars now render one `SALES TRACKER` label immediately beneath the existing Branchline logo. PTG and Data Desk preserve the `PRICE TAG GENERATOR` and `DATA DESK` logo labels.
- The PTG admin/workspace UI (not price-tag outputs) uses Branchline navigation, button and module styling; access controls are untouched.
- Protected MegaFrame preserves `Social Media Photo Frame Generator`. Protected MegaFlyer uses the approved `Promotional Flyer & Sale Artwork Generator` subtitle in its bundled UI. Both retain original app logos/icons and browser access isolation.
- MegaFrame's private editor adopts the unified navy header, white text, royal-blue control styles and mobile spacing; MegaFlyer applies the same through the private-bundle builder, leaving its existing public editor source unchanged until atomic cutover.
- Scope rule: no changes to print/tag SVG or PDF generation, customer photos, artwork canvases, saved project encryption, design templates, user permissions or cloud storage.
- [Branchline application-hub CI](https://github.com/kzamora19/branchline/actions/runs/44877964628) passed desktop/mobile navigation and label checks. [MegaFrame protected CI](https://github.com/kzamora19/megaframe-studio/actions/runs/44878046953) passed browser and private package tests. [MegaFlyer protected CI](https://github.com/kzamora19/flyer-studio/actions/runs/44878095710) passed package and real browser export checks.
- PTG unified-branding and real local Supabase checks run in draft #40 CI; see [PTG development PR](https://github.com/kzamora19/first-megasaver-ptg/pull/40) for the latest result.
- **Production HOLD unchanged:** Do not deploy branding alone. Merge as part of the four-app coordinated release only after protected hosted staging, Google OAuth/Drive, real device/print, historic public-source/PWA bypass, role/security and rollback gates pass.
