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


## Public Studio URL/PWA retirement — development milestone
- MegaFrame [draft #18](https://github.com/kzamora19/megaframe-studio/pull/18) now contains an isolated, editor-free historical Pages retirement generator plus PWA cache-preservation and browser-rehearsal tests. Production Pages build remains unchanged.
- MegaFlyer [draft #10](https://github.com/kzamora19/flyer-studio/pull/10) now contains an isolated, editor-free historical Pages retirement generator. Production `site/` still serves the current editor and is unchanged.
- [Read the coordinated release and PWA migration runbook](./creative-studios-source-retirement-runbook-20261121.md). The cutover is **not** complete. Existing offline PWA copies cannot be remotely disabled before reconnection; downloaded data/code and migration/backup coverage remain unresolved release risks.
- In the **draft branches only**, both Pages publishers are now guarded by manual `workflow_dispatch` from `main` plus explicit repository approval variables (`MEGAFRAME_CUTOVER_APPROVED` / `MEGAFLYER_CUTOVER_APPROVED`); regular pushes cannot automatically republish public editor bundles after merge. The generators are not authorized for production publishing until security, hosted-account, backup/migration and device/print acceptance pass. The live main workflows remain untouched.



## Hosted acceptance staging — prepared, not provisioned

- Checked all linked Supabase accounts on November 21. **No separate hosted staging project or development branch** exists for PTG, MegaFrame or MegaFlyer. Existing live projects must not be treated as staging.
- PTG [PR #40](https://github.com/kzamora19/first-megasaver-ptg/pull/40) has a guarded, optional **single-staging-project** three-Edge-function acceptance runner. It tests wrong issuer, unsigned/forged requests, no direct editor GET, then (with specifically named synthetic accounts) TL+ issuance, signed continuation/replay and SHA-256 private bundle verification on both Studios. [Setup guide](https://github.com/kzamora19/first-megasaver-ptg/blob/feature/studio-gateway-pages-refresh-20261121/docs/studio-hosted-staging-acceptance.md).
- Both Studio Edge functions now require an explicit `PTG_STUDIO_DEPLOYMENT_MODE` plus `PTG_STUDIO_GATEWAY_URL`, and reject staging mode for **all four known existing live project references** (including their own production Supabase origin). Missing/mismatched variables fail closed before PTG ticket redemption.
- [MegaFrame migration browser CI](https://github.com/kzamora19/megaframe-studio/actions/runs/44880418848) passed: a portable old public project with synthetic photo and emoji cover was imported in a newly authorized mock PTG account, restored, and re-encrypted without cross-account access. **Real** user backups/cross-device migration and provider OAuth still require separate hosted acceptance.
- [PTG four-job local test CI](https://github.com/kzamora19/first-megasaver-ptg/actions/runs/44880354065) passed all existing authorization/SQL/Edge/real-local-GoTrue jobs. [MegaFlyer policy/browser CI](https://github.com/kzamora19/flyer-studio/actions/runs/44880139122) and [MegaFrame private/browser CI](https://github.com/kzamora19/megaframe-studio/actions/runs/44880121924) passed prior to the MegaFrame additional backup migration test.
- Provisioning a new Supabase project or development branch may incur charges and **requires selecting a Supabase organization and agreeing to any nonzero quoted cost**. No project was created or billed during this development.
- A read-only Supabase security-advisors review also flagged **leaked password protection disabled** in all three existing live application projects. See [Supabase password protections](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). It reported RLS-enabled/no-policy INFO notices for some PTG and Flyer server-only tables: these can be deliberately restricted, so review their actual grants before considering any policies. **No production Auth/RLS setting was changed.**

**Release is still HOLD:** success of these scripts is not evidence of end-to-end hosted Google OAuth/Drive, signed real-account revocation, cross-device cloud saves, actual devices/physical printing, source cutover or user migration acceptance.



## Primary Supabase free-tier staging capacity audit — November 21, 2026

**Decision: Do not pause or delete either existing project. This is a read-only operational dependency assessment, not a provisioning or deployment.**

- Primary connection belongs to organization `BRANCHLINE TEST`, currently with two active projects: `First Megasaver PTG` and `Ken's Project`. Supabase quoted `$0/month` for creating a project, but its create API refused due to the account-wide two active free-project limit. **No staging project was created.**
- The older, generically named `Ken's Project` (ref `psoopubvdpwztzkdyifa`) is the **production Branchline Sales Tracker backend**. The currently published `supabase-config.js` references this exact project. It contains `sales`, `sale_lines`, `products`, `profiles`, `inventory_stock` and related operational tables; the production system maintains push notifications, user administration and inventory Edge Functions.
- Read-only database queries on **2026-11-21** confirmed **14,819** sales, **23,349** sale lines, **33,364** products, **8,341** inventory-stock records, **22** active profiles, **62** new sales in seven days, and **10** users with sign-ins in seven days. Latest recorded sale and login activity were both **2026-11-21**. Three active scheduled jobs include hourly sales-pace push, transfer-push retry and climate forecast. The live logs also showed ongoing request activity.
- **Pausing Ken's Project would interrupt ongoing app logins, sales, inventory, notifications, and scheduled workloads**. Pausing `First Megasaver PTG` would likewise disrupt authentication/price tags and the planned Studio authorization authority. Neither is a disposable candidate.
- Supabase billing documentation confirms **paused projects do not count** toward the Free Plan's two active projects, but this is irrelevant until the paused project is independently proven nonproduction. See: https://supabase.com/docs/guides/platform/billing-on-supabase
- An alternative **Supabase development branch** under Primary was quoted at **USD $0.01344/hour** (estimated about $0.32/day at 24 hours), excluding any other charges. **No paid branch was authorized or created.** Creating a new separate staging project would require freeing a genuinely unused slot or upgrading the organization; neither should be done without separate owner approval of any nonzero price.
- Keep all hosted staging tests and manual release workflows disabled. Continue synthetic local Supabase CI and draft UI/security development. Production Pages, Supabase, projects and customers remain untouched. The coordinated integration release is still on HOLD pending a real isolated backend and the remaining acceptance gates.


## New MegaFlyer Product Photo Library release gate

- [x] Staged product identity module, PTG-private server endpoint, content-addressed private Storage SQL and protected-only client in MegaFlyer #10; public GitHub Pages editor unchanged.
- [ ] Native product photo import auto-save, opt-out, barcode/model/description suggestions and galleries verified through real hosted PTG/Storage accounts and a second device.
- [ ] New Storage bucket policies/anon-direct-access reviewed against any existing broad policies; no customer image may leak into the shared product collection.
- [ ] Duplicate upload concurrency, primary image uniqueness, cross-user view, admin-only replacement/removal, audit records and revocation under load tested.
- [ ] Existing Save/Retrieve and previously saved flyer copies verified unaffected by photo replacement and removal.

Do not deploy this feature independently of the four-app cutover. No fifth Supabase project is required.


## November 21 — Standalone MegaFlyer Smart Product Photos released (separate scope)

- The owner requested **deploy MegaFlyer first, then continue four-app integration**. The independent [MegaFlyer PR #16](https://github.com/kzamora19/flyer-studio/pull/16) was squashed to `main` at `6fd07c46fcb83c978b2a5ba19096b2a26f3fab3b`; [GitHub Pages deployment #44888006747](https://github.com/kzamora19/flyer-studio/actions/runs/44888006747) passed. Live URL remains https://kzamora19.github.io/flyer-studio/.
- Deployed **only** the additive product-photo feature; the public standalone editor remains available with existing Save/Retrieve and exports. The new photo gateway checks an active PTG session and role **on every request**, limiting shared photo content to Team Leader and higher. No other app or protected launcher was published.
- Existing Flyer Studio Supabase project `tzklsscoiwnmeantcefw` now has a dedicated private `flyer-product-photos` bucket, RLS-restricted photo metadata tables and an ACTIVE `flyer-product-photos` Edge Function. Read-only post-deployment SQL verified `bucket_public=false`, no anon/authenticated photo SELECT grants, and service-only primary-photo RPC.
- The new [release security workflow #44887913830](https://github.com/kzamora19/flyer-studio/actions/runs/44887913830) passed disposable PostgreSQL migration and primary-image checks, Deno typecheck, and **real hosted negative tests** that confirmed anonymous access is denied (401) and a foreign Origin is rejected (403). [Existing browser UI regression #44887913824](https://github.com/kzamora19/flyer-studio/actions/runs/44887913824) passed.
- The standalone product-photo UI is delivered by `site/product-photo-standalone.js`, using only the existing current PTG browser login. The **protected editor deliberately skips** this public adapter and continues using its isolated MessagePort relay, preventing duplicate clients or ambient PTG token access.
- The protected MegaFlyer integration [PR #10](https://github.com/kzamora19/flyer-studio/pull/10) has been reconciled with the released photo feature. Its private bundle delivery, PTG studio ticket login, shared-origin cutover and PWA retirement **remain development-only**.
- **Outstanding acceptance** includes a verified live TL+/admin product-photo upload/recall across devices (not proven by anonymous denial alone), account revocation during an active Studio session, real Cloud Save/Retrieve, Google OAuth/Drive, physical prints, backups/migration, and the coordinated four-app access cutover.

**Do not mistake the standalone photo-library release for completion of Branchline Unified Integration.** No extra Supabase project, subscription or Vercel deployment was created.


## PTG signed continuation for protected MegaFlyer shared photos — staged

- Resolved the opaque-frame product-photo authentication mismatch: the unreleased MegaFlyer editor no longer needs a reusable PTG bearer or app-session ID to access its shared photo library.
- Parent keeps a non-extractable P-256 signing key and **serializes** photo actions with 30-second revocation checks, preventing concurrent consumption of the same PTG one-time challenge.
- The existing **standalone** Photo Library continues to authenticate directly via active PTG session as already released. The **protected** mode uses a one-use signed challenge, verified server-to-server by PTG. PTG alone supplies the actor ID and TL/admin scope; unauthorized / revoked proof closes the private editor.
- The PTG function's added actor/scope fields are server-only and removed from the browser-facing private MegaFlyer delivery response.
- The latest [MegaFlyer proof-only browser CI](https://github.com/kzamora19/flyer-studio/actions/runs/44889656108) passed tests for real editor layout/export, product photo recall/upload/opt-out without iframe credentials, encrypted local draft restore, cloud Save/Retrieve mock and proof revocation closing the iframe. [Branchline cross-repository source policy](https://github.com/kzamora19/branchline/actions/runs/44889552406) also passed.

**This does not authorize four-app deployment.** PTG hosting, real cloud project integration, Google OAuth/Drive, actual TL/admin/revocation and user recovery, PWA/public editor shutdown, exact SHA cross-repo regression and production rollback must pass before the unified cutover. Draft PR merge conflicts with active production branches must be reconciled in a separate reviewed step.


## Live backend and owner Drive verified — 22 November 2026 (supersedes earlier "not installed" status)

These are **additive backend preparations**, not a GitHub Pages public cutover:

- Existing PTG Supabase has the service-only Studio ticket/proof and encrypted-cloud tables, plus the separately named `ptg-studio-access` Edge gateway. Its forged-origin/missing-login checks passed live.
- Existing MegaFrame and MegaFlyer Supabase projects each contain a SHA-256-verified private editor HTML package in a new private bucket plus a protected `*-editor-delivery` Edge function. Both reject forged tickets and forged origins.
- A live direct-URL check on [PTG CI run 44979169743](https://github.com/kzamora19/first-megasaver-ptg/actions/runs/44979169743) proved both private HTML objects were denied through public, publishable-key, browser bearer and `/object/public` paths.
- The owner OAuth refresh token and Google Drive API passed read-only verification. **Actual encrypted Drive transport then passed:** a temporary GitHub-OIDC-attested canary performed real synthetic AES-256-GCM writes, lists, reads, decrypts and wrong-PTG-owner denials for *both* Studios; [run 44978909438](https://github.com/kzamora19/first-megasaver-ptg/actions/runs/44978909438) reported `megaframe:ok,flyer:ok HTTP 200`. Synthetic canary file removal was attempted; no cleanup error was reported. Temporary remote canary and upload diagnostic functions are disabled and their runner workflows removed.
- No actual employee or customer backup was touched. Google Drive remains optional owner-managed backup in addition to the existing Supabase cloud project backend. Large photo-heavy Google Drive backups remain outside the current central 1.2M-ciphertext envelope limit.

### Additive protected shadow-launch artifacts prepared, not published
- MegaFrame development PR #18 has `staging/build-shadow-pages.mjs` + `staging/shadow-pages.test.mjs`: copies an exact build of the current public editor/PWA and adds only a secure `/studio/` launcher with a public publishable key.
- MegaFlyer development PR #10 has `scripts/build-shadow-pages.mjs` + `tests/shadow-pages.test.mjs`: copies current public `site/` byte-for-byte, adding only `/studio/` launcher.
- Preview builders refuse arbitrary target folders and require explicit `PTG_STUDIO_SHADOW_PREVIEW=1`; CI verifies root editor source and PWA files have not changed. These are **local CI artifacts**, not GitHub Pages preview deployments.
- Ordinary GitHub Pages does not provide an independent PR preview deployment for these sites. Publishing hidden shadow launchers would be an additive change to the existing public Pages output. Do **not** publish them until a controlled acceptance arrangement is approved and no user-facing navigation is switched.
- PTG `/studios/` route exists **in development PR #40 only**, and its launch URLs are fail-closed in the current production Pages build. Staff cannot use a hosted protected Studio launch URL yet.

### Still-open release gates
- Authenticated *real* PTG roles, disabled/revoked sessions and forced logout against the deployed gateways.
- End-to-end editor access, Company Drive save and restore in a browser, customer/photo library permissions and project imports on Windows/mobile.
- Preserve existing local/IndexedDB projects and PWA data before retiring original public editor sources; verify native PNG/PDF/physical printing.
- Confirm Google OAuth application publishing status; **External Testing** refresh tokens for `drive.file` can expire in 7 days.
- Four coordinated PR merges and Pages cutover still **NOT approved or deployed**. Keep all current users and independent apps working.

This section supersedes earlier historical statements in this runbook that the additive private Supabase backend functions or buckets were not installed. It does **not** relax the explicit release security and data-preservation gates.
