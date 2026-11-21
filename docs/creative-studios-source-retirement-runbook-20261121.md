# Coordinated Creative Studios public-source retirement — staging runbook

**Status: DRAFT; no production merges, deployments, Supabase migrations or user-account changes authorized.**  
**Architecture:** GitHub Pages + Supabase, with PTG as the Team Leader-and-above authorization authority. No Vercel deployment.

## What cannot be secured by a redirect

- The currently public MegaFrame Pages build publishes `editor.js`, `shared.js`, sample images and Google Drive/editor support files. Its existing `service-worker.js` caches the editor shell offline.
- The currently public MegaFlyer Pages build publishes its full editor as `site/index.html` plus separate editing assets. Hiding links in Branchline would not protect that source.
- All `kzamora19.github.io` repository paths share one web origin. A path alone does not isolate browser storage, tokens or cookies.
- Existing copies on offline PWA devices and user-downloaded source **cannot be remotely erased or disabled before reconnection**. Removing the origin's public files closes new online direct access, not historical downloaded code.

## Development-only retirement artifacts

| App | Approved-preview command | Generated output | Existing production flow |
|---|---|---|---|
| MegaFrame | `PTG_STUDIO_CUTOVER_PREVIEW=1 node staging/build-cutover-pages.mjs staging/.cutover-preview` | `index.html`, `manifest.webmanifest`, icon assets, `retire-client.js`, a no-cache `service-worker.js`, `.nojekyll` | `scripts/build_pages_site.py` and Pages workflow intentionally unchanged |
| MegaFlyer | `PTG_STUDIO_CUTOVER_PREVIEW=1 node scripts/build-cutover-pages.mjs staging/.cutover-preview` | `index.html`, `manifest.webmanifest`, original icon assets, `.nojekyll` | Existing Pages workflow publishes `site/` unchanged |

These commands produce **previews only** inside the development repository staging directory; they are **not invoked by normal Pages workflows**. The artifact contents are deliberately small and contain no editor script, original photo library, saved project payload, source map, template script or service credentials. Both use the official MegaFrame/MegaFlyer icons and approved subtitles; the landing link goes exclusively to `https://kzamora19.github.io/first-megasaver-ptg/studios/`.

MegaFrame's retirement service worker takes control **after an online update**, does not cache or return editor scripts, deletes only caches with prefix `megaframe-shell-`, and does not clear IndexedDB or localStorage or unrelated Branchline/PTG caches. MegaFlyer has no registered service worker in its current public editor source; do not install one merely to redirect.

## Preconditions — do not perform a partial cutover

- [ ] Confirm the entire PTG Studio issuer, real hosted Supabase Auth and source PTG session API, one-use tickets, P-256 continuation, rate limits, forced logout, disabled users and server-side private bundle delivery on a **separate, isolated hosted staging environment**. The passing disposable local Supabase CI alone is not sufficient.
- [ ] Confirm MegaFrame and MegaFlyer private source objects are inaccessible without a valid current PTG session, including direct object URL, unauthorized browser, cross-role, cross-Studio and revoked token requests; storage RLS must deny browser downloads.
- [ ] Confirm distinct PTG TL, Branch Admin, System Admin, ordinary Branch User, expired, revoked, disabled, branch-off and force-password-change accounts; verify source session invalidation and concurrent ticket replay. No production accounts may be used for destructive tests.
- [ ] Confirm cloud save/retrieve, conflict handling, correct per-account ownership and cross-device sync with actual provider OAuth and Google Drive credentials where applicable.
- [ ] Preserve browser-local drafts and named projects: test backups of both old apps on real Windows and Android (including installed MegaFrame PWA) and recovery/import into protected private editors. Imported customer photos must remain account-scoped; manually downloaded JSON backups can contain customer photos in plaintext. Do not replace the public editors while data has no validated recovery path.
- [ ] Validate product catalog, photo uploads, frame editing, print PDF/PNG and physical paper print, plus unchanged creative design/branding in generated output.
- [ ] Review whether any public assets, existing CDN URLs, static preloads, shared origin storage, service-worker registrations, and browser HTTP cache can bypass the protected delivery. Inspect directly at old `/megaframe-studio/` and `/flyer-studio/` paths.
- [ ] Prepare an announcement for all current users: save and export current work, reconnect installed PWAs, complete migration, acknowledge that old downloaded offline code cannot be remotely erased.
- [ ] Secure explicit owner approval for one coordinated maintenance/release window. Existing independent apps must continue functioning until that approval.

