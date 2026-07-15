# Design

Visual system for IRClass Navigator (frontend/, Next.js 16 + Tailwind v4 + shadcn/ui). Tokens live in `frontend/src/app/globals.css` (OKLCH, `:root` light + `.dark`).

## Theme

Light-first, institutional. Cool near-white ground, deep maritime blue as the identity color, gold used only as a scarce highlight. Dark mode is a navy-tinted derivative, not an inversion.

## Color

| Role | Light | Notes |
|---|---|---|
| Background | `#F7F8FA` (oklch ~0.977 0.002 247) | Never pure white page bg |
| Card / sidebar / popover | white | Surfaces sit brighter than the ground |
| Foreground | `#1B1F23` (oklch ~0.239 0.006 258) | Primary text |
| Muted foreground | `#6B7280` | Secondary text only, never body prose |
| Primary | `#0B2D5C` (oklch ~0.309 0.081 262) | Deep maritime blue: primary buttons, active nav, focus rings |
| Brand gold | `#C9A227` (oklch ~0.719 0.119 92) | `--brand-gold`; status dots, key highlights, ≤10% of any screen |
| Accent (shadcn) | cool light gray | Hover wash only — NOT the brand accent |
| Destructive | shadcn red kept | |

Dark: background deep navy-black (hue ~262, L ~0.16), surfaces one step lighter, primary lightened maritime blue (L ~0.55), gold unchanged, borders white/10%.

## Typography

Inter only (via next/font). Fixed rem scale, ratio ~1.2. Body ≥16px on reading surfaces (Home, answers). Weight contrast (500/600) over size where possible. No display faces.

## Radii & elevation

`--radius: 0.65rem` kept. Cards 12px, pills for tags/chips. Elevation: 1px borders as the default separator; shadows only on hover of clickable cards (≤8px blur) and overlays. Never border + wide shadow together.

## Motion

150–250ms, ease-out. Allowed: hover elevation, skeletons, processing indicators, dialog fades. Banned: scale-on-hover nav items, page-load choreography, moving backgrounds. `prefers-reduced-motion` collapses everything to instant/fade.

## Layout

App shell: white sidebar (16rem / 4rem collapsed) + slim header (⌘K "Ask Navigator" trigger + account) + `#F7F8FA` content. Content column max-w-5xl. Home hierarchy: greeting → ask box (~70% width, the ONE primary) → quick-action cards (secondary weight) → recents (3 columns, quiet).

## Components

shadcn/ui vocabulary throughout (Button, Card, Input, Tabs, DropdownMenu, Select, AlertDialog, Command). Every interactive element: default/hover/focus-visible/active/disabled states. Skeletons for loading; empty states teach (numbered first-run checklist). Icons: lucide, 16px in nav, consistent stroke.
