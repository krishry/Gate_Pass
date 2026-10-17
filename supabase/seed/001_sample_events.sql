-- GatePass sample events
-- Apply only after supabase/migrations/001_gatepass_schema.sql has been applied.
-- This script never creates users or profiles and never grants roles.
-- It selects an existing Admin profile as the event owner and aborts if none exists.

do $$
declare
  v_admin_id uuid;
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.events') is null
    or to_regprocedure('public.register_for_event(uuid)') is null then
    raise exception 'gatepass_schema_incomplete: apply 001_gatepass_schema.sql before seeding sample events';
  end if;

  select id into v_admin_id
  from public.profiles
  where role = 'admin'
  order by created_at asc
  limit 1;

  if v_admin_id is null then
    raise exception 'sample_event_seed_requires_existing_admin: create and securely promote the first Admin before seeding';
  end if;

  insert into public.events (title, description, starts_at, ends_at, venue, city, capacity, status, created_by)
  select sample.title, sample.description, sample.starts_at, sample.ends_at,
         sample.venue, sample.city, sample.capacity, 'upcoming'::public.event_status, v_admin_id
  from (values
    (
      'TechFest 2026',
      '[SAMPLE EVENT] Technology — A college technology festival featuring coding challenges, technical showcases, and emerging technologies.',
      timestamptz '2026-11-07 09:00:00+05:30',
      timestamptz '2026-11-07 18:00:00+05:30',
      'Innovation Auditorium', 'Bengaluru', 500
    ),
    (
      'AI & Innovation Workshop',
      '[SAMPLE EVENT] Workshop — An interactive workshop exploring artificial intelligence, machine learning, and practical innovation.',
      timestamptz '2026-11-14 10:00:00+05:30',
      timestamptz '2026-11-14 16:00:00+05:30',
      'Research Lab 01', 'Bengaluru', 120
    ),
    (
      'CodeSprint Hackathon',
      '[SAMPLE EVENT] Hackathon — A collaborative coding competition where participants develop solutions to real-world problems.',
      timestamptz '2026-11-21 18:00:00+05:30',
      timestamptz '2026-11-22 18:00:00+05:30',
      'Engineering Block', 'Bengaluru', 240
    ),
    (
      'Entrepreneurship Summit',
      '[SAMPLE EVENT] Business — A networking and learning event focused on startups, business ideas, and entrepreneurship.',
      timestamptz '2026-11-28 10:00:00+05:30',
      timestamptz '2026-11-28 17:00:00+05:30',
      'Business School Forum', 'Bengaluru', 300
    ),
    (
      'Cultural Night 2026',
      '[SAMPLE EVENT] Cultural — A college cultural celebration featuring music, performances, and student talent.',
      timestamptz '2026-12-05 17:00:00+05:30',
      timestamptz '2026-12-05 22:00:00+05:30',
      'Open Air Theatre', 'Bengaluru', 800
    )
  ) as sample(title, description, starts_at, ends_at, venue, city, capacity)
  where not exists (
    select 1 from public.events existing where existing.title = sample.title
  );
end $$;

-- Verify the five sample rows after the transaction completes:
-- select id, title, status, starts_at, created_by
-- from public.events
-- where title in ('TechFest 2026', 'AI & Innovation Workshop', 'CodeSprint Hackathon', 'Entrepreneurship Summit', 'Cultural Night 2026')
-- order by starts_at;
