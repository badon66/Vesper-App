---
name: Vesper App
description: Internal sales app for Vesper Lighting, built around the evening schedule.
colors:
  navy: "#132e3f"
  gold: "#b99257"
  night-background: "#0c1b26"
  night-card: "#13242f"
  night-secondary: "#1c3140"
  night-muted: "#182b38"
  night-muted-text: "#a9b6bf"
  night-accent: "#243b4c"
  night-border: "#27404f"
  night-input: "#5e7a8a"
  night-text: "#f4f1eb"
  night-destructive: "#e5675e"
  day-background: "#ffffff"
  day-secondary: "#e8edf0"
  day-muted: "#f2f4f6"
  day-muted-text: "#4f6270"
  day-accent: "#f6f1e7"
  day-border: "#d5dce1"
  day-input: "#7d8f9b"
  day-destructive: "#b3261e"
typography:
  headline:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.33
  title:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.55
  time:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.33
    fontFeature: "tnum"
  body:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.night-background}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "44px"
  button-outline:
    backgroundColor: "{colors.night-background}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "44px"
  input-field:
    backgroundColor: "{colors.night-background}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.md}"
    height: "44px"
  time-open:
    backgroundColor: "{colors.night-background}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "80px"
  time-held-mine:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.night-background}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "80px"
  time-unavailable:
    backgroundColor: "{colors.night-muted}"
    textColor: "{colors.night-muted-text}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "80px"
---

# Design System: Vesper App

Written by the impeccable skill's document step on 2026-11-02, scanned from `app/globals.css` and `components/ui/`, with the qualitative language taken from CLAUDE.md and the spec's Design section instead of an interview, as Keenan asked. CLAUDE.md's design rules win over anything here.

## Overview

**Creative North Star: "Porch Light"**

A small, steady warm light on a deep navy evening. The app is used at dusk, by a company that sells light, so the screen behaves like a porch light: dark and quiet by default, with gold appearing only where the next thing to do is. Everything else steps back. It is calm and premium through restraint: flat surfaces, plain words, generous spacing and big targets, never decoration.

Density is low on the phone (one task per screen) and moderate on the iPad (two panes allowed). Rejected outright, by CLAUDE.md: emoji, gradients, glassy effects, icon grids, filler, flashy motion and on-screen colour swatches.

**Key Characteristics:**
- Dark by default (night navy), with a light theme each device remembers; PDFs are always white.
- Gold marks the primary action, the current step and the time someone is holding, nothing else.
- Flat surfaces separated by borders and tonal steps, not shadows.
- One sans (Manrope), bold for headings and times, tabular figures for times.
- Every control is at least 44 px tall; the next step sits at the bottom right in thumb reach.

## Colors

A two-colour brand, navy and gold, on night-navy surfaces, with white text that leans warm.

