# Branchline coordinated four-app release checkpoint — November 23, 2026

**Decision: DEVELOPMENT VALIDATED / PRODUCTION HOLD.** Owner requested to continue toward coordinated deployment **only once safe**. Passing developer CI does not authorize bypassing required end-to-end tests. No live GitHub Pages publication, Supabase production data edits, PWA retirement, app-store upgrade or user-email redistribution occurs as part of this checkpoint.

## Source-based release candidate (exact refs)

| Component | Development ref / commit | Tested behavior |
|---|---|---|
| Branchline Sales Tracker + unified Workspace | `feature/combined-ui-and-ptg-studios-20261123` / `97dea95570c144c886bcf9d8f08be11895d5640b` | Four-app launcher and PTG-gated links, app sidebar, transparent tiles, role-scoped Sales Tracker, PWA cache |
| PTG + protected Studio gateway | `feature/ptg-protected-unified-ui-20261123` / `8f32629e15ab42e1cbe9921d3b5dd5d5d7968eb5` | Collapsible PTG sidebar while retaining Studio TL/admin permissions and one-time tickets |
| MegaFrame private Studio | `feature/protected-branchline-theme-20261123` / `f8934ee1a3a161ea4eb46ac118baad1e454717ae` | New navy styling in encrypted protected editor; browser recovery and revocation regression |
| MegaFlyer private Studio | `feature/protected-branchline-theme-20261123` / `8906c710de8f72f0607109c142518588df87e207` | New navigation styling in private bundle; protected editing and photo-library code preserved |
| Windows Workspace *preview only* | `feature/workspace-installer-source-20261123` / `7f09587a20003196e6bb8297d99daa4e60e4f045` | Source-built WebView2 x64 preview, separate AppId/profile, Inno Setup artifact and checksums |

These ref/commit pairs are the candidate under review, not production releases. If any head changes, re-run the full QA set and refresh this table.

## Passed automated evidence

- [Branchline combined visual/contract CI](https://github.com/kzamora19/branchline/actions/runs/45123211248) and [original four-repository source contract](https://github.com/kzamora19/branchline/actions/runs/45123211220): PASS. Browser tests cover desktop app rail, mobile menu, four guarded destinations, PWA shell and completed calendar opening-notice logic.
- [PTG staged protected source, local real Supabase and Edge tests](https://github.com/kzamora19/first-megasaver-ptg/actions/runs/45123093919): all five jobs PASS, including TypeScript/Next build, policy/RLS and real local Auth/PostgREST.
- [MegaFrame protected source and Chromium tests](https://github.com/kzamora19/megaframe-studio/actions/runs/45123447185): PASS after updating an obsolete expected navy-color assertion. No underlying auth/print/cloud logic was altered.
- [MegaFlyer protected packaging/Chromium](https://github.com/kzamora19/flyer-studio/actions/runs/45123005656): PASS.
- [Windows unsigned preview build](https://github.com/kzamora19/first-megasaver-ptg/actions/runs/45122259907): PASS. Preview installer file SHA-256 `C7349C58EEBEFB1B3FF8EC61268E7F75D86FA4BBA6F634B892750AF0533C97C1`, portable ZIP SHA-256 `661F35DE06B359546F157853272C8E9AC85716944DD95422F8866C1DF3E20A45`. Both uploaded only as temporary GitHub Actions artifacts, not to public PTG paths or release assets.
- [Separate staging-origin hosted Studio acceptance](https://github.com/kzamora19/first-megasaver-ptg/actions/runs/45107121936): PASS on staging origin and isolated Supabase, including four roles, MegaFrame encrypted same-user restore in a fresh browser context, both PNG exports and disable/logout checks. **This test predates the combined branded source commits above and cannot replace new combined hosted/device acceptance.**

## Mandatory unresolved gates

1. **Installed Windows devices:** test Windows 10/11 x64 native app launch, WebView2 runtime bootstrap, existing November 10 installer upgrade and rollback, PWA overlap, external Google provider popups, file print/download dialogs and user data. Current preview installs separately and deliberately does **not** migrate/overwrite users' old installation. Code signing and approved official app icon assets are still missing. Do not encourage users to bypass SmartScreen.
2. **True four-app staging frontend:** test *these exact combined UI releases* from an independent HTTPS staging browser origin using genuine synthetic PTG sessions, including allowed/denied/revoked role behavior, per-branch permissions, cross-device saved projects, Google owner Drive consent/backup-restore and large photo projects.
3. **Real physical print acceptance:** PTG tag pages/copies/brand and prices, MegaFrame photo alignment/crop/fonts, MegaFlyer PDF/PNG layouts and full-size products on actual configured printers.
4. **Legacy public links/PWA:** signed-off backup and transfer of local/exported projects; verify no old public direct editor source or cached installed PWAs bypass PTG after coordinated source retirement; rehearse safe rollback that does **not** reopen editor source.
5. **Staging integrity:** a prior read-only staging audit found an account that did not match the disposable `studio-ci-%@example.invalid` fixture pattern, 11 unrevoked app sessions, nine expired Studio tickets, nine expired proof sessions and one backup. Identify ownership/expiration and protect data before any authorized cleanup. Keep RLS fail-closed; review password protection warning.
6. **Production cutover:** exact approved GitHub Pages URLs, Edge secrets and pinned private bundle SHA, server-side authorization and revocation checks, all app icons, source-free Pages release variables, staged canaries, owner-approved release order, versioned rollback and live smoke tests.

The already-deployed **Branchline Promotion/Event popup PR #51** remains intact. Do not rewrite its logic or send another user announcement during development. Existing user links and old installer downloads remain unchanged until a safer signed replacement is accepted.

## Outcome

The source-backed preview installer and four aligned development branches are real, reproducible progress. **No production deployment is safe yet** without the remaining device/print/Drive/PWA acceptance. Resume from these refs and the branch-specific draft pull requests; do not restart the completed popup work.
