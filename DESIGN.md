# Style Reference
> Ink-on-paper minimalist; a finely printed journal on pristine stock.

**Theme:** light

This design evokes a classic, authoritative editorial feel, grounded in high-contrast typography on a clean white canvas. The system prioritizes crisp lines, clear hierarchy, and restraint over flourish, creating an environment where content takes center stage. Signature elements include tight letter-spacing on headlines, a serif font for primary content, and a sparse accent palette.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Canvas White | `#ffffff` | `--color-canvas-white` | Page background and card surfaces. |
| Printer's Black | `#000000` | `--color-printers-black` | Primary text, headlines, hairline rules at full strength. |
| Sterling Gray | `#6e6e6e` | `--color-sterling-gray` | Secondary text and metadata (meta line, bylines, footer); also the **medium** hairline tone (date-block rules). |
| Zinc Gray | `#d9d9d9` | `--color-zinc-gray` | **Light** hairline rules and dividers (masthead rule, source dividers). |
| Editorial Yellow | `#ffc500` | `--color-editorial-yellow` | Stale-notice accent.|

## Tokens — Typography


### Playfair Display — Primary content: masthead wordmark, date header, headline, source titles, cold-start message. · `--font-serif`
- **Loaded via** `next/font/google` (self-hosted at build, no runtime request) exposing `--font-serif-web`; see `app/layout.tsx`.
- **Stack:** `var(--font-serif-web), Georgia, 'Times New Roman', serif` — Georgia is the pre-swap / fallback face.
- **Weights:** 400, 700 — Playfair Display is a variable font, so 700 is a true bold (no synthesized weight).
- **Sizes:** 13px, 16px, 18px, 20px, 24px, 28px, 32px, 34px, 40px
- **Line height:** 1.00, 1.13, 1.15, 1.20, 1.25, 1.30, 1.38, 1.44, 1.50
- **Letter spacing:** -0.0200em, 0.0100em, 0.0500em, 0.0750em

### Helvetica Neue — UI and short text: dek, meta line, stale notice, SOURCES label, bylines, footer, image credit. · `--font-sans`
- **Stack:** `'Helvetica Neue', Arial, sans-serif`
- **Weights:** 400, 700
- **Sizes:** 13px, 14px, 16px, 24px
- **Line height:** 1.00, 1.13, 1.25, 1.29, 1.38, 1.50
- **Letter spacing:** 0.0100em

### Type Scale

| Role | Size | Line Height | Letter Spacing | Token |
|------|------|-------------|----------------|-------|
| caption | 13px | 1.5 | 0.01px | `--text-caption` |
| body | 16px | 1.5 | 0.01px | `--text-body` |
| subheading | 24px | 1.25 | -0.48px | `--text-subheading` |
| heading | 32px | 1.15 | -0.64px | `--text-heading` |
| display | 40px | 1.13 | -0.8px | `--text-display` |

> **Responsive note.** Several elements step their size up at the `lg` breakpoint (see the Typography Map for each pair) — e.g. the headline is 32px on mobile → 40px (`display`) on desktop, the SOURCES label is 18px → 13px (`caption`). A few sizes are set as **hardcoded px outside the token set** (22px masthead & source title, 19px dek, 18px label, 14px caption-on-mobile); they don't map to a `--text-*` token.

## Tokens — Spacing & Shapes

**Base unit:** 4px · **Density:** compact

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 32 | 32px | `--spacing-32` |
| 40 | 40px | `--spacing-40` |
| 80 | 80px | `--spacing-80` |
| 216 | 216px | `--spacing-216` |

### Border Radius

| Element | Value | Token |
|---------|-------|-------|
| cards | 8px | `--radius-cards` |

### Layout

Responsive, with the `lg` breakpoint as the mobile→desktop switch:

