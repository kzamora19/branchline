# Branchline production web updates

This changes only the original Branchline web application (Sales Tracker and app chooser). Manifest ID, start URL, scope, production backend, auth and all four app links are unchanged. It does not update the Windows launcher executable or install another app.

For future approved web releases, run `python3 scripts/prepare-web-release.py <increasing-sequence> "<release label>"` and commit the stamps, manifest and application changes together. Update JS/CSS URLs and service worker cache identity are stamped; the public release manifest is never intentionally cached by the worker. Update checks are same-origin, production-only, and never automatically reload. Explicit save confirmation and a matching new entry stamp are required. A rollback uses a new higher sequence, not a lower one.

This first candidate covers the canonical web hub and Sales Tracker only. PTG, MegaFrame and MegaFlyer still need their own integration and coordinated release mapping. A valid manifest alone does not prove all application assets are coherent or that real device acceptance passed. Never use this web channel to distribute native executables.
