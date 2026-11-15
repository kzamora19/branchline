# Branchline Unified Invitations / One-Login Integration

## Implementation boundary (2026-11-15)

**Completed in this change:** central Sales Tracker–owned invitation DRAFT schema, RLS policies,
new-user position-to-app grant validation, and Data Desk admin menu (in the PTG workspace repo).
The database record is a *proposal*; it does not send an invitation or provision an account.

**Not yet enabled:** delivery of a unified invitation, shared OAuth/OIDC sign-in, automatic PTG
profile provision, account disable/force-logout propagation across both projects, and legacy
account reconciliation. Existing PTG and Sales Tracker accounts must not be modified.

## Why the identity provider must be shared

Sales Tracker and PTG use distinct Supabase Auth projects. Creating two users with the same
password does not create one identity. A compatible design is:

1. Sales Tracker Supabase Auth is the **canonical Branchline identity provider**.
2. Enable its Supabase OAuth 2.1 / OpenID Connect server, with authorization-code + PKCE.
3. Configure PTG Supabase Auth as an OIDC client of that provider, using an enabled
   `custom:branchline` identity provider. Configure credentials in Supabase Auth settings;
   never in a GitHub file, localStorage, or a browser-side environment variable.
4. The user accepts **one** Sales Tracker invitation, sets one password, and signs in with
   the canonical account. PTG obtains a provider-verified session without a second password.
5. Assign app grants based on **server-side** verified central user identity, role, and branch;
   user-editable metadata, email alone, and unverified redirect parameters are not sufficient.
6. Provision PTG role/profile *only after acceptance* through a protected, idempotent server
   worker. Cross-project writes cannot be one database transaction: use an outbox with retry,
   correlation ID, and audit log, and leave PTG access denied until both sides confirm.
7. On disable/forced logout, block both APIs at their server-side app authorization layer and
   revoke active sessions. Do not assume OAuth logout or JWT expiration immediately
   invalidates all existing access tokens. No existing accounts are migrated in this phase.

## Required configuration (not automatically available through current connector tools)

- Sales Tracker project: enable OAuth 2.1 Server and create the PTG OAuth client.
- PTG project: create and enable the custom OIDC provider, using the Sales Tracker issuer URL,
  client ID and secret from Supabase Dashboard.
- Register precisely the provider callback URL supplied by the PTG Auth custom-provider setup.
  Add the approved Branchline Workspace redirect URL in PTG Auth redirect allowlist.
- Require HTTPS, state, nonce, PKCE, refresh-token rotation, aud/iss verification.
- Test provider sign-in and profile linking in a test environment before enabling production SSO.

Docs:
- https://supabase.com/docs/guides/auth/oauth-server
- https://supabase.com/docs/guides/auth/custom-oauth-providers

## Unified invitation draft semantics

- Draft fields: verified new-user email, login ID, position, Sales Tracker role,
  Sales branch ID, Product Specialist brand/code where applicable, PTG role proposal.
- Team Leader and Branch Manager may be assigned appropriate PTG roles; PS and
  inventory-only roles cannot. District Manager PTG access is withheld until
  a multi-branch PTG permission model is reviewed.
- All drafts are DRAFT only. DRAFT -> SENT/ACCEPTED is intentionally unavailable.
- RLS requires an active Sales Tracker administrator in the same dealer; cross-dealer
  drafts are inaccessible. PTG Data Desk additionally requires System Admin access.
- Reject duplicates against active Sales Tracker profiles and saved drafts.
  New accounts must be checked against PTG users during the later activation phase.
- No plaintext passwords, invitation tokens, or Supabase service-role keys are stored
  in draft rows or client-side code.

## Release gate for production invitations and SSO

1. Sales OAuth server and PTG OIDC client configured and provider exchange verified.
2. A new invited user receives one single-use invite, accepts and sets a single password.
3. Sales Tracker recognizes the central user; PTG recognizes only server-approved PTG grants.
4. A PS without a PTG grant is denied even if they navigate directly to PTG endpoints.
5. Opening either app after signing in to the other requires no second password.
6. Disable, logout, role change, expiry, invite replay, and forced logout revoke both services.
7. No pre-existing user record was relinked, modified, or duplicated.
8. All operations and cross-project provisioning failures have an audit trail.

**Never present draft creation as an invitation being sent or an account being created.**
