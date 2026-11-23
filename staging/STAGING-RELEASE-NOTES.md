# Separate GitHub Pages staging — release candidate

**The current four GitHub Pages repositories are production websites.**
GitHub Pages assigns one hosted site per repository; deploying any of the four existing development branches to its current Pages site can replace a live application. Never do this to stage.

## Approved scope

- Branchline Official Navigation PR #54, including the approved icon assets and System Admin-only Data Desk in PTG.
- PTG PR #51 — staging Supabase project \`rlfdvmiqkbitetatxkju\`.
- MegaFrame PR #38 — public launcher only. Private editor must remain on protected backend.
- MegaFlyer PR #22 — public launcher only. Private editor must remain on protected backend.
- The existing Windows preview PR #49 remains unsigned and *does not* upgrade installed apps.

## Gate 1: candidate artifact, no Pages deployment

The \`.github/workflows/staging-pages-candidate.yml\` workflow builds a disposable four-app candidate in GitHub Actions. It writes a manifest/checksums and uploads a review artifact; it neither calls \`deploy-pages\` nor pushes to any \`gh-pages\` branch. The candidate rewrites the known Sales Tracker Supabase connection to staging, and both public Studio launcher endpoints to the isolated staging backend.

**This artifact is not yet a hosted test build.** It still contains absolute production-origin navigation/Next.js base paths in the source apps; do not upload it verbatim to a public site.

## Gate 2: isolated GitHub Pages staging origin — currently BLOCKED

A new dedicated repository such as \`kzamora19/branchline-unified-staging\` and its independent GitHub Pages site must exist. Only the user or a GitHub connection that supports creating repositories can perform this action. Current GitHub tools have no create-repository action, and the connected account currently exposes only \`branchline\`, \`first-megasaver-ptg\`, \`megaframe-studio\`, \`flyer-studio\`.

Once the dedicated repo exists:
1. Rebuild Next.js under \`/branchline-unified-staging/first-megasaver-ptg\`, with matching \`NEXT_PUBLIC_BASE_PATH\` and staging-only backend.
2. Rewrite branchline and editor-free Studio links to \`https://kzamora19.github.io/branchline-unified-staging/...\` in a *staging-only build*, not in shared production app source. Prove no link silently falls back to production.
3. Bind authorized Studio origin/path to the staging PTG access Edge Function and verify one-use ticket, role, revoke/expiry, CSP, sandbox, no private editor in Pages.
4. Deploy only to the new repo's Pages URL, with no production \`gh-pages\` branch changes.
5. Test real-role login/logout, desktop/mobile mutual exclusion, import limits, encrypted backups and native printing with test data before any production rollout.

## Gate 3: installers

Only after hosted staging acceptance, compile a *separate* signed/approved Windows pilot/upgrader; verify the installed Nov 10 app, WebView2 profile migration and rollback. The unsigned isolated preview from PTG PR #49 is not a production updater. PWA service-worker data migrations and recovery require real-device testing.

**Production databases and currently published GitHub Pages sites must remain unchanged until explicit release approval.**
