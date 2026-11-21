# Coordinated Creative Studios release status — November 21, 2026

**STAGING ONLY. Production Branchline, PTG, MegaFlyer and MegaFrame must remain unchanged until all gates pass.**

## Current integration branches

| Component | Development PR | Verified | Still blocked |
|---|---|---|---|
| Branchline navigation | branchline #45 | Application hub CI passed; both Creative Studio cards use intended PTG launch portal | PTG /studios launcher is not live; do not merge navigation alone |
| PTG Studio issuer | first-megasaver-ptg #40 | Up-to-date GitHub Pages branch, server-only role/session policy, exact issuer origin and ticket/continuation tests passed in CI | Live Edge function and ticket SQL not deployed; real roles, revoked sessions, replay and renewal untested |
| MegaFlyer | flyer-studio #10 | Opaque sandbox (no parent storage), SHA-256 bundle check, authenticated-in-frame mock cloud Save/Retrieve, PNG/PDF exports, and AES-GCM account-scoped local recovery passed mock CI run 44869790137; cross-account isolation being retested | Live PTG authorization, Google OAuth/Drive, cross-device recovery, physical printing and direct Pages editor cutover remain unverified |
| MegaFrame | megaframe-studio #18 | Private package with SHA256-pinned CSP, mocked authorized editor load, photo upload and PNG download; forged hash and revoked session denied | **STAGING PASS: AES-GCM local photo draft save/restore works across mocked PTG launches; separate account cannot read it.** Real PTG issuance, dedicated origin security, cloud templates, Google Drive, installed PWA and privacy acceptance still pending |

## Security commitments

- Only active PTG System Admin, Branch Admin or BRANCH_USER with legacy Team Leader role may receive a Studio ticket; deny all ordinary Branch Users and inactive/revoked/expired/branch-OFF sessions.
- GitHub Pages hosts an editor-free entry, but must NOT expose the editor itself. Protected source must be privately delivered by Supabase only after verified live PTG authorization.
- Browser origin is shared by all apps under kzamora19.github.io, even with separate paths. Do not use allow-same-origin iframe access as a shortcut to bypass draft-storage isolation.
- Private customer photos remain local by default, and no automatic upload to Supabase or Google Drive is allowed without an explicit approved privacy design.
- A user must be able to save and recover unfinished work after ticket expiry, revoked session or app restart without exposing old photos to the next user.
- Test direct static URL/PWA cache access, signed assets, invalid credentials, forced logouts, server-side rate limits, ticket replay and session renewal.

## Coordinated release sequence (not yet triggered)

1. Preserve MegaFrame's newest emoji-cover editor and verified AES-GCM draft recovery, then validate real PTG account sessions, cloud templates and Google Drive compatibility.
2. Complete MegaFlyer encrypted cross-account recovery isolation and real cloud Save/Retrieve, PDF/PNG export and Google Drive acceptance through a protected launcher on two devices.
3. Validate PTG ticket issuer and private delivery with real authorized/denied accounts; no production user impersonation, no passwords in test logs.
4. Preflight the new editor-free GitHub Pages publishing artifacts and existing customer drafts; capture rollback points.
5. After every gate passes, deploy private PTG + Studio services, atomically cut over both Pages editors and Branchline links, and verify end-to-end in real browsers.
6. On any failing live smoke check, roll back the cross-app cutover together and preserve all photos, frames and saved projects.

**No Vercel; no production changes from this release candidate.**

## Secure recovery checkpoint
- MegaFrame branch reconciled latest production emoji-cover commit; [run 44868906789](https://github.com/kzamora19/megaframe-studio/actions/runs/44868906789) passed package and full protected-browser tests.
- MegaFlyer [run 44869790137](https://github.com/kzamora19/flyer-studio/actions/runs/44869790137) passed opaque editor, per-PTG-scope encrypted local recovery, cloud Save/Retrieve and export with mocked PTG/cloud responses; next test adds a different-account denial regression.
- MegaFrame's mock browser run 44868201343 passed encrypted draft save/restore, account isolation, P-256 signing, photo PNG export and revocation checks; these are not real PTG accounts.
- PTG gateway draft #40 passed 12 staging tests, including one-time draft key derivation; secret configuration and real role checks are not deployed.
- The coordinated cutover remains ON HOLD until both Studio protected deliveries, existing public URL bypass, and real user/device acceptance are verified.
