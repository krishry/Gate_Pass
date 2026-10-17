# GatePass

GatePass is an event access management workspace with real Supabase email/password authentication, protected role-based dashboards, persistent digital passes, event registration, and duplicate-safe door check-in.

## Run locally

```bash
pnpm install
pnpm dev
```

Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` first. The app fails closed when they are missing; it never exposes hardcoded demo accounts or lets signup select Admin/VIP access.

## Checks

```bash
pnpm typecheck
pnpm run build
pnpm run auth:probe
```

Apply `supabase/migrations/001_gatepass_schema.sql` before using the app. It creates profiles, the Auth-user profile trigger, RLS policies, atomic registration/pass issuance, admin-only role promotion and revocation, and duplicate-safe check-in. See [docs/SETUP.md](docs/SETUP.md) for first-admin provisioning, environment setup, and deployment.

The supplied Supabase project is reachable but currently contains an incompatible legacy table shape and is missing the GatePass RPCs. Reconcile it with a backup or use a clean project before applying the migration; the app and `auth:probe` fail closed rather than pretending that partial schema is production-ready.
