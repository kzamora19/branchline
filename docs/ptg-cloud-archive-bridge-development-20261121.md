# PTG-authorized encrypted Studio cloud archive — November 21, 2026

**DEVELOPMENT ONLY — NOT DEPLOYED. This is not approval to merge or cut over production.**

## Goal
Complete the PTG-owner identity bridge between the existing four modules without
creating any additional Supabase project, changing live customer records, granting
`allow-same-origin` to a private Studio iframe, or exposing credentials.

## Scope of the implemented source
- Branchline remains an application hub. PTG supplies the account/role authority
  for MegaFrame and MegaFlyer, with fresh one-use signed P-256 challenges.
- A new RLS-restricted `public.ptg_studio_cloud_backups` table lives in the
  **existing PTG Supabase project**. Ownership is the **verified PTG actor UUID**;
  it is deliberately not compared with either Studio's separate Supabase Auth uid.
- The only way to list, read or write these encrypted backups is a server-only
  route in `ptg-studio-access`. Both Studio delivery functions forward the
  signed proof and strip the privileged PTG actor from their browser response.
- Encrypted snapshots are produced in the **launcher browser** from AES-GCM
  records already held in the PTG-scoped local vault. Decryption keys and
  plaintext customer photos do not reach the archive service.
- Manual buttons are available in both **protected** Studio launchers:
  MegaFrame **Back up selected named project / Retrieve cloud project**;
  MegaFlyer **Back up current project / Retrieve current project**.
- No background synchronization, photo upload, automatic overwrite, migration
  or deletion occurs. A cloud overwrite requires an explicit confirmation;
  SQL compare-and-swap rejects stale revisions.
- Server enforces 30 encrypted records per PTG user per Studio, with an atomic
  per-user/advisory-lock quota on initial insert.
- Each encrypted ciphertext field is currently capped at **1,200,000 base64url
  characters** (roughly 900 KB binary payload). Large/high-resolution photo
  projects must continue to use the existing local export/backup workflow;
  the UI refuses oversized cloud transfers rather than losing data.

## Security and integration acceptance
The staged PTG CI exercises PostgreSQL RLS/no browser privilege, atomic
revision matching and per-user record limits; real local Supabase Auth/PostgREST
and Deno Edge P-256 challenges, replay denial, revocation, role and branch checks,
cross-actor read isolation and cross-Studio separation. Both Studio browser suites
exercise encrypted local export/reimport on full photo payloads, wrong-key
decryption denial, the real launcher cloud buttons and proof rotation using a
fully mocked isolated Edge gateway. The joint Branchline CI checks all four
development branches and denies accidental public-editor release.

These are **not** real production account tests. Existing MegaFrame/Flyer
`auth.uid()`-owned legacy personal-cloud collections are **not migrated** and
remain separate until users have approved a non-destructive export/import
procedure. PTG cloud backup is not a replacement for the legacy cloud template
library, Google Drive OAuth, or full-resolution cross-device image storage.

## What remains before a coordinated public release
1. Owner-approved dedicated real hosted test identities and isolated test data,
   without touching live accounts or creating a paid project.
2. Run real authorized TL, Branch Admin, System Admin and denied ordinary user
   checks, forced logout, account downgrade, and account-to-account cloud isolation.
3. Expand the authenticated large-project transport beyond the present payload
   cap; test actual customer-sized multi-photo and 2-device cloud projects.
4. Validate existing Studio personal-cloud accounts, old user-owned projects,
   Google Drive OAuth/popups in opaque editor context, and real PNG/PDF printing.
5. Verify old installed PWAs, service workers and cached public editor cannot
   bypass the new PTG entitlement gate, while preserving recoverable customer
   projects; capture complete rollback points.
6. Only after these gates pass, coordinate the three Studio Edge deployments and
   three Pages cutovers plus Branchline navigational links, with actual owner
   approval and an all-four-app rollback procedure.

**Do not create a fifth Supabase project or move databases to Vercel.**
