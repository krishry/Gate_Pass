# GatePass — implementation plan

## Scope and implementation approach

GatePass will be delivered as a small, complete Preview-ready MVP with a polished React + TypeScript + Vite frontend, Tailwind-style utility classes backed by a compact custom CSS token layer, and a deterministic local demo data adapter so the core workflow is demonstrable without inventing an unverified external Supabase project. The demo adapter persists events, registrations, passes, check-ins, audit entries, and the active role in `localStorage`; all dashboard numbers are derived from that state. Supabase-ready SQL migrations, RLS policy examples, environment documentation, and a clean integration seam will be included under `supabase/` and `docs/` for independent deployment.

The first usable slice is intentionally narrow: landing page → workspace role view → event browse/create → registration → persistent digital pass → manual/QR-style verification → duplicate-safe rejection. Authentication is represented in the Preview by a clearly labeled demo sign-in/session switcher and protected route behavior; production integration instructions target the platform's provided auth session and a new Supabase project rather than claiming an unverified backend is connected. The UI will make backend/demo mode explicit.

## Project structure

- `src/main.tsx` — app entry and global styles.
- `src/App.tsx` — route state, navigation, role-aware views, and interaction orchestration.
- `src/lib/demoStore.ts` — typed persistent demo data model and safe mutations.
- `src/lib/format.ts` — date/number helpers.
- `src/components/` — reusable shell, buttons, badges, modal, QR-like mark, ticket, and stat primitives.
- `src/styles.css` — palette, typography, layout, responsive behavior, and motion.
- `public/manus-routes.json` — complete page route manifest.
- `supabase/migrations/001_gatepass_schema.sql` — tables, constraints, indexes, RLS, and duplicate-safe check-in function.
- `docs/SETUP.md` — environment variables, Supabase setup, seed/demo notes, migration and deployment instructions.
- `TODO.md` — acceptance outcomes and evidence status.
- `app.config.ts` — project logo metadata.

## Design

Three possible directions sampled from the tails:

1. **Editorial control room** (0.07): museum-catalog typography, ruled paper, pine ink, acid-lime status marks, and an asymmetric operator console.
2. **Night transit terminal** (0.05): dark wayfinding panels, route lines, fluorescent signal accents, and compact operational density.
3. **Civic festival ledger** (0.08): warm civic forms, stamped permissions, terracotta emphasis, and humanist signage.

Chosen direction: **Editorial control room**.

- **Design Movement:** Swiss editorial systems translated into an event-operations desk: strict rhythm, asymmetric composition, and utilitarian marks softened by paper warmth.
- **Core Principles:** operational clarity; physical-paper tactility without skeuomorphism; role-specific confidence; every status earns its color.
- **Color Philosophy:** `#F6F4EE` is the quiet paper field; `#172B26` is the authoritative ink; `#C9F06B` marks live permission and momentum; `#DADFD7` carries secondary structure; `#C65D3A` is reserved for risk and attention.
- **Layout Paradigm:** a pinned left rail and offset editorial columns rather than centered card grids; wide hero copy, narrow metadata rails, and stacked list/table bands.
- **Signature Elements:** ruled dividers with micro-labels; an octagonal “GP” access mark; ticket-like pass panels with perforation dots and scan metadata.
- **Interaction Philosophy:** role and state are always visible; actions change the ledger first, then confirm with a short, plain-language result. Destructive/revoking actions use coral and explicit copy.
- **Animation:** restrained 160–240ms slide/fade for panel changes, a subtle scan-line pulse only on the scanner, and no looping decorative motion.
- **Typography System:** `Space Grotesk` for display and navigation; `DM Mono` for timestamps, codes, counts, and labels; system sans fallback for long body copy. Large headings are tight and slightly editorial, never oversized for its own sake.
- **Brand Essence:** event access control that makes the door feel calm; precise, legible, quietly distinctive.
- **Brand Voice:** direct, observant, composed. Example lines: “The room is ready.” and “One pass. One entry. No ambiguity.”
- **Wordmark & Logo:** the `GatePass` wordmark is paired with a compact octagonal mark split by a gate notch, used as a badge rather than a generic app icon.
- **Signature Brand Color:** acid lime `#C9F06B`, used sparingly as the unmistakable permission signal.

## Build workflow

1. Scaffold the Vite TypeScript app and install the pinned dependencies.
2. Register TypeScript diagnostics before application edits.
3. Implement typed demo persistence and all primary views with loading/empty/success/failure states.
4. Add route manifest, setup docs, SQL migration, environment template, and project logo metadata.
5. Run typecheck/build plus a scripted core workflow against the demo store; inspect Preview and responsive screenshots only after the dev server is healthy.
6. Fix confirmed issues, commit to the managed canonical repository, and leave publication disabled unless explicitly requested.

## Material constraints

No custom stock imagery is needed: this is an internal operations product and the brief asks to avoid decorative filler. QR visuals are generated deterministically as an in-app code mark from the persistent pass token. The app must not claim a live Supabase connection in Preview until credentials and migrations are supplied.
