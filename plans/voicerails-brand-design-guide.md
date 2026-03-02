# VoiceRails Brand Design Guide

**Version:** 1.2  
**Status:** Authoritative implementation guide  
**Audience:** Product design, engineering, marketing, documentation, partner teams  
**Scope:** Defines the full VoiceRails brand system so another application can reproduce the same visual and verbal identity without external input.

---

## 1) Brand Positioning

### Brand promise
VoiceRails is the infrastructure layer for production voice AI: technically deep, operationally reliable, and fast to ship.

### Personality model
- **Precise:** Every interface element should look deliberate and engineered.
- **Confident:** Premium without overstatement; calm authority over hype.
- **Fast:** Layout, rhythm, and copy all communicate speed-to-value.
- **Developer-native:** Feels built by and for builders.

### What the brand should feel like
- Dark-mode native enterprise tooling
- Clean information hierarchy
- Modern, high-signal interfaces with restrained accent usage

### What to avoid
- Consumer-social gradients and playful visual noise
- Heavy neumorphism/shadows
- Overly bright, saturated multi-color themes
- Generic "AI startup" visual clichés

---

## 2) Identity System

### Wordmark and naming
- Canonical name: `VoiceRails`
- Product text treatment in UI: `voice` + accent `rails`
- Sentence usage: "VoiceRails" (capitalized)

### Logo usage intent
- Mark should read as technical signal + structured rails
- Prioritize clarity at small sizes (favicon, nav icon, CLI contexts)
- Primary lockup should be horizontal for website/app headers

### Clear-space and sizing rules
- Minimum clear-space around logo: `0.5x` logo height on all sides
- Minimum digital size (icon only): `16px`
- Recommended nav icon size: `28px` to `36px`
- Homepage header treatment: use the larger logo scale for stronger brand presence

### Logo architecture and lockups
- **Symbol mark:** standalone waveform/rails icon for compact and app-icon contexts.
- **Wordmark:** `voice` + accent `rails`; used when horizontal space allows brand readability.
- **Primary lockup:** symbol + wordmark horizontally aligned; preferred for website/app headers.
- **Icon lockup:** symbol only; preferred for favicon, app icons, and constrained UI.

### Approved logo assets (current repository)

| Asset | Path | Typical usage |
|---|---|---|
| Primary symbol (dark field) | `public/VoiceRails 1000x1000.png` | Social previews, presentations, dark backgrounds |
| Transparent symbol | `public/VoiceRails 1000x1000 no background.png` | Product UIs and partner contexts with controlled backgrounds |
| Compact UI icon | `public/logo-64.png` | Navigation bars, utility controls, compact UI placements |

### Clear-space and minimum-size matrix

Let `x = total symbol height`.

| Context | Minimum size | Clear space |
|---|---|---|
| Symbol-only digital UI | `16px` | `0.5x` all sides |
| Symbol-only with visible gradient detail | `24px` | `0.5x` all sides |
| Header symbol (recommended) | `28px` to `36px` | `0.5x` all sides |
| Horizontal lockup | `120px` width | `0.5x` all sides |
| Social avatar | `500x500` export | `0.5x` all sides |

### Color and contrast rules for logo
- On dark surfaces, use the primary teal gradient mark.
- On light surfaces, use transparent/isolated mark and ensure strong contrast against the background.
- Do not recolor the logo to non-brand hues.
- Do not apply external shadows, strokes, glow effects, or opacity reductions that weaken legibility.

### Incorrect usage (never)
- Stretch, squash, rotate, skew, or crop the logo.
- Replace brand gradient with unrelated gradients.
- Place on busy imagery without a protective container.
- Use low-contrast combinations that fail readability at glance distance.
- Add outlines, drop shadows, or decorative effects not defined in this guide.

### Production export requirements
- Preferred master format: SVG for all vector-capable surfaces.
- Raster exports: PNG at `1x`, `2x`, and `4x` density.
- Preserve transparent background versions for multi-surface compatibility.

---

## 3) Color Architecture

Use semantic variables. Do not hardcode color in components unless rendering a one-off data visualization.

