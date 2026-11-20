# MegaFlyer Studio — Branchline integration release gate (2026-11-20)

## Confirmed current architecture

- Branchline **Applications** currently displays all four applications to every signed-in Branchline role, including Product Specialists and inventory-only users.
- The Applications catalog is a navigation directory. It opens external links in a separate browsing context with `noopener noreferrer` and `referrerpolicy="no-referrer"`. It intentionally does **not** pass Branchline passwords, session tokens, or OAuth state to the other apps.
- **MegaFlyer Studio** is the official user-facing product name; its external website remains `https://kzamora19.github.io/flyer-studio/`. It uses the Flyer Studio Supabase project, with private shared assets accessed via an Edge Function that checks a live **PTG session and server-verified role** on every request.
- Allowed Shared Asset Library roles are PTG System Admin, Branch Admin, and legacy Branch User specifically mapped to `TEAM LEADER`; ordinary Branch Users are denied at the gateway.
- The **MegaFlyer editor shell itself is hosted on public GitHub Pages**. A Branchline link, frontend hide/show toggle, or client-side login screen **cannot provide real app-wide access control** against someone using the direct website URL.

## Implementation staged in this branch

- Correct the application card name to **MegaFlyer Studio** and clarify that only the **Shared Asset Library** currently has PTG role enforcement.
- Preserve existing link destinations, authorization flows, app usage, and public layouts.
- Extend the existing Branchline app catalog and desktop/mobile navigation checks to assert the corrected official name.

## Before calling MegaFlyer Studio "Team Leader-only"

1. Agree on the definition of "available": hide the Branchline launcher for unauthorized users **and** restrict direct URL/editor access, or only gate backend/private shared-asset capabilities. These are not the same.
2. Implement a **server-enforced application gate** at a hosting layer capable of checking a verified PTG session/role, or move the protected editor assets behind a secure gateway. GitHub Pages is a public static host and cannot enforce server authorization on the original files.
3. Ensure any account-to-PTG role mapping comes from server-verified PTG identity rather than Branchline role labels, email, URL parameters, or browser storage.
4. Test real active Team Leader, Branch Admin, ordinary Branch User, disabled/revoked account, and account switching, including attempts to open the app directly outside Branchline.
5. Verify Supabase shared-asset permissions, cross-device sync and backup/restore with disposable data; check actual printouts.
6. Keep MegaFrame Studio and the Price Tag Generator's separate auth paths unchanged until an approved shared identity solution is verified.

## Release boundary

This change is **development-only**, documentation and Branchline navigation wording. Do not merge or deploy as an app-wide PTG Team Leader gate. The user's PTG and Supabase production data must remain untouched until explicit coordinated release approval. The existing `https://first-megasaver-ptg.vercel.app/` PTG link also needs independent verification against its now-current GitHub Pages deployment before any URL migration; do not guess its replacement.
