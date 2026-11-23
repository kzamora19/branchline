# Unified Branchline Workspace and Windows installer — coordinated release gate (2026-11-23)

**Status: HOLD.** This records the owner's conditional request to verify and then release; it is **not** permission to skip the acceptance gates. Do not merge the protected Studios or republish the Windows installer just because CI is green. Use GitHub Pages and Supabase; do not introduce Vercel.

## Release scope and frozen behavior

- Branchline Sales Tracker `kzamora19/branchline` — four-app chooser and consistent visual styling.
- PTG `kzamora19/first-megasaver-ptg` — Studio ticket authorization and PTG sidebar; current login, branch roles, pricing and print layouts remain intact.
- MegaFrame `kzamora19/megaframe-studio` — protected editor, encrypted projects, templates, and printing.
- MegaFlyer `kzamora19/flyer-studio` — protected editor, photo library, cloud project workflows and exports.
- Windows Branchline Workspace installer and pre-existing installed clients, including offline/PWA update and rollback.

**Do not modify or revert Sales Tracker Promotion/Event on-open behavior from merged Branchline PR #51.** Preserve session boundaries, branch scoping, account permissions, PS reports, and all user-saved projects.

## Verified evidence

- [Branchline outlined launcher / PS awards checks](https://github.com/kzamora19/branchline/actions/runs/45116194036) and [awards validation](https://github.com/kzamora19/branchline/actions/runs/45116193995) pass on `feature/branchline-unified-ui-stage-20261123`, commit `c43f3813665abcdf3a82c3b06d194f64247fff4b`. These are source/Chromium checks, **not** installed Windows testing.
- [Hosted independent-origin staging Chromium acceptance](https://github.com/kzamora19/first-megasaver-ptg/actions/runs/45107121936) passed on 2026-11-23, using `https://branchline-staging.github.io` and the **separate staging** Supabase project. It covered real staging issuer login, both protected Studio launches, four-role acceptance/disable/logout, MegaFlyer 2480×3507 PNG, MegaFrame encrypted Save/Retrieve across fresh contexts (photo retained), and MegaFrame PNG.
- Staging Supabase Edge functions `ptg-auth`, `ptg-studio-access`, `megaframe-editor-delivery`, and `flyer-editor-delivery` were ACTIVE on inspection. Staging RLS advisor flags 11 INFO server-owned/no-policy tables, and one WARN for disabled leaked-password protection. These findings need review, not automatic policy relaxation.
- In a read-only staging database check, there were 9 expired/revoked Studio tickets, 9 expired/revoked Studio proof sessions, 11 presently unexpired/unrevoked PTG app sessions, one Auth user **not matching** the `studio-ci-%@example.invalid` disposable fixture pattern, and one encrypted Studio backup. Identify the owner/purpose of remaining staging records **before** any cleanup; do not delete blindly.
- The downloadable PTG-repository Windows EXE blob `bed7b2b5a887b1e5c86469cf15519502cda19b4f` was last committed **2026-11-10**, and the portable ZIP blob `48ed40d5c1cdc4462d60c566e0f3dce2ace3afe6` last changed **2026-11-10**. This predates the approved four-app and 2026-11-23 launcher changes. The ZIP is a WebView2 WinForms package. No matching Windows application installer/build source appears in the PTG development branch's 256-file Git tree. A static package/manifest check cannot establish whether the installed Windows shell matches the approved interface.

## Incomplete or blocking checks (NO-GO)

1. **Windows build provenance and real-device validation:** locate the authoritative Windows shell source, rebuild a versioned installer, compare its hash to the published download, verify all four app tiles (transparent with thin outlines), existing-user upgrade, Windows 10/11 launch/sign-in, WebView2 bootstrap/install, safe rollback, and digital signature/trust behavior. Do not reuse the November 10 EXE as the new four-app release.
2. **Resolve duplicate Workspace entrypoints:** The PTG development source `app/workspace/mobile/workspace.tsx` still lists only Sales Tracker and PTG, whereas Branchline `/apps/` shows four. Determine which launcher each browser/installer entrypoint uses, update the designated source consistently, and verify routing without bypassing PTG TL+ checks.
3. **Combine latest code before testing:** Branchline UI PR #52, PTG UI PR #48, MegaFrame UI PR #36, and MegaFlyer UI PR #20 are separate draft branches. Protected integration PRs Branchline #45, PTG #40, MegaFrame #18 and MegaFlyer #10 are also draft. Reconcile latest production main (especially Branchline PR #51) into coordinated development release refs; assert no dropped changes, test those **combined commits**, and avoid merging isolated WIP PRs directly into main.
4. **End-to-end feature acceptance:** Verify real Google OAuth/Drive consent and Save/Retrieve with project/account permissions, actual physical print and color/layout for PTG tags and Studio outputs, MegaFlyer cloud recovery with embedded photos, larger photo project limits, approved official app icons and responsive/keyboard behavior on actual Chrome/Edge/Android devices. Hosted tests above do not prove these separately.
5. **Secure old client cutover:** prevent direct public editor bypass through legacy GitHub Pages/PWA cache while preserving user-owned local photos and projects. Take documented user-authorized backups and validate a rollback that does not silently republish public editor source.
6. **Security preflight and production release order:** Review staging residue and RLS warnings, check protected bundle SHA/pin/origin isolation and all publish guards, prepare production secrets **server side only**, and release all four Pages routes and Supabase functions in the prescribed order. Use short-lived active-role/revocation smoke and regression checks, then only update/publish Windows installers after web components are verified. If any link or function fails, stop cutover instead of pointing users to a broken portal.

## Rollout and user communication

- Keep the already-live Sales Tracker Promotion/Event popup and emailed user links functional until replacement routes are proven.
- No production deployment, production data migration, profile edits, role changes, or live project deletion is authorized merely by this document.
- A final release record must include exact four-repository commit SHAs, signed installer version and SHA-256, Pages deployment run URLs, Supabase Edge versions, browser/device/printer matrix, old-PWA backup acceptance, rollback command/plan, and post-release smoke evidence.