### Core tokens (authoritative, dark default)

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#07080A` | Global canvas background |
| `--bg-elevated` | `#0D0F12` | Elevated sections/nav/footer |
| `--bg-card` | `#111318` | Card and panel background |
| `--bg-card-hover` | `#161921` | Hover surface state |
| `--border` | `#1E2028` | Structural borders/dividers |
| `--border-bright` | `#2A2D38` | Active/hover border emphasis |
| `--text-primary` | `#E8E9ED` | Headings and key text |
| `--text-secondary` | `#8B8D98` | Body text |
| `--text-muted` | `#5C5E6A` | Metadata and tertiary text |
| `--accent` | `#22D3A7` | Primary brand/action color |
| `--accent-dim` | `#1AAF8B` | Accent fallback/variant |
| `--accent-glow` | `rgba(34, 211, 167, 0.12)` | Subtle glow backgrounds |
| `--accent-glow-strong` | `rgba(34, 211, 167, 0.25)` | Strong emphasis glow |
| `--accent-muted` | `rgba(34, 211, 167, 0.5)` | Numeric/status accents |
| `--blue` | `#3B82F6` | Provider/system support |
| `--pink` | `#EC4899` | Provider/system support |
| `--orange` | `#F59E0B` | Provider/system support |

### Color behavior
- Accent is intentional, not ambient. Reserve for CTA, active states, key highlights.
- Most surfaces should remain in neutral dark tokens.
- Support colors (`--blue`, `--pink`, `--orange`) are contextual and should not dominate global theming.

### Theme mode policy
- **Default mode:** Dark mode is the canonical VoiceRails expression and must be the initial experience.
- **Optional mode:** Light mode must be available as an explicit user preference.
- **Persistence:** Store and reapply user preference on return visits.
- **Parity:** Light mode changes color tokens only; spacing, typography, hierarchy, and motion stay identical.

### Light mode token overrides

| Token | Light value |
|---|---|
| `--bg` | `#F7F9FC` |
| `--bg-elevated` | `#FFFFFF` |
| `--bg-card` | `#FFFFFF` |
| `--bg-card-hover` | `#F2F5FA` |
| `--border` | `#D9E1EC` |
| `--border-bright` | `#BCC9DA` |
| `--text-primary` | `#0F172A` |
| `--text-secondary` | `#334155` |
| `--text-muted` | `#64748B` |
| `--accent` | `#0F9F7A` |
| `--accent-dim` | `#0C8767` |

### Dual-theme token matrix (reference)

| Token | Dark (default) | Light (optional) |
|---|---|---|
| `--bg` | `#07080A` | `#F7F9FC` |
| `--bg-elevated` | `#0D0F12` | `#FFFFFF` |
| `--bg-card` | `#111318` | `#FFFFFF` |
| `--bg-card-hover` | `#161921` | `#F2F5FA` |
| `--border` | `#1E2028` | `#D9E1EC` |
| `--border-bright` | `#2A2D38` | `#BCC9DA` |
| `--text-primary` | `#E8E9ED` | `#0F172A` |
| `--text-secondary` | `#8B8D98` | `#334155` |
| `--text-muted` | `#5C5E6A` | `#64748B` |
| `--accent` | `#22D3A7` | `#0F9F7A` |
| `--accent-dim` | `#1AAF8B` | `#0C8767` |
| `--blue` | `#3B82F6` | `#3B82F6` |
| `--pink` | `#EC4899` | `#EC4899` |
| `--orange` | `#F59E0B` | `#F59E0B` |

---

## 4) Typography System

### Font stack (required)

The VoiceRails brand uses exactly three typefaces. No substitutions are permitted on production surfaces.

| Role | Typeface | CSS Variable | Source |
|---|---|---|---|
| Body / UI | DM Sans | `--font-body` | Google Fonts |
| Display / Narrative | Instrument Serif | `--font-display` | Google Fonts |
| Code / System | JetBrains Mono | `--font-mono` | Google Fonts |

### Font specifications

