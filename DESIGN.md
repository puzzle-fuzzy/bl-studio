---
name: "Bailian Studio"
description: "A restrained dark studio for project-based short-drama visual assets."
colors:
  accent_primary: "#e46b78"
  accent_light: "#d95567"
  accent_hover: "#f0818c"
  bg_dark: "#0b0b0b"
  canvas_dark: "#111211"
  surface_dark: "#191b19"
  surface_raised_dark: "#202420"
  surface_strong_dark: "#2b302b"
  fg_dark: "#f1f1f1"
  muted_dark: "#a6aaa3"
  bg_light: "#f7f7f5"
  canvas_light: "#f0efeb"
  surface_light: "#fffdfa"
  fg_light: "#20231f"
  muted_light: "#70776f"
  point_lilac: "#d8b7e4"
  point_coral: "#d98d97"
  border_dark: "#ffffff1f"
  border_light: "#20231f1f"
typography:
  display:
    fontFamily: "PingFang SC, -apple-system, BlinkMacSystemFont, Segoe UI, Microsoft YaHei, sans-serif"
    fontSize: "2rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "PingFang SC, -apple-system, BlinkMacSystemFont, Segoe UI, Microsoft YaHei, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "PingFang SC, -apple-system, BlinkMacSystemFont, Segoe UI, Microsoft YaHei, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "PingFang SC, -apple-system, BlinkMacSystemFont, Segoe UI, Microsoft YaHei, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "PingFang SC, -apple-system, BlinkMacSystemFont, Segoe UI, Microsoft YaHei, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.35
rounded:
  sm: "6px"
  control: "8px"
  md: "10px"
  panel: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  sidebar_collapsed: "72px"
  sidebar_expanded: "256px"
components:
  button_primary:
    backgroundColor: "{colors.accent_primary}"
    textColor: "{colors.fg_dark}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button_ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted_dark}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  search_field:
    backgroundColor: "{colors.surface_dark}"
    textColor: "{colors.fg_dark}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  asset_tile:
    backgroundColor: "{colors.surface_dark}"
    textColor: "{colors.fg_dark}"
    rounded: "{rounded.md}"
    padding: "8px"
---

# Design System: Bailian Studio

## 1. Overview

**Creative North Star: "安静的数字片场"**

Bailian Studio is a product interface for creators who need to generate, approve, reuse, and trace visual assets for short-drama projects. The physical scene is a creator working at a large monitor in a quiet production room, comparing several character references and scene variations while keeping a project brief open nearby. The interface must make that comparison fast and calm.

The system is content-first and information-dense without becoming an administration console. Deep graphite surfaces provide a neutral viewing environment for image and video thumbnails. Warm, restrained coral is reserved for the current selection, primary actions, and important states. A low-opacity point field sits persistently in the top-right of the authenticated content shell, giving every working page the same quiet studio atmosphere without competing with media, metadata, or controls.

The visual language borrows Krea's task-oriented navigation and asset-first workspace, then adds a project and version discipline specific to short-drama production. It rejects a traditional backend, pure-black cyberpunk, decorative AI-tool chrome, glass-heavy surfaces, and SaaS layouts that leave too much empty space around the actual work.

**Key Characteristics:**

- Content-first media grids with visible version and status context.
- Graphite tonal layers rather than pure black or neon contrast.
- One restrained coral accent, used for action and selection rather than decoration.
- Compact two-level navigation with project context always available.
- Quiet, deterministic point-field atmosphere as progressive enhancement only.

## 2. Colors

The palette is restrained: a graphite studio base, warm neutral text, and one muted coral voice. Light mode is supported as a practical alternate surface, not as a separate brand.

### Primary

- **Muted Coral Signal** (`#e46b78`): Primary actions, selected navigation, approved-state emphasis, and focused controls in dark mode. Keep it rare enough that it identifies an action immediately.
- **Soft Coral Signal** (`#d95567`): Primary actions and selected states in light mode, where the darker value carries stronger contrast.
- **Coral Hover** (`#f0818c`): Hover and active feedback on dark surfaces only.

### Secondary

- **Point Lilac** (`#d8b7e4`): Low-opacity ambient point field and optional visual grouping in empty states. It is never used for body text or critical status.
- **Point Coral** (`#d98d97`): A secondary point-field tone used sparingly to connect the background atmosphere to the primary accent.

### Neutral