- **Page max-width:** 1296px (outer `<main>`).
- **Reading column:** on mobile, content is a single ~640px column centered in the page; on **desktop (`lg`)** that cap is removed (`max-w-none`) so the lead and sources span the full width.
- **Lead block:** stacked on mobile; on desktop a **2-column grid** — image left / text right (`grid-cols-[3fr_2fr]`, `gap-x-12`).
- **Sources:** single-column list on mobile; **4-column grid** on desktop (`grid-cols-4`).
- **Section gap:** 20px between the major sections.
- **Element gap:** 4px.

## Page Structure (responsive)

The page is a single synthesized story plus its sources. The screenshot is the source of truth for what is visible. Structure only here — fonts/sizes live in the **Typography Map**. Layout is responsive: a single column on mobile, opening into multi-column grids at the `lg` breakpoint (see **Layout**).

Top → bottom:

1. **Masthead** — centered brand wordmark "The News of the Day" in a fixed-height header; hairline rule along the bottom that runs **full-bleed** (edge-to-edge, `-mx-6`) on mobile and tucks back to the column on desktop. (No hamburger/search — there's no navigation.)
2. **Date block** — **medium** hairline rule (Sterling Gray), centered date `<h1>`, medium hairline rule.
3. **Lead image** — bare, **edge-to-edge** image (square, `w-full`), no card / border-radius / padding; bottom-right photo-credit overlay marked **TBD** (no credit field in the data contract yet — kept as a placeholder, not dropped). On desktop it sits in the left column of the lead grid, with the headline/dek/meta stack on the right. The lead image/headline are **not** links (the lead is synthesized from many sources).
4. **Headline.**
5. **Dek.**
6. **Meta line** — reuses the reference's under-dek byline slot. Shows **"Generated at {generatedAt}"**. When `generatedAt` is older than **390 min** (6h cadence + slack), this line also shows the **stale notice** "last updated X minutes ago".
7. **SOURCES** — section heading.
8. **Source list** — each item is the source title linked to its `url`, followed by **"By {outlet}"** with the outlet linked (`target=_blank rel=noopener`). On mobile the items are a single top-border-separated column; on desktop they become a **4-column grid** (Zinc Gray top border + column/row gaps).
9. **Footer** — centered "© {year} The News of the Day".

**Cold-start state:** when `/api/latest` returns no entry, render only a centered serif message "First refresh pending — check back shortly" — no image, no sources.

### Element → data mapping & gaps

The page renders a `NewsEntry` (`{ date, news, sources }`). Gaps are rendered around, not filled with placeholder data.

| Element | `NewsEntry` field | Note |
|---------|-------------------|------|
| Date (2) | `date.date` | ISO string; formatted client-side in the user's TZ |
| Image (3) | `news.imageUrl` | optional — skip block if absent |
| Image credit (3) | — | **TBD** — no field in the contract |
| Headline (4) | `news.headline` | |
| Dek (5) | `news.dek` | |
| Meta line (6) | `news.generatedAt` | "Generated at …" + stale notice |
| Source title / byline (8) | `sources[].title` / `.outlet` / `.url` | byline is **"By {outlet}"** — the contract has no author names |

### Typography

Serif = **Playfair Display** (Georgia fallback); Sans = **Helvetica Neue**. Colors: black `#000`, Sterling Gray `#6e6e6e`, hairlines Zinc Gray `#d9d9d9`. Stale notice uses **Editorial Yellow `#ffc500`**.

Sizes given as `mobile → desktop` step at the `lg` breakpoint.

| Element | Font | Size | Style |
|---------|------|------|-------|
| Masthead wordmark | Playfair Display | 22px | 700, tracking −0.02em, black, centered |
| Date header | Playfair Display | heading (32px) | 700, black, centered |
| Headline | Playfair Display | 32px → 40px (`--text-display`) | 700, tracking −0.8px, lh 1.13, black |
| Dek | Helvetica Neue | 16px → 19px | 400, lh 1.35, black |
| Meta line ("Generated at …") | Helvetica Neue | 14px → 13px (caption) | 400, Sterling Gray |
| Stale notice | Helvetica Neue | 14px → 13px | 700, Editorial Yellow accent |
| Image credit (TBD) | Helvetica Neue | 13px | 400, Sterling Gray, overlay bottom-right |
| SOURCES label | Helvetica Neue | 18px → 13px (caption) | 700, uppercase, tracked, black |
| Source title | Playfair Display | 22px | 700, tracking −0.48px, black; linked |
| Source byline "By {outlet}" | Helvetica Neue | 14px → 13px | 400, Sterling Gray; outlet black, underline-on-hover |
| Footer | Helvetica Neue | 13px (caption) | 400, Sterling Gray, centered |
| Cold-start message | Playfair Display | heading | 400, black, centered |

## Components

### Standard Content Card
**Role:** Generic content container. **Currently unused** — the lead image is now rendered edge-to-edge (`w-full`, no card). The token is kept for reuse should a card surface return.

Background Canvas White (`#ffffff`), 8px border-radius (`--radius-cards`), no box shadow. Internal padding of 16px around content.


## Do's and Don'ts

### Do
- Use Playfair Display (the serif) for the masthead, date, headline, source titles, and cold-start copy to carry the editorial voice.
- Use Printer's Black (`#000000`) on Canvas White (`#ffffff`) for primary text.
- Render the lead image edge-to-edge (`w-full`, square) — no card, radius, or padding around it.
- Maintain tight letter-spacing on headlines (−0.8px at the 40px display size, −0.48px on source titles).
- Use Helvetica Neue for utility/short text (dek, meta, SOURCES label, bylines, footer).
- Use hairlines for structure: Zinc Gray (`#d9d9d9`) for the masthead/source dividers, Sterling Gray (`#6e6e6e`) for the date-block rules.
- Reserve Editorial Yellow (`#ffc500`) for the stale notice only.

### Don't
- Don't introduce color accents beyond Editorial Yellow.
- Don't use box shadows; establish structure through hairlines and spacing.
- Don't make the lead image or headline a link (the lead has no single source URL).
- Don't fabricate data for gaps (image credit, author names) — render around them.

## Quick Start — Tailwind v4

```css
@theme {
  /* Colors */
  --color-canvas-white: #ffffff;
  --color-printers-black: #000000;
  --color-sterling-gray: #6e6e6e;
  --color-zinc-gray: #d9d9d9;
  --color-editorial-yellow: #ffc500;

  /* Typography — Families */
  /* --font-serif-web is registered by next/font/google in app/layout.tsx (Playfair Display). */
  --font-serif: var(--font-serif-web), Georgia, 'Times New Roman', serif;
  --font-sans: 'Helvetica Neue', Arial, sans-serif;

  /* Typography — Scale */
  --text-caption: 13px;     --leading-caption: 1.5;     --tracking-caption: 0.01px;
  --text-body: 16px;        --leading-body: 1.5;        --tracking-body: 0.01px;
  --text-subheading: 24px;  --leading-subheading: 1.25; --tracking-subheading: -0.48px;
  --text-heading: 32px;     --leading-heading: 1.15;    --tracking-heading: -0.64px;
  --text-display: 40px;     --leading-display: 1.13;    --tracking-display: -0.8px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-bold: 700;

  /* Spacing (all retained) */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-80: 80px;
  --spacing-216: 216px;

  /* Layout */
  --page-max-width: 1296px;
  --section-gap: 32px;
  --card-padding: 16px;
  --element-gap: 4px;

  /* Border Radius */
  --radius-cards: 8px;
  --radius-buttons: 0px;
  --radius-navbadges: 50%;
}
```

### Quick Color Reference
- Text: `#000000` (Printer's Black)
- Background: `#ffffff` (Canvas White)
- Secondary text: `#6e6e6e` (Sterling Gray)
- Hairline/divider: `#d9d9d9` (Zinc Gray)
- Stale-notice accent: `#ffc500` (Editorial Yellow)
