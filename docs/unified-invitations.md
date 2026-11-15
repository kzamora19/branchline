# Unified Invitations and Shared Branchline Sign-in (design, not live)

## Scope
- One invitation and credential flow for **new** Branchline identities.
- Shared login for Sales Tracker and First Megasaver PTG, with independent app entitlements and branch restrictions.
- Do not migrate, delete, merge, or relink existing accounts yet.

## Data Desk administrative menu
Add **Unified Invitations** to the authenticated Data Desk admin navigation after its local source code is supplied.
Data Desk currently runs as a separate local extractor. It is not itself a trusted identity server.
Its menu should call a secured Branchline identity service and never embed an API service-role key.

The menu shall show: employee name/email, branch, organizational role, PTG access, Sales Tracker access, invitation state, sent/expires/accepted dates, resend, revoke, force sign-out and audit history.

## Shared identity
Use one canonical identity provider (Supabase Auth with standard authorization-code/PKCE flow).
Do **not** pass plaintext passwords between applications, copy localStorage tokens between unrelated origins, or mint unsigned shared session tokens.
Both apps validate the same central identity through verified JWT/broker exchange, then apply their own role and branch authorizations.
Where the app is opened on another origin, use a verified redirect-based authorization flow, not cross-site cookie assumptions.

The application grants are distinct:
- Sales Tracker: PS, manager, district_manager, admin, inventory roles subject to business rules.
- PTG: Team Leader and above where permitted by policy; Branch User has no PTG access.
- Restricted subdealer prices: separately manager-level entitlement, never controlled solely by a UI checkbox.

## Invite & activation
- Admin creates an invitation for a new employee, selecting apps/branches/role.
- Send a one-time, short-expiry acceptance URL; employee sets one password during activation.
- Invitation does not contain a reusable plaintext password.
- Acceptance provisions app-specific profiles and access records transactionally.
- Sign in once to the Branchline workspace; accessing either app should not prompt for another password.
- Logout/revocation/disable/branch-off checks must invalidate both apps consistently.
- Resend makes the prior token invalid; every action is audited.

## Existing users
Out of scope until a separately reviewed reconciliation phase.
Avoid matching existing people solely by email or barcode/login name; require verified identity mapping and collision review.

## Validation before release
1. New invite, email receipt, acceptance and password setup.
2. Sign in to Sales Tracker and open PTG without second password; reverse order as appropriate.
3. Branch/role grants, prohibited PTG user, denied subdealer prices and ungranted app access.
4. Sign-out, admin force logout, disable, expired invite, replayed token and password reset invalidate both apps.
5. No legacy account is modified.
6. Data Desk menu must be role-gated server-side, not solely hidden in the client.

**Status:** Design recorded only. The local Data Desk source, common IdP/broker and cross-app provisioning have not been implemented or deployed.
