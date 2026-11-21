# Studio gateway cross-repository review — November 20, 2026

The PTG Team Leader+ gateway in this pull request remains a **draft hold**. The official product name is **MegaFlyer Studio**, not Flyer Studio; the staged Branchline card now reflects this.

## Production reality

- Branchline's current live catalog opens the public MegaFlyer GitHub Pages URL directly; both Studio editor and MegaFlyer Library permissions must be distinguished.
- The existing PTG gateway draft (`kzamora19/first-megasaver-ptg` PR #38) uses a Vercel-hosted PTG `/studios` portal and Vercel-protected Studio URLs, which **conflicts with the owner's current GitHub Pages + Supabase hosting preference**. This is not approved for release.
- PTG Team Leader/Branch Admin/System Admin validation is server-side in the draft Edge Function. A Branchline link or client-side hide alone cannot enforce application access, especially on public GitHub Pages.
- Dedicated private asset permissions in MegaFlyer Supabase do not block access to the public editor shell.
- The shared gateway also has drafts in MegaFlyer (PR #2) and MegaFrame (PR #16). None should be merged independently.

## Required release design before any deployment

1. Settle a **server-enforced** hosting approach compatible with the current cost and stack requirements. Public GitHub Pages cannot block direct download of the editor assets.
2. Reconcile the PTG portal URL, studio callback/proxy URLs and PWA install flow with the chosen approved domains; the existing `first-megasaver-ptg.vercel.app/studios/` link is **draft-only**, not a live verified entry point.
3. Test actual PTG accounts for active TL, Branch Admin, ordinary Branch User, disabled, revoked, expired and forced-logout states. Validate direct URL bypass attempts.
4. Include cross-device image-library sync, manual Google Drive JSON backup/restore and print output verification with a disposable fixture.
5. Review exact main-branch compatibility and coordinate all four repositories before a release; preserve rollback, do not pass Branchline or PTG access tokens via URL query strings.
6. Until then, keep the existing public site and production backend unchanged; do not deploy this draft redirect.

## This staged change

Only corrects **MegaFlyer Studio** branding on the existing draft Branchline gateway card and associated tests. No live redirects, credentials, or hosting configuration are modified.

## November 21, 2026 — Non-Vercel draft launcher path

- The draft-only Creative Studios cards now link to the *intended* PTG GitHub Pages route `https://kzamora19.github.io/first-megasaver-ptg/studios/`, based on its existing Next.js `basePath: "/first-megasaver-ptg"` and `app/studios/page.tsx` staging route.
- This is **not yet a verified live route**: the PTG Studio portal itself is not released on GitHub Pages. These Branchline changes must stay draft/hold and cannot be merged independently.
- PTG's **ordinary Price Tag Generator** card retains its existing production link; do not silently rewrite or break unrelated application navigation.
- The destination launcher must ultimately point only to server-verified protected studio pages, never directly to the publicly served editor HTML/JS. The PTG draft requires an explicit HTTPS issuer origin and protected destinations; its PTG origin and both Studio URLs still require release-time configuration.