### Primary
- **Porch Light Gold** (#b99257): primary buttons, open times, the held time, focus rings. Navy text on gold is 4.9:1; gold never carries body text on a light background (2.9:1).

### Neutral
- **Vesper Navy** (#132e3f): the brand colour, and the text colour in the light theme.
- **Night Background** (#0c1b26), **Night Card** (#13242f), **Night Secondary** (#1c3140), **Night Muted** (#182b38): the dark theme's surfaces, from page to raised to quiet.
- **Night Text** (#f4f1eb) and **Night Muted Text** (#a9b6bf): body and secondary text in the dark theme.
- **Night Border** (#27404f) and **Night Input** (#5e7a8a): dividers, and the edges of fields, unpicked answers and unticked boxes. Input edges reach 3:1 on every surface (WCAG 1.4.11), so an empty field still reads outdoors.
- **Day Background** (#ffffff), **Day Secondary** (#e8edf0), **Day Muted** (#f2f4f6), **Day Muted Text** (#4f6270), **Day Accent** (#f6f1e7), **Day Border** (#d5dce1), **Day Input** (#7d8f9b): the light theme.
- **Warning Red** (#e5675e at night, #b3261e by day): errors, and only errors. A warning that doesn't block (a long drive, a booking that won't line up) gets a neutral border and a bold first line, not red and not gold. (The Christmas banner's deep red on the customer's link is decoration Keenan asked for, not this token; see below.)

### Named Rules
**The Porch Light Rule.** Gold appears only where the next action is: the primary button, an open time, the held time. Chosen things (an answer, the evening on screen) are marked in Night Text, not gold, and taken things (booked, blocked, closed) go quiet. If two things on a screen compete in gold, one of them is wrong.

## Typography

**Body Font:** Manrope (with ui-sans-serif, system-ui)

**Character:** One clean geometric sans, set large on the phone. Weight does the work: bold for headings and times, semibold for buttons and labels, regular for reading.

### Hierarchy
- **Headline** (700, 1.5rem, 1.33): screen titles such as Schedule or the booking sheet's question.
- **Title** (700, 1.125rem, 1.55): section headings.
- **Time** (700, 1.5rem, tabular figures): meeting times on the board and in the sheet.
- **Body** (400, 1rem, 1.5): reading text, field values.
- **Label** (600, 0.875rem): field labels, choice buttons, secondary detail.

## Layout

- Phone first: one task per screen, a 16 px side gutter, content in a single column, and the bottom tab bar. The booking sheet covers the whole screen with its own bottom bar.
- From 1024 px wide, a slim left side rail replaces the tab bar; iPad screens can show two panes.
- Spacing steps of 8, 12, 16, 20 and 24 px; sections 20 to 24 px apart.
- Primary actions sit at the bottom of the screen, the main one at the bottom right.

## Elevation & Depth

Flat. Surfaces are separated by tonal steps (background, card, muted) and 1 px borders. The only shadow is a small one under floating notices that sit over content (`shadow-sm`).

Two exceptions (Keenan, 2026-11-11): the house's pictures in meeting mode, and the customer link's house pictures, sit in a photo frame: 18 px corners on the iPad (16 px on the phone), a hairline border (foreground at 15%, navy at 15% on the white link), and a soft shadow, so the photo sits just off the page. The frame takes the photo's own shape, keeps a margin from every edge, eases to a new shape and fades a new picture in (300 ms, none with Reduce Motion). Keenan's own full-width photos in the deck's named slots stay edge to edge.

**Logo.** The real Vesper Lighting logo (`components/brand/logo.tsx`, files in `brand/`, web sizes in `public/brand/`): the white version on navy and dark grounds, the navy version on white, following the theme in the app. The text wordmark is gone.

## Shapes

Gently rounded rectangles: 6 px on buttons, fields and time tiles, 8 px on cards, round only for the holder's initials and small badges. No pills for primary actions.

## Components

### Buttons
- **Shape:** 6 px corners, 44 px tall at every size (48 px for large).
- **Primary:** gold with night-navy text, semibold 16 px. One per screen region.
- **Outline:** page background with a 1 px border; hover turns muted.
- **Ghost and link:** for quiet secondary actions such as "Pick another time".
- **Focus:** a 2 px gold ring with an offset.

### Choice buttons (one-tap answers)
- A row of equal outline buttons; the chosen one turns light (Night Text fill, navy text) with a tick. Tapping it again clears it.

### Time tiles (signature)
- 80 px tall tiles in a two-column grid on the phone (three when the board is wide enough): the time in large tabular figures with a smaller "p.m.", the detail under it, everything aligned to the top so times line up across a row.
- **Open:** gold border, the brightest thing on the board. **Held by me:** gold fill. **Held by someone else:** dashed border, muted fill, the holder's initials in a gold circle. **Booked:** flat, with a quiet border and a muted time; the neighbourhood, then who booked it. Keenan's booked tiles carry a small chevron: a tap goes to the booking. **Blocked or closed:** muted.
- **The evening strip:** the evening on screen has a 2 px Night Text outline on the secondary surface; its name is the board's heading, at Title size.

### Cards / Containers
- 8 px corners, card surface, 1 px border, 16 to 24 px padding, no shadow.

### Inputs / Fields
- 44 px tall, 1 px input stroke, 6 px corners; focus shows the gold ring.

### Navigation
- Phone and iPad: a bottom tab bar with Session as the prominent gold button (Keenan, 2026-11-05; New lead held that place until then, and is now a button at the top of Leads and a smaller one on Session). 1024 px and wider: a slim left rail with the same items. No top tabs. The owner's Admin (People, Settings, Pay) is a gear in the header, named Admin where there is room, because Meetings made six items too many for a phone's bar (Keenan, 2026-11-02).

### Added by rounds 7 to 11 (refreshed 2026-11-11)

- **The deck (customer facing, iPad).** Always night navy, whatever the device's theme. One idea per page: one full-bleed picture of their own house (never a generic photo in its place) and a few words at 20 px or more; more is one tap away behind a named button. Options on Your price are outlined buttons with the total on the right; the chosen one is a light fill with a tick, never gold. A struck regular price sits beside the deal price in muted text. Only light moves, and only on the picker (and, from round 17, Where you're at's current step on What happens next); Reduce Motion is honoured.
- **The customer's page (phone).** Always white with navy text, and gold only for Book my install and the light in About your track's drawings; option rows are radio rows with the price on the right (round 17: each a card, with the description and the feet under the name and See the breakdown opening inside it); pictures sit in a 3:2 frame with full-screen zoom.
- **Keenan's drawings (owner only).** Strokes only, no fills: a two-storey outline per view in the muted foreground; a measured line solid at 2.25 px with its feet on it; an unmeasured line dashed at 45%; a line an active offer covers in gold at 3.25 px. Hit targets are a 28 px invisible stroke, so a finger lands on the line.
- **Quiet lines under the header.** The reminder bar (accent background) and the update notice (muted text on the page background, one line, tappable) sit under the header, 44 px tall, and never over a booking sheet or in meeting mode.
- **Talking points.** A small muted mark in the top right of a deck page; the panel shows only while pressed, after 200 ms, and is never in the tab order.

### Added by round 17 (Keenan, 2026-11-12)

- **The Christmas banner (customer's link).** Keenan's own exception to navy and gold, and the only red and green on the page: a pine green band (#1d4734) with white text, full width right under the navy header with the logo, above Where you're at and the rest of the page. Along its top edge a string of small bulbs on a dark wire (#0e2a1e), red (#e5484d), green (#4fb37f) and warm white (#ffe1a1) in turn, each with a soft glow, twinkle slowly (3.8 s, each on its own beat, so it twinkles rather than blinks); with Reduce Motion they hold still. The days left sit on a small deep red tag (#9e2a2f). It shows only by Keenan's Christmas dates, and never on the accepted page.
- **Where you're at (the link and the deck's What happens next).** Four lights on a low roofline drawn in the foreground at 30%, each light a 44 px tap target, with the steps' names under them (the open one underlined) and its words in a muted box below. Done and current steps are lit a warm light colour (#e9b65a, edged #c7913a, with a soft glow), never the brand gold, which on the link is kept for Book my install and the light in About your track's drawings; the current step glows gently (2.8 s), holding still with Reduce Motion; later steps are hollow and dim. Everything but the lit bulbs' fill and edge uses the theme's tokens, so it reads on the link's white and the deck's navy alike. On What happens next it is the one thing that moves on its own.

## Do's and Don'ts

### Do:
- **Do** keep the next action at the bottom right, in thumb reach, at least 44 px tall.
- **Do** use gold for one thing per screen region: the action, the held time or the current step.
- **Do** write empty states that say what will appear and how to make it appear.
- **Do** show times in Calgary time with tabular figures.

### Don't:
- **Don't** use emoji, gradients, glassy effects, icon grids or filler.
- **Don't** show colour swatches for track or soffit colours; show names.
- **Don't** put anything important at the top centre of a phone screen.
- **Don't** use gold for body text on a light background.
