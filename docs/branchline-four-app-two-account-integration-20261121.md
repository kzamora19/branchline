# Branchline four-module, two-account integration

**Status: development candidate only. No Supabase or GitHub Pages production deployment has been authorized.**

The free integration architecture uses **four already existing, active Supabase projects**, split between two connected owner accounts. A single Branchline browser workspace launches the corresponding applications. There is **no fifth Supabase project**, migration of sales/customer data, paid subscription, Vercel deployment or production account recreation.

| Frontend module | Browser location after coordinated cutover | Existing Supabase backend |
|---|---|---|
| Branchline Sales Tracker | `https://kzamora19.github.io/branchline/` | Primary → `Ken's Project` (`psoopubvdpwztzkdyifa`) |
| Price Tag Generator / Data Desk | `https://kzamora19.github.io/first-megasaver-ptg/` | Primary → `First Megasaver PTG` (`agknxlowackphvwyvxge`) |
| MegaFrame Studio | Protected entry `https://kzamora19.github.io/megaframe-studio/studio/` | MegaFrame/Flyer owner account → `MegaFrame Studio` (`vmyoxoiygfcecgkbavgg`) |
| MegaFlyer Studio | Protected entry `https://kzamora19.github.io/flyer-studio/studio/` | MegaFrame/Flyer owner account → `Flyer Studio` (`tzklsscoiwnmeantcefw`) |

These entries share a **GitHub Pages web origin**, not a Supabase database. They are distinct application modules and service projects under one user-facing Branchline workspace. They are not automatically shared-auth sessions: Sales Tracker maintains its existing login; PTG remains the authority for Creative Studio access.

## User-facing navigation built in the draft PRs

- The Branchline Applications hub exposes four modules and carries only a **non-secret** `?studio=megaframe` or `?studio=flyer` selector to the PTG portal.
- The PTG mobile/browser Workspace offers all four apps in the same shell. Creative Studio selections show the approved logos and subtitles, and the four-tab navigation is horizontally scrollable on narrow phones.
- Eligible System Admin, Branch Admin and exactly `BRANCH_USER` with legacy `TEAM LEADER` receive visible links in the relevant PTG menus; ordinary branch users are not offered a Studio menu. **Hiding links is UX, never authorization.**
- The PTG `/studios/` portal validates its current Supabase Auth session and PTG app-session ID, then requests a server-issued, short-lived ticket via `ptg-studio-access`. It **never** automatically issues a grant merely because a `?studio` selector exists.
- The portal accepts only the exact approved protected Studio paths `/megaframe-studio/studio/` and `/flyer-studio/studio/`. Public legacy editor roots, arbitrary endpoints, query strings and Vercel URLs fail closed.
- The two protected pages contain only ticket verification / encrypted-vault scripts and visual scaffolding. They **do not contain the editor**. The actual bundle is fetched after a server-to-server PTG authorization exchange from the Studio's own private Supabase Storage bucket.
- Server-to-server Studio auth requires explicit `PTG_STUDIO_DEPLOYMENT_MODE=production` and `PTG_STUDIO_GATEWAY_URL=https://agknxlowackphvwyvxge.supabase.co/functions/v1/ptg-studio-access`. The shared gateway secret belongs only in server-side environment variables; **never put it in GitHub Pages**. The Studio delivery servers validate the live PTG session on signed challenges.
- Studio browser editors remain in sandboxed **opaque-origin iframes**. The launcher owns account-specific AES-GCM encrypted draft recovery. Older PWA caches and backups require explicit migration acceptance.

## Coordinated release-only configuration (NOT yet enabled)