- **Graphite Base** (`#0b0b0b`): Deep application background. Do not treat it as a black neon canvas; raise content surfaces above it.
- **Graphite Canvas** (`#111211`): Main work area behind grids and inspectors.
- **Graphite Surface** (`#191b19`): Asset tiles, search fields, and standard panels.
- **Graphite Raised** (`#202420`): Open menus, active panels, and selected surface layers.
- **Graphite Strong** (`#2b302b`): High-emphasis controls and focused tonal surfaces.
- **Warm White Ink** (`#f1f1f1`): Primary dark-mode text and media labels.
- **Quiet Grey Ink** (`#a6aaa3`): Secondary dark-mode text, metadata, and supporting labels.
- **Warm Light Base** (`#f7f7f5`): Light-mode application background.
- **Warm Light Canvas** (`#f0efeb`): Light-mode work area.
- **Light Surface** (`#fffdfa`): Light-mode content panels and asset tiles.
- **Light Ink** (`#20231f`): Primary light-mode text.
- **Light Muted Ink** (`#70776f`): Secondary light-mode text and metadata.
- **Dark Border** (`#ffffff1f`): Tonal separation on dark surfaces.
- **Light Border** (`#20231f1f`): Tonal separation on light surfaces.

### Named Rules

**The One Signal Rule.** The coral accent is reserved for primary actions, active navigation, selected assets, and semantic states. It must not become a background decoration.

**The Media Truth Rule.** Never tint, blur, or overlay an asset thumbnail for atmosphere. The media preview must remain the most truthful surface on the page.

## 3. Typography

**Display Font:** PingFang SC with system sans fallbacks

**Body Font:** PingFang SC with system sans fallbacks

**Label/Mono Font:** System sans by default; use a monospace fallback only for model IDs, seeds, and compiled provider payloads.

**Character:** One quiet sans family creates continuity across navigation, metadata, prompts, and version labels. Weight and spacing create hierarchy; the interface does not use a display face or decorative type to manufacture personality.

### Hierarchy

- **Display** (650, `2rem`, `1.2`): Page titles and the primary project heading. Use sparingly.
- **Headline** (600, `1.5rem`, `1.2`): Section titles and major inspector headings.
- **Title** (600, `1rem`, `1.35`): Asset names, panel titles, and project names.
- **Body** (400, `0.9375rem`, `1.55`): Prompt text, descriptions, and explanatory copy. Keep prose within 65–75ch when it is not a compact control.
- **Label** (500, `0.8125rem`, `1.35`): Filters, metadata, status labels, and navigation text. Avoid all-caps sentences.

### Named Rules

**The Quiet Hierarchy Rule.** Prefer one size step and one weight step to clarify a relationship. Do not use oversized headings, display fonts, or tracking-heavy labels to make a utility page feel designed.

## 4. Elevation

The system uses tonal layering first and shadows second. A surface should be understandable from its background and border before a shadow is added. Standard asset tiles and panels remain nearly flat; shadows are reserved for popovers, inspectors that float above content, and transient controls.

### Shadow Vocabulary

- **Panel Ambient** (`0 12px 30px rgb(22 25 23 / 0.06)` in light mode, `0 14px 32px rgb(0 0 0 / 0.2)` in dark mode): Floating detail panels and persistent raised containers.
- **Popover** (`0 18px 42px rgb(22 25 23 / 0.14)`): Menus, command palette, and project switcher.
- **Control** (`0 4px 14px rgb(22 25 23 / 0.08)` in light mode, `0 6px 18px rgb(0 0 0 / 0.24)` in dark mode): Use only where a control must separate from a busy media surface.

### Named Rules

**The Tonal Layer Rule.** A card does not earn a large shadow simply because it is a card. Use surface contrast and a one-pixel border first; use a shadow only when the element is physically above the work area.

## 5. Components

The component language is compact, familiar, and state-complete. Every interactive component needs default, hover, focus-visible, active, disabled, loading, and error behavior where the state applies.

### Buttons

- **Shape:** Gently compact controls with an 8px radius (`8px`), never oversized pills except for status chips.
- **Primary:** Muted Coral Signal (`#e46b78`) with warm-white text, 44px minimum height, and 16px horizontal padding.
- **Hover / Focus:** Raise contrast through a solid hover color or visible focus ring. Do not add neon glow.
- **Secondary / Ghost:** Transparent or tonal graphite background, muted text, and a full border only when the control needs a clear boundary.
- **Motion:** State changes use a short 150–250ms ease-out transition. Respect `prefers-reduced-motion`.

