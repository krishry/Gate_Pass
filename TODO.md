# GatePass delivery TODO

## 1. Real authentication and protected workspace
- [x] Implement sign-up, sign-in, sign-out, session persistence, loading states, validation, clear errors, and protected routes using Supabase Auth email/password sessions. Evidence: `src/lib/supabase.ts`, `AuthScreen` in `src/App.tsx`, persistent `gatepass-auth-session`, and browser tests for invalid login and short-password rejection.
- [x] Signup creates Guest access only; Admin/VIP roles are read from `profiles` and cannot be selected in the form. Evidence: signup copy, no role field, `handle_new_user` trigger, `profiles` RLS, and `promote_user_role` RPC in the migration.
- [x] Enforce role permissions on the backend. Users cannot grant themselves Admin/VIP access or register on behalf of another user. Evidence: RLS policies, admin-only role promotion/revocation/check-in RPCs, and authenticated-user-bound registration RPC in `supabase/migrations/001_gatepass_schema.sql`.
- [x] Provide separate Admin, Guest, and VIP dashboard experiences with role-aware navigation and explicit current-role state. Evidence: `roleMeta`, protected shell, role-specific scanner access, and profile-driven session state.

## 2. Event creation, publishing, browsing, and registration
- [x] Admins can create/edit/publish events, configure dates, venue, and capacity, view registrations, revoke passes, and monitor attendance. Evidence: async Supabase adapter methods, Events ledger/modal, admin-only RPCs, and derived dashboard counters.
- [x] Guests can browse events and register only for their authenticated identity. Evidence: `register_for_event` uses `auth.uid()` and the client no longer accepts a browser-selected identity.
- [x] Prevent duplicate registrations and enforce event capacity; show loading, empty, success, and failure states and never show success when a backend operation fails. Evidence: unique database constraint/RPC exception mapping, async mutation states, and toast error/success handling.

## 3. Persistent digital passes
- [x] Generate unique QR-linked pass records after successful registration. Evidence: database `passes` records, RPC response reload, and ticket UI rendering the persistent token.
- [x] VIP users receive distinct passes with explicitly assigned privileges. Evidence: role read from `profiles`; registration RPC assigns the VIP privilege server-side.
- [x] Guests can view personal digital passes in the ticket interface. Evidence: `holder_id = auth.uid()` data loading and responsive Passes view.

## 4. Verification and duplicate-safe check-in
- [x] Support QR-style/manual pass lookup in a mobile-friendly scanner interface. Evidence: Scanner view and `check_in_pass` RPC adapter.
- [x] Reject invalid, revoked, expired, wrong-event, and already-used passes. Evidence: authoritative checks and error mapping in the migration and `gatepassStore.ts`.
- [x] Record successful check-ins and prevent concurrent duplicate scans. Evidence: row locking plus unique `check_ins.pass_id` constraint in the migration.

## 5. Data model, dashboard, and delivery
- [x] Derive dashboard registration/attendance/capacity statistics from database rows. Evidence: `loadStore()` queries and derived counters; no seeded account store remains.
- [x] Provide `profiles`, `events`, `registrations`, `passes`, `check_ins`, and `audit_logs` with relationships, constraints, indexes, RLS, Auth-user profile provisioning, role promotion, and atomic RPCs. Evidence: `supabase/migrations/001_gatepass_schema.sql`.
- [x] Provide secure environment-variable documentation, first-admin instructions, migration guidance, and independent deployment notes. Evidence: `docs/SETUP.md`, `README.md`, `public/setup/index.html`, and `.env.example`.
- [x] Preserve the warm paper/pine/lime/sage/coral design system, landing page, dashboards, ticket, scanner, accessible states, and responsive polish. Evidence: `src/styles.css`, Preview screenshots, and route manifest.

## Verification status
- [x] `pnpm typecheck` passes.
- [x] `pnpm run build` passes and produces `dist/`.
- [x] Preview serves `/manus-routes.json`, `/`, and `/auth` with HTTP 200.
- [x] Live non-destructive probe reached the supplied Supabase project; profiles table was reachable, invalid credentials were rejected, and the auth screen surfaced a clear invalid-login error.
- [x] Browser interaction checks verified invalid-login messaging, Guest-only signup copy, and short-password validation.
- [ ] Reconcile the supplied Supabase project before positive signup/session/role workflow testing. The live probe found incompatible legacy `profiles`, `events`, and `registrations` columns, plus missing `passes`, `check_ins`, `audit_logs`, and GatePass RPCs. Use a clean project or owner-approved schema migration/backup; do not overwrite legacy data blindly.
- [ ] After migration, run positive signup with an approved disposable account, promote one admin and one VIP through the documented secure path, and execute the end-to-end workflow against that project.
