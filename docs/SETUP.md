# GatePass authentication and deployment

GatePass now uses Supabase Auth email/password sessions and the Supabase database for profiles, roles, events, registrations, passes, check-ins, and audit entries. There is no demo-account fallback and no browser role switcher.

## Environment variables

Only these two public values belong in the browser build:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` as a `VITE_` variable or commit it. If a server-side Edge Function is added for operations that require elevated privileges, keep that key in the Edge Function environment only.

## Database and Auth setup

1. Create or select the Supabase project. The supplied project currently has legacy `profiles`, `events`, and `registrations` tables whose columns do not match GatePass, and it is missing `passes`, `check_ins`, `audit_logs`, and the GatePass RPCs. Do not apply this migration blindly over that legacy shape; use a clean project or have the project owner reconcile/drop the legacy schema after taking a backup.
2. Enable Email provider in **Authentication → Providers → Email**. Decide whether email confirmation is required; if enabled, users must confirm before they can sign in.
3. Apply `supabase/migrations/001_gatepass_schema.sql` in the Supabase SQL editor or through the Supabase CLI.
4. The migration installs the `profiles` table and `on_auth_user_created` trigger. Every new Auth user becomes a `guest` profile by default using the submitted display name. Signup never accepts a role.
5. Configure the two `VITE_` values in local and deployed environments.

## Sample events

After the migration is applied and an existing profile has been securely promoted to `admin`, run `supabase/seed/001_sample_events.sql` in the same active project. The seed is idempotent, creates five upcoming sample events, uses the existing Admin profile as `created_by`, and marks each description with `[SAMPLE EVENT]`. It does not create users, profiles, roles, or bypass RLS. It aborts if the GatePass RPC is missing or no Admin profile exists.

The active Preview project is currently only partially initialized: its REST endpoint exposes empty `events`, `profiles`, `registrations`, and `passes` resources, but `public.register_for_event(uuid)` is absent from the schema cache. Therefore no sample event rows have been inserted and registration/pass verification is not yet possible. Apply the migration first, securely promote the first Admin, then run the seed and verify the returned event IDs with the query included at the end of the seed file.

The migration contains RLS policies plus server-side functions for `register_for_event`, `check_in_pass`, `revoke_pass`, and `promote_user_role`. Registration is atomic and tied to `auth.uid()`. Check-in is admin-only, rejects invalid/wrong-event/revoked/expired/already-used passes, and is duplicate-safe under concurrent calls.

## First Admin and VIP assignment

Do not promote roles from the browser. After the first user signs up and the profile trigger has created their row, use the Supabase SQL editor as the project owner to promote that profile once:

```sql
update public.profiles
set role = 'admin', updated_at = now()
where lower(email) = lower('first-admin@example.com');
```

After signing in as that account, an authorized administrator can promote other profiles through the protected `promote_user_role` function:

```sql
select public.promote_user_role('USER_UUID_HERE', 'vip');
-- or
select public.promote_user_role('USER_UUID_HERE', 'guest');
```

The function rejects callers who are not already admins and writes an audit entry. The first-admin SQL statement is intentionally an owner-only setup step, not a public API.

## Local development

```bash
pnpm install
pnpm dev
```

The app restores the Supabase session across refreshes, loads the authenticated profile, and redirects to the protected workspace. Signed-out users see the public landing page and the email/password auth screen. If environment variables are missing, the app fails closed with setup instructions instead of exposing seeded identities.

## Verification commands

```bash
pnpm typecheck
pnpm run build
pnpm run auth:probe
```

`auth:probe` checks the supplied project endpoint and required table shape, confirms that the protected profile table is reachable, verifies invalid credentials are rejected, and verifies unauthenticated RPC calls do not bypass authorization. It does not create a test account or print credentials. Against the active project it currently reports the missing `register_for_event` RPC; this is intentional and prevents false claims of a working deployment.

## Deployment

Build with `pnpm build` and publish `dist/` with SPA fallback to `index.html`. Configure the two public Supabase variables in the deployment environment. Apply the migration before inviting users. Keep the service-role key out of the frontend and out of Git.

## Current limitations

Live signup/sign-in/session restoration requires the target Supabase project to have the migration applied and Email provider enabled. The supplied project needs schema reconciliation or replacement before the positive flow can work. The Preview can verify the public Auth endpoint and unauthorized rejection without creating a durable test account; a full positive signup and role-specific workflow test requires a disposable or approved test account after that setup.