#### Instrument Serif (`--font-display`)
- **Weights loaded:** 400 (Regular)
- **Styles loaded:** Normal, Italic
- **Fallback stack:** Georgia, serif
- **Purpose:** Headlines, hero text, page titles, section titles, and key narrative moments that need premium editorial weight.
- **Restrictions:** Never use for body copy, form labels, navigation items, button text, or dense UI components. Instrument Serif is a display-only face — it loses legibility and brand impact when used at small sizes or for running text.

#### DM Sans (`--font-body`)
- **Weights loaded:** 300 (Light), 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold)
- **Styles loaded:** Normal
- **Fallback stack:** -apple-system, sans-serif
- **Purpose:** Primary interface typeface. All body copy, navigation links, button labels, card descriptions, form inputs, metadata, and marketing prose.
- **Weight usage:**
  - 300 — reserved; use sparingly for decorative large text only
  - 400 — default body text, descriptions, paragraphs
  - 500 — subtle emphasis within body text, secondary headings
  - 600 — navigation items, UI labels, card headings, button text
  - 700 — strong emphasis, rare; never default

#### JetBrains Mono (`--font-mono`)
- **Weights loaded:** 400 (Regular), 500 (Medium), 600 (SemiBold)
- **Styles loaded:** Normal
- **Fallback stack:** monospace
- **Purpose:** Code blocks, inline code, terminal output, CLI commands, badges, status labels, diagnostic text, system metadata, and the brandmark wordmark.
- **Weight usage:**
  - 400 — code block bodies, inline code, terminal output
  - 500 — labels, badges, section metadata tags
  - 600 — brandmark wordmark (`voice` + `rails` in the header)

### Font loading

All fonts are loaded via `next/font/google` for automatic subsetting, self-hosting, and zero layout shift. Fonts are applied to `<body>` as CSS custom property classes.

```tsx
import { DM_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";

const body = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body"
});

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-display"
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono"
});
```

### Typographic hierarchy (type scale)

| Level | Typeface | Size | Line-height | Letter-spacing | Weight |
|---|---|---|---|---|---|
| Hero H1 | Display | `clamp(52px, 7vw, 88px)` | 1.05 | -0.025em | 400 |
| Page H1 | Display | `clamp(40px, 5vw, 64px)` | 1.08 | -0.02em | 400 |
| Section H2 | Display | `clamp(36px, 4vw, 52px)` | 1.1 | -0.02em | 400 |
| Card H3 | Body | `16px` | 1.4 | normal | 600 |
| Body large | Body | `17-18px` | 1.7 | normal | 400 |
| Body regular | Body | `14-16px` | 1.65 | normal | 400 |
| Code / Mono | Mono | `13-14px` | 1.65 | normal | 400 |
| Label / Meta | Mono | `11-12px` | 1.4 | 0.08em (uppercase) | 500 |

### Rendering standards
- Apply `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale` globally.
- Never allow visible FOIT (Flash of Invisible Text) or FOUT (Flash of Unstyled Text) on production surfaces. The `next/font` loading strategy prevents this when configured correctly.

### Usage rules
- Display serif is for strategic narrative emphasis — never for dense UI controls.
- Mono is for code, commands, metrics, status labels, and technical metadata.
- Keep letter spacing tight (-0.02em to -0.03em) on major display headlines for premium tone.
- Never set body text below `14px` — this is a non-negotiable accessibility floor.
- Never use font weights outside the loaded range (e.g. no Black/ExtraBold for DM Sans).
- Never substitute brand fonts with system defaults on any production surface.
- Never use decorative, handwritten, or novelty fonts anywhere in the brand system.

---

## 5) Layout and Spacing Rhythm

### Global frame
- Max content width: `1200px`
- Horizontal gutters: `40px` desktop, `20px` mobile
- Section spacing: `120px` desktop, `80px` mobile
- Header height: `64px` fixed

### Component spacing standards
- Card padding: `36px`
- Button padding: `14px 28px`
- Compact button: `10px 18px`
- Grid gaps: `12px-24px` by density

### Radius and border language
- Radius scale: `6px`, `8px`, `10px`, `12px`
- Borders are subtle and low-contrast; avoid hard outlines unless in focus/error states

---

## 6) Motion and Interaction

