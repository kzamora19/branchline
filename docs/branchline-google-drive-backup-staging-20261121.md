# Branchline Creative Studios — Google Drive backup staging (2026-11-21)

**DRAFT ONLY. Not merged, deployed, or validated with a real Google account.**

## Approved storage layout
- **Supabase** remains each app's database and normal project-saving infrastructure. The existing PTG account is the authorization source.
- **Google Drive** is an **additional manual backup and retrieval option** in the protected MegaFrame and MegaFlyer launchers; it does not replace Supabase or the existing PTG encrypted cloud archive.
- **GitHub Pages** remains the public static launcher host. The private editor continues to run inside the sandbox without `allow-same-origin`.
- No new Supabase project, migration of live rows, or paid host was created.

## Staged source
The same `staging/studio-access/drive-backup.js` module is present in both Studio PRs. It runs only in the PTG-signed trusted parent launcher and not inside the opaque editor. The panel provides:
1. **Connect Google Drive** using Google Identity Services OAuth and the narrow `drive.file` permission (no Google password and no Drive-wide read scope);
2. **Back up to Google Drive**, after checking current PTG P-256 authorization and an explicit confirmation for potentially photo-containing projects;
3. **Refresh Drive backups** and **Retrieve from Google Drive**, using another fresh PTG signed proof and client-side decryption;
4. **Disconnect**, which clears the session token and requests revocation. Tokens are held only in launcher memory, never in URLs, browser storage, project files, database rows, or the opaque editor.

A visible `Branchline Studio Backups` folder is created in the **user-selected Google account**. Each click creates a new timestamped JSON snapshot; no backup is automatically overwritten or deleted. The file contains the account-scoped **AES-GCM ciphertext and IV**, not plaintext customer photos. It is tagged with a one-way hash of the PTG account recovery scope and Studio ID. The encrypted file is not useful to another PTG account, even if copied between Google accounts.

Normal small PTG cloud archive entries retain their existing ~900 KB ciphertext limit. Explicit Drive export accepts up to 145 million encoded ciphertext characters / 150 MB total upload size for multi-photo projects and uses a Drive resumable upload. The local Studio vault still controls its own maximum payload size. Larger projects must continue to use offline export. Drive account storage space and Google API quotas still apply.

**Import is non-destructive to other projects:** it decrypts with the verified PTG account's local vault, checks the Studio/record identity, confirms before replacing a saved local version, and never modifies existing Supabase project rows. MegaFrame can back up a selected named project; MegaFlyer backs up the current locally saved project.

## Existing Google OAuth setup
MegaFrame's existing `google-drive-config.js` already contains the public OAuth Web Client ID `873550026587-clo2e2vrthc8621unnmjio3des0nehfm.apps.googleusercontent.com`. The staged protected launchers reuse this **public ID** so the same user-approved Google OAuth application and Drive account can create backups in both Studios. This is **not** a secret and should not be replaced by a service-account credential.

Before any launch, verify in the owner's Google Cloud Console that:
- Google Drive API is enabled for that existing OAuth project;
- OAuth consent screen and allowed test users or published verification status permit the intended people;
- the OAuth **Web application** client permits JavaScript origin `https://kzamora19.github.io` (an origin, **not a path**);
- the exact `drive.file` scope is configured. Re-consent may be required.

Google account consent must be granted by the user in Google's popup. The connected Google account is not automatically inferred from their PTG identity. Google Drive backups made by the standalone MegaFrame feature use a different, **unencrypted** file format and separate folder; they are not imported or silently reclassified by this integration. MegaFlyer's previous manual export-to-Drive files also remain untouched. A separately reviewed migration flow is necessary for old personal cloud libraries or Drive exports.

## Required release acceptance (still NOT PASSED)
- Same authenticated Google account backs up and retrieves on **two physical devices**, including photo-heavy files, after a fresh PTG login;
- actual Team Leader, Branch Admin, System Admin allowed; ordinary Branch User, disabled, downgraded, logged-out, forced-logout and expired PTG accounts denied;
- wrong PTG account cannot decrypt another user's Drive file and cannot retrieve its metadata in the protected UI;
- Google popup blockers, denied consent, revoked token, 401/403, short network interruption, oversized backup, upload interruption and wrong/corrupt ciphertext fail without deleting local or Supabase projects;
- existing Studio cloud projects, current photo library, print/PDF/PNG, PWAs, live GitHub Pages URLs, source retirement and full rollback rehearsal pass;
- review Google Drive privacy/retention policies and customer photo consent;
- obtain explicit release authorization **after** all four PRs' automated and real-device gates are green.

## No-production-change policy
Do not merge any of the four draft PRs, enable Pages cutover approval variables, deploy protected Studio Edge functions or modify live Supabase project schemas merely because these local mock checks pass. The OAuth popup and Drive API were only simulated in CI. **Hosted Google account and Google Drive access is unverified.**
