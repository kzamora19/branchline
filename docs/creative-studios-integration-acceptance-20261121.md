# Coordinated Creative Studios release status — November 21, 2026

**STAGING ONLY. Production Branchline, PTG, MegaFlyer and MegaFrame must remain unchanged until all gates pass.**

## Current integration branches

| Component | Development PR | Verified | Still blocked |
|---|---|---|---|
| Branchline navigation | branchline #45 | Application hub CI passed; both Creative Studio cards use intended PTG launch portal | PTG /studios launcher is not live; do not merge navigation alone |
| PTG Studio issuer | first-megasaver-ptg #40 | Up-to-date GitHub Pages branch, server-only role/session policy, exact issuer origin and ticket/continuation tests passed in CI | Live Edge function and ticket SQL not deployed; real roles, revoked sessions, replay and renewal untested |
| MegaFlyer | flyer-studio #10 | Editor private-bundle, mock PTG/Supabase integration, print/export and saved project smoke tests staged | Full user authorization, origin isolation, cloud/Google Drive across-device acceptance, direct Pages editor cutover unverified |
| MegaFrame | megaframe-studio #18 | Private package with SHA256-pinned CSP, mocked authorized editor load, photo upload and PNG download; forged hash and revoked session denied | **STAGING PASS: AES-GCM local photo draft save/restore works across mocked PTG launches; separate account cannot read it.** Real PTG issuance, dedicated origin security, cloud templates, Google Drive, installed PWA and privacy acceptance still pending |

## Security commitments

- Only active PTG System Admin, Branch Admin or BRANCH_USER with legacy Team Leader role may receive a Studio ticket; deny all ordinary Branch Users and inactive/revoked/expired/branch-OFF sessions.
- GitHub Pages hosts an editor-free entry, but must NOT expose the editor itself. Protected source must be privately delivered by Supabase only after verified live PTG authorization.
- Browser origin is shared by all apps under kzamora19.github.io, even with separate paths. Do not use allow-same-origin iframe access as a shortcut to bypass draft-storage isolation.
- Private customer photos remain local by default, and no automatic upload to Supabase or Google Drive is allowed without an explicit approved privacy design.
- A user must be able to save and recover unfinished work after ticket expiry, revoked session or app restart without exposing old photos to the next user.
- Test direct static URL/PWA cache access, signed assets, invalid credentials, forced logouts, server-side rate limits, ticket replay and session renewal.

## Coordinated release sequence (not yet triggered)

1. Fix MegaFrame draft persistence securely and confirm full actual editor/photo/frame exports in a private browser origin; test Cloud and Google Drive compatibility.
2. Confirm MegaFlyer privacy, cloud Save/Retrieve and PDF/PNG export through the protected launcher on two devices.
3. Validate PTG ticket issuer and private delivery with real authorized/denied accounts; no production user impersonation, no passwords in test logs.
4. Preflight the new editor-free GitHub Pages publishing artifacts and existing customer drafts; capture rollback points.
5. After every gate passes, deploy private PTG + Studio services, atomically cut over both Pages editors and Branchline links, and verify end-to-end in real browsers.
6. On any failing live smoke check, roll back the cross-app cutover together and preserve all photos, frames and saved projects.

**No Vercel; no production changes from this release candidate.**

## Secure recovery checkpoint
- MegaFrame's mock browser run 44868201343 passed encrypted draft save/restore, account isolation, P-256 signing, photo PNG export and revocation checks; these are not real PTG accounts.
- PTG gateway draft #40 passed 12 staging tests, including one-time draft key derivation; secret configuration and real role checks are not deployed.
- The coordinated cutover remains ON HOLD until both Studio protected deliveries, existing public URL bypass, and real user/device acceptance are verified.
