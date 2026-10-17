-- GatePass production schema for a clean Supabase project.
-- Apply after taking a backup/reconciling any legacy tables. The frontend uses
-- Supabase Auth and these tables directly; there is no demo identity fallback.

create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'guest', 'vip');
create type public.event_status as enum ('draft', 'live', 'upcoming', 'archived');
create type public.registration_status as enum ('confirmed', 'revoked');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  role public.user_role not null default 'guest',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_unique_idx on public.profiles(lower(email));

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 140),
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue text not null,
  city text not null,
  capacity integer not null check (capacity > 0),
  status public.event_status not null default 'draft',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null references public.profiles(id) on delete cascade,
  role public.user_role not null,
  privilege text not null default 'General access',
  status public.registration_status not null default 'confirmed',
  registered_at timestamptz not null default now(),
  unique (event_id, guest_id)
);

create table public.passes (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  holder_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  privilege text not null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null unique references public.passes(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  gate text not null,
  checked_in_by uuid not null references public.profiles(id),
  checked_in_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create index registrations_event_idx on public.registrations(event_id);
create index registrations_guest_idx on public.registrations(guest_id);
create index passes_event_idx on public.passes(event_id);
create index passes_holder_idx on public.passes(holder_id);
create index check_ins_event_idx on public.check_ins(event_id);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, display_name, email, role)
    values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)), new.email, 'guest')
    on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.passes enable row level security;
alter table public.check_ins enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.current_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create policy "profiles read own" on public.profiles for select using (id = auth.uid() or public.current_role() = 'admin');
create policy "profiles admin update" on public.profiles for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "events public read live" on public.events for select using (status in ('live', 'upcoming') or public.current_role() = 'admin');
create policy "events admin write" on public.events for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "registrations own read" on public.registrations for select using (guest_id = auth.uid() or public.current_role() = 'admin');
-- Registrations are inserted only by register_for_event below so capacity,
-- event status, ownership, and pass issuance are one atomic server action.
create policy "registrations admin update" on public.registrations for update using (public.current_role() = 'admin');
create policy "passes holder or admin read" on public.passes for select using (holder_id = auth.uid() or public.current_role() = 'admin');
create policy "passes admin write" on public.passes for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "checkins admin read" on public.check_ins for select using (public.current_role() = 'admin');
create policy "checkins scanner insert" on public.check_ins for insert with check (public.current_role() = 'admin');
create policy "audit admin read" on public.audit_logs for select using (public.current_role() = 'admin');

create or replace function public.register_for_event(p_event_id uuid)
returns public.passes
language plpgsql security definer set search_path = public
as $$
declare
  v_event public.events;
  v_profile public.profiles;
  v_registration public.registrations;
  v_pass public.passes;
  v_registered integer;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if not found or v_profile.role not in ('guest', 'vip') then raise exception 'guest_registration_required'; end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'event_invalid'; end if;
  if v_event.status not in ('live', 'upcoming') then raise exception 'event_not_open'; end if;
  if v_event.ends_at <= now() then raise exception 'event_expired'; end if;
  select count(*) into v_registered from public.registrations where event_id = p_event_id and status = 'confirmed';
  if v_registered >= v_event.capacity then raise exception 'event_at_capacity'; end if;
  insert into public.registrations(event_id, guest_id, role, privilege)
    values (p_event_id, auth.uid(), v_profile.role, case when v_profile.role = 'vip' then 'Front-row access · Guest lounge' else 'General access' end)
    returning * into v_registration;
  insert into public.passes(registration_id, event_id, holder_id, token, privilege)
    values (v_registration.id, p_event_id, auth.uid(), 'GP-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 12)), v_registration.privilege)
    returning * into v_pass;
  insert into public.audit_logs(actor_id, action, detail)
    values (auth.uid(), 'Pass issued', v_pass.token);
  return v_pass;
exception when unique_violation then
  raise exception 'registration_duplicate';
end;
$$;

create or replace function public.promote_user_role(p_user_id uuid, p_role public.user_role)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if public.current_role() <> 'admin' then raise exception 'admin_required'; end if;
  update public.profiles set role = p_role, updated_at = now() where id = p_user_id returning * into v_profile;
  if not found then raise exception 'profile_not_found'; end if;
  insert into public.audit_logs(actor_id, action, detail) values (auth.uid(), 'Role updated', v_profile.email || ' → ' || p_role::text);
  return v_profile;
end;
$$;

create or replace function public.revoke_pass(p_pass_id uuid)
returns public.passes
language plpgsql security definer set search_path = public
as $$
declare
  v_pass public.passes;
begin
  if public.current_role() <> 'admin' then raise exception 'admin_required'; end if;
  update public.passes set revoked_at = coalesce(revoked_at, now()) where id = p_pass_id returning * into v_pass;
  if not found then raise exception 'pass_invalid'; end if;
  update public.registrations set status = 'revoked' where id = v_pass.registration_id;
  insert into public.audit_logs(actor_id, action, detail) values (auth.uid(), 'Pass revoked', v_pass.token);
  return v_pass;
end;
$$;

-- Call this from a server-side Edge Function after validating the scanner operator.
-- The unique pass_id constraint makes repeated/concurrent scans fail atomically.
create or replace function public.check_in_pass(p_token text, p_event_id uuid, p_gate text)
returns public.check_ins
language plpgsql security definer set search_path = public
as $$
declare
  v_pass public.passes;
  v_event public.events;
  v_check_in public.check_ins;
begin
  if public.current_role() <> 'admin' then raise exception 'scanner_admin_required'; end if;
  select * into v_pass from public.passes where token = p_token for update;
  if not found then raise exception 'pass_invalid'; end if;
  if v_pass.event_id <> p_event_id then raise exception 'pass_wrong_event'; end if;
  if v_pass.revoked_at is not null then raise exception 'pass_revoked'; end if;
  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.status = 'archived' or v_event.ends_at <= now() then raise exception 'pass_expired'; end if;
  if exists (select 1 from public.check_ins where pass_id = v_pass.id) then raise exception 'pass_already_used'; end if;
  insert into public.check_ins(pass_id, event_id, gate, checked_in_by)
    values (v_pass.id, p_event_id, p_gate, auth.uid())
    returning * into v_check_in;
  insert into public.audit_logs(actor_id, action, detail)
    values (auth.uid(), 'Check-in recorded', v_pass.token);
  return v_check_in;
end;
$$;
