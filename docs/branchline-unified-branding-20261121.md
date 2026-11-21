# Branchline unified UI branding contract — integration-only

**Approved November 21, 2026. Development branch only. No independent production release.**

## Palette from the actual Sales Tracker Branchline Workspace source

| Workspace token | Hex | UI use |
|---|---|---|
| `--ink` | `#1d2836` | Deep navy, interface branding |
| `--blue` | `#355ee8` | Royal-blue actions, active highlights |
| `--blue-dark` | `#2348c7` | Hover and darker blue text |
| `--blue-soft` | `#eef2ff` | Selected surfaces and subtle accents |
| `--paper` | `#fff` | Standard light UI surfaces |
| `--line` | `#e9edf1` | Dividers and control borders |

The source of truth is this repository's `styles.css`, not an arbitrary third-party color palette. These same hex values are copied as scoped `--branchline-*` variables into the different apps so a protected, offline-loaded creative editor is not dependent on a public CSS URL.

## Approved module IDs and visible subtitles

| Application | Header or sidebar label |
|---|---|
| Branchline Sales Tracker | BRANCHLINE logo followed immediately by `SALES TRACKER` |
| Branchline Price Tag Generator | BRANCHLINE logo followed immediately by `PRICE TAG GENERATOR` |
| Branchline Data Desk | BRANCHLINE logo followed immediately by `DATA DESK` |
| MegaFrame Studio | `MegaFrame Studio` / `Social Media Photo Frame Generator` |
| MegaFlyer Studio | `MegaFlyer Studio` / `Promotional Flyer & Sale Artwork Generator` |

All module labels use uppercase, bold 10-pixel text, 0.13-em tracking and a small gap beneath the logo. Creative Studio titles and subtitles have a consistent hierarchy and adapt on mobile. Original icons/logos are not replaced or recolored.

## Files changed in the integration pull requests

- Branchline [#45](https://github.com/kzamora19/branchline/pull/45): both Sales Tracker sidebar lockups, scoped CSS, and desktop/mobile app-hub regression tests.
- PTG [#40](https://github.com/kzamora19/first-megasaver-ptg/pull/40): scoped CSS, existing PTG/Data Desk labels verified by static tests. No price-tag editor or printed template modifications.
- MegaFrame [#18](https://github.com/kzamora19/megaframe-studio/pull/18): interface-only inline CSS, unchanged tagline/logo, full mock-protected browser check and PNG export regression.
- MegaFlyer [#10](https://github.com/kzamora19/flyer-studio/pull/10): private build-only title/tagline and CSS, full protected browser check and original PNG/PDF export regression. Public `site/index.html` is intentionally unchanged until coordinated secure source cutover.

## Non-negotiable acceptance and release hold

The visual updates must not change canvas colors, flyer templates, price tag print formats, customer photos, named project privacy, signed PTG access or Supabase RLS. Real authorized TL/Admin, denied ordinary users, private editor delivery, Google OAuth/Drive backups, cross-device retrieval, physical printing, historical public URLs and PWA cache behavior, and rollback still require acceptance.

**No production merges, deployment, hosted database changes or public source cutover were authorized as part of this staging work.**