### Chips

- **Style:** Compact 6px radius filter chips by default; pill shape only for status or count badges.
- **State:** Unselected chips use a neutral surface and muted text. Selected chips use a low-area accent tint plus a visible label, not color alone.

### Cards / Containers

- **Corner Style:** Asset tiles use 10px; panels use 14px; avoid 24px-plus container radii.
- **Background:** Use one of the graphite or light neutral surfaces. Do not stack more than two visible containers around one piece of content.
- **Shadow Strategy:** Follow the Tonal Layer Rule. Asset tiles are flat at rest.
- **Border:** Use a one-pixel neutral border for separation. Never use a thick colored side stripe.
- **Internal Padding:** 8px for thumbnail metadata, 16px for controls, and 24px for inspector sections.

### Inputs / Fields

- **Style:** 44px minimum height, 8px radius, tonal surface, and a subtle full border.
- **Focus:** Use a visible 2px focus ring or accent border shift without changing layout.
- **Error / Disabled:** Error includes text and an icon or label; disabled controls preserve readable text and do not rely on opacity alone.
- **Prompt Field:** The prompt editor may be visually dominant inside the generation page, but it must share space with explicit asset slots and compiled reference context.

### Navigation

- **Style:** A 256px expanded sidebar and 72px collapsed icon rail. Keep primary navigation to seven concepts: 工作台, 项目, 素材库, 生成素材, 生成记录, 导演台, 资源.
- **Default:** Neutral text and tonal hover background.
- **Active:** Accent text or a low-area accent surface plus an icon and accessible label. Do not use a thick colored side stripe.
- **Mobile:** Replace the rail with a sheet or bottom-accessible menu; preserve the current project switcher and global search.
- **Hierarchy:** Asset types live in the asset page's local tabs, not as eight competing top-level entries.

### Asset Tiles

- **Purpose:** Show the media first, then the minimum context needed to reuse it safely.
- **Structure:** Thumbnail, type label, asset name, approved-version marker, and project/status metadata.
- **Interaction:** Click opens preview or detail; keyboard focus is visible; selection supports multi-select without hiding the selected state.
- **Media:** Preserve aspect ratio and color fidelity. Do not use decorative overlays that obscure the image.

### Ambient Point Field

- **Purpose:** A decorative, `aria-hidden` background layer for the authenticated content shell, anchored to the top-right across working pages.
- **Shape:** Deterministic dots with variable size and density, inspired by the supplied reference image but not copied literally.
- **Behavior:** TypeGPU/WebGPU is progressive enhancement. Canvas 2D or a static fallback must render the page with no visual or functional break when WebGPU is unavailable.
- **Limits:** `pointer-events: none`, low opacity, no continuous high-frequency animation, and never above a media preview or dense form. Page-specific gradients and duplicate point fields should not be introduced.

## 6. Do's and Don'ts

### Do:

- **Do** make the asset thumbnail, approved version, and reference role visible before secondary metadata.
- **Do** use projects as the primary organizing unit and tags/types as filters.
- **Do** keep the default page dense enough for real asset comparison while preserving readable labels and focus states.
- **Do** use the graphite tonal ramp rather than pure black, white, or a large gradient surface.
- **Do** use the coral accent only for action, selection, and semantic state.
- **Do** provide a static or Canvas 2D fallback before enabling TypeGPU/WebGPU decoration.
- **Do** use exact action labels such as “生成新版本”, “确认版本”, “移入项目”, and “归档资产”.
- **Do** make empty, loading, failed, and disabled states explicit and recoverable.

### Don't:

- **Don't** make the product look like a traditional backend with unrelated management menus.
- **Don't** use a pure-black cyberpunk surface, neon borders, scanlines, HUD decorations, or glowing text.
- **Don't** build a flashy AI tool site with gradient text, glassmorphism by default, decorative blobs, or animation that does not communicate state.
- **Don't** create an over-spacious SaaS layout that hides the asset collection behind large empty regions.
- **Don't** turn 主体, 场景, 道具, 风格, 项目, 模型, 提示词, and 辅助工具 into equal first-level navigation items.
- **Don't** use a thick colored side stripe as an active-state or status affordance.
- **Don't** place TypeGPU effects over thumbnails, prompts, or version metadata.
- **Don't** rely on color alone for status, approval, selection, error, or loading feedback.
- **Don't** use large decorative shadows with borders on every card. Depth must come from tonal layers first.
