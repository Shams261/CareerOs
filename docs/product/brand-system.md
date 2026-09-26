# Silsila brand system

Silsila is the product name for the existing CareerOS application. The promise is **Plan once. Show up daily.** The supporting line is **Keep the chain going.** Use these at brand moments; keep operational screens specific and factual.

## Identity and typography

**Artwork replacement is pending the original SVG package.** The supplied PDFs contain flattened JPEG images, not vector paths. They have not been raster-traced or passed off as SVG artwork. The previous Cormorant wordmark recreation has been removed. `BrandLogo` currently uses a clearly documented, neutral Inter text fallback with the provisional ring mark; it is not the final supplied lockup.

Place authoritative horizontal, stacked, mark-only and monochrome assets in `public/brand` when supplied; see the [asset handoff](../../public/brand/README.md). Horizontal lockup height should be 30–34px desktop and 26–30px mobile, with clear space of half the mark height where possible. Do not stretch, rotate, redraw, add shadows/gradients or substitute a font for the supplied wordmark.

Inter is used for product UI. Cormorant Garamond semibold appears only in the login hook and Weekly Review heading. [Font configuration](../../src/lib/fonts.ts) uses local WOFF2 files (about 70 KB total), swap rendering and bundled SIL licenses. No runtime font-provider request is required.

## Token layer

[design-tokens.css](../../src/app/design-tokens.css) is the runtime source of truth, with a matching [JSON handoff](../../src/assets/design-tokens.json). Keep both in sync. [globals.css](../../src/app/globals.css) consumes semantic variables; compatibility aliases keep existing components on the same token layer.

| Role           | Light     | Dark      |
| -------------- | --------- | --------- |
| Canvas         | `#F6F3EC` | `#14130F` |
| Surface        | `#FCFAF5` | `#1C1B17` |
| Muted surface  | `#ECE7DD` | `#24221D` |
| Text           | `#1B1A16` | `#F3EFE6` |
| Accent/action  | `#1E6B5B` | `#4FB59F` |
| Secondary text | `#6A655D` | `#BEB7AA` |
| Border         | `#D9D3C7` | `#35322C` |

Tokens also cover elevated surfaces, borders, interaction states, focus, typography, radii, spacing, shadows, layout widths and motion. Light is always the default, independent of OS/browser appearance. Settings offers Light and Dark, saved per browser in the `silsila-theme` cookie for one year. The server renders the root class and theme-color from that cookie, including login, without a hydration-time theme switch. Missing or invalid cookies resolve to Light; System is not offered. Native controls use the selected color-scheme. The manifest and favicon default to Light. Teal is reserved for actions, selection and meaningful emphasis; calendar blocks remain neutral.

Semantic base colors match the specification. On light tinted backgrounds, success, warning and info need darker text variants (`#2E7053`, `#80530F`, `#496979`) to meet 4.5:1; the base tokens remain unchanged. Dark primary actions use ink text. Status labels accompany colors. Focus remains visible, controls retain their minimum heights, and motion respects reduced-motion preferences.

## Copy and component rules

The philosophy is **Plan → Execute → Record → Review → Continue**. Product vocabulary stays Today, Calendar, DSA, Learn, Jobs, Review and Settings. Use factual, calm copy rather than productivity scores, streak pressure or hype.

Login uses the primary hook, descriptor, **Continue with Google** and the mantra. The authenticated shell has no tagline or repeated mantra. Today separates current and next blocks; Weekly Review allows a restrained editorial heading. No landing page or new product feature is added.

## Assets and maintenance

The existing icon generator now uses the final palette, but its hand-drawn mark remains provisional until the authoritative artwork arrives. Do not treat these icons as approved final logo assets. Then replace the generator's geometry with exports from the supplied mark and regenerate 192px, 512px, maskable 512px, Apple 180px and fallback favicon assets. Preserve the maskable safe area. The manifest and browser theme colors use the final palette.

## Compatibility boundary

This is a presentation change, with no schema migration or workflow replacement. Keep legacy technical identifiers (`careeros` package/database names, session/OAuth cookies, export schema and filenames, and Google event ownership keys/IDs) stable. Existing Google calendars are reused by ID and retain their recorded name; only newly created dedicated calendars are named Silsila. Existing notification history is not rewritten. Historical WI documentation describes the name used at the time.

## Acceptance and validation

As the owner, I want a consistent, calm identity across planning, execution and review so that the product feels coherent while my existing data and workflows continue to work.

Local verification on 2026-09-26: lint, TypeScript, production build and all 199 tests across 25 files passed using disposable PostgreSQL. Desktop and 390px viewport screenshots were inspected for Login, Today, Calendar, DSA, Learn, Jobs, Review and Settings in the browser's dark theme. Authenticated pages had equal document content/client widths (375px plus the viewport scrollbar); navigation scrolls within its own container. Fake-provider sign-out/sign-in passed; no browser errors were reported. Real Google Calendar/push delivery was not part of this visual pass.

Calculated contrast: light primary text/canvas 15.71:1, secondary text/surface 5.54:1, action text/teal 6.24:1; dark equivalents 16.20:1, 8.65:1 and 7.47:1. Semantic text variants address the sub-4.5:1 supplied light combinations. These are token checks, not a claim of a complete WCAG audit. A full light-theme browser and assistive-technology audit remains a release check.

Remaining visual debt: original SVG lockups/mark/monochrome asset integration and icon exports from that artwork. No authentic SVGs are fabricated from the PDFs.

## Light-default theme follow-up

Theme behavior is now independent of OS appearance. The server resolves the saved cookie before rendering HTML and viewport metadata, so no client-side theme detection or hydration correction is required. Login uses the same saved preference and defaults to Light when none exists. The brand palette is unchanged.

Verification: all 205 tests in 26 files, lint, typecheck and build passed. Chrome confirmed Light on initial Settings, explicit Dark after saving and reloading, Light after switching back and reloading, matching color-scheme/theme-color values, and Light login after sign-out. Full OS Light/Dark matrix, Firefox and Safari/WebKit acceptance remain unverified; Safari control was interrupted. No cross-browser pass is claimed.
