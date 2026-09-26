# Silsila artwork handoff — pending source assets

The current reference PDFs contain flattened JPEGs. Original SVG assets are required; do not trace screenshots, wrap bitmaps in SVG or recreate the supplied wordmark with a font.

Expected authoritative files:

- `silsila-horizontal-light.svg` and `silsila-horizontal-dark.svg`
- `silsila-stacked-light.svg` and `silsila-stacked-dark.svg`
- `silsila-mark-light.svg` and `silsila-mark-dark.svg`
- `silsila-monochrome-light.svg` (for the primary teal background)

Once supplied, wire them into `src/components/brand.tsx`, allow only the required public brand assets through the login gate, and export favicon/PWA/Apple icons from the mark. Preserve aspect ratio and half-mark-height clear space. The current Inter name and procedural rings are explicitly provisional.