## Release sequence (only after all gates pass)

1. Create source/code snapshots and an audit trail for all four development PR heads, Supabase migrations and current Pages artifacts. Confirm the rollback runbook and users' data migration before changes.
2. Deploy protected Supabase private bundle storage, RLS and Edge functions with server-only secrets; verify direct browser storage access is forbidden. Deploy PTG authorization and private portal without replacing any original public Studio site yet.
3. Test successful authorized flows end-to-end from the PTG portal for MegaFrame and MegaFlyer with separate real test accounts and real output files. Test logout/revocation again. Keep disabled-to-public old direct routes as a **release blocker**, not acceptable permanent state.
4. During the approved coordinated cutover, publish **editor-free** retirement artifacts to both historical GitHub Pages roots, replacing *all* old publicly downloadable editor files (not merely `index.html`). Use explicit, reviewed workflow changes or an approved Pages action; a dry-run artifact is not a deployment.
5. Verify GitHub Pages returns retirement entrypoints for both roots and no longer serves original `editor.js`, old HTML, sample scripts or original bundled assets. Verify HTTP and PWA cache behavior after online reconnection on desktop/mobile. Only the new PTG portal should deliver private editor bytes following authorized server-side checks.
6. Publish the unified Branchline hub and branding as part of the same release, retaining independent logo/title identities. Reconfirm Sales Tracker and Data Desk unchanged and that both Studio cards open PTG.
7. Monitor availability, login and denied direct URL attempts, cloud saves, backup and printing with scoped test accounts; communicate the new routes. Perform post-release source scans and installed-PWA reconnection checks.

## Rollback and limitations

- **Security-first rollback:** If private access fails after retirement, disable Studio entry points or put the protected portal into maintenance mode while preserving user data. Never silently reintroduce publicly served editor code as a convenience rollback.
- A restored pre-cutover public Pages artifact reopens the direct-access bypass and therefore **requires separate explicit security approval**. It must not be the default automated rollback.
- Do not run mass `caches.delete`, IndexedDB deletion or `localStorage.clear()` for an entire shared `github.io` origin. They can erase unrelated user data and affect Branchline/PTG.
- Old offline installed copies can remain functional on devices that never reconnect; this cannot be prevented by a GitHub Pages deployment alone. This risk must be documented and accepted before release.
- Backups, historical client-side data and existing printed documents are **not** transformed by a UI-only change. Migration coverage remains mandatory.
- **Any failed check blocks the entire coordinated release**. All four PRs stay drafts until explicit owner approval.

## Staged automated checks

- MegaFrame `staging/cutover-pages.test.mjs`: fails closed unless explicitly requested, contains only approved public files, preserves official icon, scoped worker cache deletion, no destructive storage handling. `staging/cutover-browser.test.mjs`: live Chromium rehearsal of old cached PWA -> new retirement worker -> no direct editor source, other apps' cache intact, old customer project IndexedDB intact.
- MegaFlyer `tests/staged-cutover-pages.test.mjs`: prevents accidental public `site/` changes, confirms strict asset manifest and no full editor source; existing protected editor Chromium tests cover PNG/PDF.
- Branchline application-hub tests: new routes point to PTG and do not forward tokens; old Pages URLs are never used for authorized navigation.
- PTG four-job security CI: real disposable local GoTrue/PostgREST, PostgreSQL concurrency, actual Edge HTTP, and module branding. Hosted staging and real-accounts remain untested.

**No deployment occurred by writing this runbook or generating any dry-run artifacts.**