### Motion profile
- Duration: `0.2s-0.3s` for most interactive transitions
- Easing: default CSS ease for lightweight motion
- Hover motion: `translateY(-1px to -2px)` max for cards/buttons

### Animation philosophy
- Motion signals responsiveness, not decoration.
- Entry animation (fade-up) can be used on hero and key above-the-fold sequences.
- Avoid long chained animations in dense product flows.

---

## 7) Component Design Rules

### Navigation
- Fixed translucent header with backdrop blur
- Brandmark left, nav center/right, single strong CTA
- Home route can use enlarged brandmark/icon to reinforce identity
- In light mode, header transparency should remain but use light canvas tinting

### Buttons
- Primary: accent fill + dark text
- Secondary: transparent + bright border
- Preserve consistent corner radius and font sizing
- Keep primary button contrast AA-compliant in both dark and light modes

### Cards and modules
- `--bg-card` background with `--border`
- Hover state uses `--bg-card-hover` and brighter border
- No heavy box shadows; depth is created via color stepping
- Do not change component spacing/type scale between themes

### Code blocks
- Terminal-inspired header with three utility dots
- Monospace body
- Syntax accenting uses tokenized support colors

### Footer
- Elevated surface with top border
- Structured columns for Product, Developers, Company
- Include explicit link to Brand Design Reference page

---

## 8) Voice and Copy Guidelines

### Tone attributes
- Clear, concise, technical
- Confident but not aggressive
- Outcome-oriented ("ship", "deploy", "production-ready")

### Messaging pattern
- Lead with value in one sentence
- Follow with implementation or operational detail
- Prefer direct verbs and concrete nouns

### Avoid
- Buzzword-heavy prose
- Vague superlatives without proof
- Casual slang that weakens enterprise trust

---

## 9) Accessibility Standards (Non-Negotiable)

- Target WCAG 2.2 AA minimum contrast for text and key controls
- Preserve keyboard focus visibility on all interactive controls
- Use semantic HTML landmarks and heading hierarchy
- Keep body text readable (`>=14px`), with adequate line-height
- Avoid conveying status by color alone; pair with text/labels

---

## 10) Cross-Product Implementation Contract

Any app claiming "VoiceRails brand-compliant" must implement all of the following:

1. The color token set in Section 3, mapped to CSS variables or design tokens
2. The typography stack in Section 4
3. The spacing rhythm and radius language in Section 5
4. The interaction and motion envelope in Section 6
5. The component behavior model in Section 7
6. The copy tone in Section 8
7. Accessibility requirements in Section 9
8. Dark-default + light-optional behavior from Section 3
9. User theme preference persistence across sessions
10. Logo lockup, clear-space, and misuse standards from Section 2

### Starter token block

```css
:root {
  --bg: #07080A;
  --bg-elevated: #0D0F12;
  --bg-card: #111318;
  --border: #1E2028;
  --text-primary: #E8E9ED;
  --text-secondary: #8B8D98;
  --text-muted: #5C5E6A;
  --accent: #22D3A7;
}

html[data-theme="light"] {
  --bg: #F7F9FC;
  --bg-elevated: #FFFFFF;
  --bg-card: #FFFFFF;
  --border: #D9E1EC;
  --text-primary: #0F172A;
  --text-secondary: #334155;
  --accent: #0F9F7A;
}
```

---

## 11) Governance

- This document is the source of truth for brand implementation.
- The `/brand` website route is the operational reference surface for product teams.
- Any design change affecting tokens, hierarchy, or interaction should update:
  1) this guide, and 2) the brand reference page.

---

## 12) Quality Checklist Before Launch

- Brandmark and wordmark render correctly across desktop/mobile
- Logo clear-space and minimum-size rules are respected across all placements
- No incorrect logo treatments (distortion, recolor, shadows, low-contrast)
- Accent color used intentionally (not over-applied)
- Typography hierarchy matches the VoiceRails system
- Cards/buttons/headers follow tokenized surfaces and borders
- Footer includes brand reference discovery link
- Contrast and keyboard navigation pass accessibility review

---

**End of guide.**