1. On the PTG **existing** project, apply only approved migration(s) for Studio tickets/continuation and deploy its `ptg-studio-access` function after final owner sign-off. Configure `PTG_STUDIO_ISSUER_ORIGIN=https://kzamora19.github.io`, `PTG_STUDIO_GATEWAY_SECRET`, and a stable `PTG_STUDIO_DRAFT_RECOVERY_SECRET` (both strong, server-only).
2. In MegaFrame's **existing** project, create a distinct **private** `megaframe-editor-release` bucket. Configure the Studio's function with SHA-pinned immutable object path, its own service-only Storage key, expected HTTPS origin and the matching server-to-server PTG gateway secret. No live customer bucket or anonymous public release objects.
3. In MegaFlyer's **existing** project, similarly use a distinct **private** `flyer-editor-release` bucket and configured function. Do not expose or overwrite shared customer artwork.
4. In PTG's static build configure `NEXT_PUBLIC_STUDIO_MEGAFRAME_LAUNCH_URL=https://kzamora19.github.io/megaframe-studio/studio/` and `NEXT_PUBLIC_STUDIO_FLYER_LAUNCH_URL=https://kzamora19.github.io/flyer-studio/studio/`. Do not enable until both private delivery services and Pages protected entries are proven working.
5. Both Studio Pages cutover workflows require an explicit manual `workflow_dispatch` on `main`, the matching `*_CUTOVER_APPROVED=true` repo variable, and valid **public** release variables `MEGAFRAME_STUDIO_PUBLISHABLE_KEY` / `MEGAFLYER_STUDIO_PUBLISHABLE_KEY` (never service-role/secret keys). The release build fails closed if the publishable key is missing. Until approval, existing live public editors remain unchanged and the cutover must not be triggered.
6. Follow the [source retirement and rollback runbook](./creative-studios-source-retirement-runbook-20261121.md). Preserve local/cross-device customer projects, and never delete user storage as a migration shortcut.

## Verified CI checkpoint

- [Branchline joint four-repository contract run](https://github.com/kzamora19/branchline/actions/runs/44882868816) passed: checks out **all four development branches**, builds both protected-only cutover artifacts locally, validates Portal and Studio URLs, backend ref consistency, ticket/crypto boundaries and old editor absence. **No deployment.**
- [PTG four-job auth/SQL/Edge/local GoTrue run](https://github.com/kzamora19/first-megasaver-ptg/actions/runs/44882647971) passed. [MegaFrame private-editor browser run](https://github.com/kzamora19/megaframe-studio/actions/runs/44882706482) and [MegaFlyer package/browser run](https://github.com/kzamora19/flyer-studio/actions/runs/44882691552) passed.
- The **existing downloadable Windows installer** was built before this four-app web integration. Its contents have **not** been rebuilt. The browser/PWA Workspace is the four-module target; a new Windows package would need its own independent rebuild and compatibility tests.

**Remaining release blockers:** hosted actual PTG/Studio role and revocation tests, provider OAuth/Google Drive and cross-device cloud Save/Retrieve, real device/physical printing, historical Pages/PWA bypass retirement under real URLs, customer backup/migration approval, and final coordinated production release permission. Without these, keep all four PRs DRAFT and the release ON HOLD.


## MegaFlyer Smart Product Photo Library — added to this coordinated release

- MegaFlyer draft [#10](https://github.com/kzamora19/flyer-studio/pull/10) now contains a PTG-gated private Product Photo Library client, its own private Supabase Storage bucket/migration and server-only photo gateway in the **existing Flyer Studio Supabase project**.
- Barcode is primary, exact normalized brand + model is fallback, description matches are *suggestions requiring confirmation*. Imported photos are content-hash deduplicated with separate thumbnail and immutable source objects; cross-account reuse is scoped to active PTG TL+ sessions.
- A protected-editor **Product Photos** panel and the native product-card upload support explicit opt-out. The library intentionally never inspects or automatically shares customer, freebie, generic asset, logo, or headline-photo upload inputs.
- The separate product library Edge function validates a *fresh* PTG Auth user and PTG app session on every read/write; ordinary Branch Users and revoked accounts cannot use the gateway. Delete and replacement are Branch Admin/System Admin only.
- Added [smart photo staging guide](https://github.com/kzamora19/flyer-studio/blob/feature/ptg-private-delivery-poc-20261121/docs/smart-product-photo-library-staging-20261121.md).
- The feature is **development-only**; it was not deployed or migrated into production and still requires cloud, cross-device, real revoked-account, native uploader, print and PWA-cutover acceptance before the existing four-app release HOLD can be removed.
