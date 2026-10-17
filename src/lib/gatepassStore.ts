import { supabase, type AuthProfile } from './supabase'
import {
  type CreateEventInput,
  type EventRecord,
  type GatePassStore,
  type MutationResult,
  type PassRecord,
  type Registration,
  type VerificationResult,
  type CheckIn,
  type AuditLog,
  type Role,
  getEvent,
  getEventCheckInCount,
  getEventRegistrationCount,
  roleFromValue,
} from './types'

function requireClient() {
  if (!supabase) throw new Error('Authentication is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  return supabase
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)).toUpperCase()
}

function timeLabel(start: string, end: string) {
  const format = (value: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
  return `${format(start)} — ${format(end)}`
}

function eventAccent(id: string): EventRecord['accent'] {
  const accents: EventRecord['accent'][] = ['lime', 'coral', 'pine', 'sage']
  return accents[id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % accents.length]
}

function eventTag(status: EventRecord['status']) {
  return status === 'live' ? 'Live listing' : status === 'upcoming' ? 'Upcoming' : status === 'draft' ? 'Draft' : 'Archived'
}

function mapEvent(row: any): EventRecord {
  return {
    id: row.id,
    title: row.title,
    date: row.starts_at.slice(0, 10),
    dateLabel: dateLabel(row.starts_at),
    timeLabel: timeLabel(row.starts_at, row.ends_at),
    venue: row.venue,
    city: row.city,
    capacity: row.capacity,
    status: row.status,
    tag: eventTag(row.status),
    accent: eventAccent(row.id),
    description: row.description ?? '',
    createdAt: row.created_at,
  }
}

function mapRole(value: unknown): Role { return roleFromValue(value) }

function profileFallback(id: string, profileMap: Map<string, any>, session: AuthProfile) {
  const profile = profileMap.get(id)
  return profile ?? (id === session.id ? session : { id, display_name: 'GatePass user', email: '', role: 'guest' })
}

function mapRegistration(row: any, profileMap: Map<string, any>, session: AuthProfile): Registration {
  const profile = profileFallback(row.guest_id, profileMap, session)
  return {
    id: row.id,
    eventId: row.event_id,
    guestName: profile.display_name,
    guestEmail: profile.email,
    role: mapRole(row.role),
    privilege: row.privilege,
    registeredAt: row.registered_at,
    status: row.status,
  }
}

function mapPass(row: any, profileMap: Map<string, any>, session: AuthProfile): PassRecord {
  const profile = profileFallback(row.holder_id, profileMap, session)
  return {
    id: row.id,
    eventId: row.event_id,
    registrationId: row.registration_id,
    holderId: row.holder_id,
    holderName: profile.display_name,
    holderEmail: profile.email,
    role: mapRole(profile.role),
    privilege: row.privilege,
    token: row.token,
    issuedAt: row.issued_at,
    revokedAt: row.revoked_at ?? undefined,
  }
}

function mapCheckIn(row: any): CheckIn {
  return { id: row.id, passId: row.pass_id, eventId: row.event_id, checkedInAt: row.checked_in_at, gate: row.gate }
}

function mapAudit(row: any, profileMap: Map<string, any>): AuditLog {
  const actor = row.actor_id ? profileMap.get(row.actor_id)?.display_name ?? 'GatePass operator' : 'System'
  const action = row.action as string
  return { id: String(row.id), actor, action, detail: row.detail, at: row.created_at, tone: action.toLowerCase().includes('revoke') ? 'warning' : action.toLowerCase().includes('check') || action.toLowerCase().includes('issue') || action.toLowerCase().includes('publish') ? 'positive' : 'neutral' }
}

async function queryRows(profile: AuthProfile) {
  const client = requireClient()
  const [events, registrations, passes, checkIns, auditLogs, profiles] = await Promise.all([
    client.from('events').select('*').order('starts_at', { ascending: true }),
    client.from('registrations').select('*').order('registered_at', { ascending: false }),
    client.from('passes').select('*').order('issued_at', { ascending: false }),
    client.from('check_ins').select('*').order('checked_in_at', { ascending: false }),
    client.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(50),
    client.from('profiles').select('id,display_name,email,role'),
  ])
  const failure = [events, registrations, passes, checkIns, auditLogs, profiles].find((result) => result.error)
  if (failure?.error) throw new Error(failure.error.message)
  return { events: events.data ?? [], registrations: registrations.data ?? [], passes: passes.data ?? [], checkIns: checkIns.data ?? [], auditLogs: auditLogs.data ?? [], profiles: profiles.data ?? [] }
}

export async function loadStore(profile: AuthProfile): Promise<GatePassStore> {
  const rows = await queryRows(profile)
  const profileMap = new Map(rows.profiles.map((row: any) => [row.id, row]))
  return {
    session: { userId: profile.id, name: profile.display_name, email: profile.email, role: mapRole(profile.role) },
    events: rows.events.map(mapEvent),
    registrations: rows.registrations.map((row: any) => mapRegistration(row, profileMap, profile)),
    passes: rows.passes.map((row: any) => mapPass(row, profileMap, profile)),
    checkIns: rows.checkIns.map(mapCheckIn),
    auditLogs: rows.auditLogs.map((row: any) => mapAudit(row, profileMap)),
  }
}

function isoBounds(input: CreateEventInput) {
  const times = input.timeLabel.split(/\s*[—-]\s*/)
  const startTime = times[0]?.trim() || '18:00'
  const endTime = times[1]?.trim() || startTime
  return { starts_at: `${input.date}T${startTime}:00`, ends_at: `${input.date}T${endTime}:00` }
}

async function refreshed(store: GatePassStore) {
  const { data, error } = await requireClient().from('profiles').select('id,display_name,email,role').eq('id', store.session.userId).single()
  if (error) throw new Error(error.message)
  return loadStore(data as AuthProfile)
}

export async function createEvent(store: GatePassStore, input: CreateEventInput): Promise<GatePassStore> {
  if (store.session.role !== 'admin') throw new Error('Only admins can create events.')
  const { error } = await requireClient().from('events').insert({ ...isoBounds(input), title: input.title, description: input.description, venue: input.venue, city: input.city, capacity: input.capacity, status: 'draft', created_by: store.session.userId })
  if (error) throw new Error(error.message)
  return refreshed(store)
}

export async function updateEvent(store: GatePassStore, eventId: string, input: CreateEventInput): Promise<GatePassStore> {
  if (store.session.role !== 'admin') throw new Error('Only admins can edit events.')
  const { error } = await requireClient().from('events').update({ ...isoBounds(input), title: input.title, description: input.description, venue: input.venue, city: input.city, capacity: input.capacity }).eq('id', eventId)
  if (error) throw new Error(error.message)
  return refreshed(store)
}

export async function publishEvent(store: GatePassStore, eventId: string): Promise<MutationResult> {
  if (store.session.role !== 'admin') return { ok: false, message: 'Only admins can publish events.', store }
  const { error } = await requireClient().from('events').update({ status: 'live' }).eq('id', eventId)
  if (error) return { ok: false, message: error.message, store }
  return { ok: true, message: 'Event published.', store: await refreshed(store) }
}

export async function registerForEvent(store: GatePassStore, eventId: string): Promise<MutationResult> {
  if (store.session.role === 'admin') return { ok: false, message: 'Admin accounts cannot register guests.', store }
  const { data, error } = await requireClient().rpc('register_for_event', { p_event_id: eventId })
  if (error) return { ok: false, message: registrationError(error.message), store }
  const next = await refreshed(store)
  const pass = next.passes.find((item) => item.id === (Array.isArray(data) ? data[0]?.id : data?.id))
  return { ok: true, message: `Your ${store.session.role === 'vip' ? 'VIP ' : ''}pass is ready.`, store: next, pass }
}

export async function revokePass(store: GatePassStore, passId: string): Promise<MutationResult> {
  if (store.session.role !== 'admin') return { ok: false, message: 'Only admins can revoke passes.', store }
  const { error } = await requireClient().rpc('revoke_pass', { p_pass_id: passId })
  if (error) return { ok: false, message: error.message, store }
  return { ok: true, message: 'Pass revoked. Entry will be rejected at the door.', store: await refreshed(store) }
}

export async function verifyAndCheckIn(store: GatePassStore, query: string, eventId: string, gate: string): Promise<VerificationResult> {
  if (store.session.role !== 'admin') return { ok: false, kind: 'forbidden', message: 'Only an admin scanner can record entry.', store }
  const { data, error } = await requireClient().rpc('check_in_pass', { p_token: query.trim(), p_event_id: eventId, p_gate: gate })
  if (error) {
    const pass = store.passes.find((item) => item.token.toLowerCase() === query.trim().toLowerCase() || item.id.toLowerCase() === query.trim().toLowerCase())
    return { ok: false, kind: verificationKind(error.message), message: verificationMessage(error.message), pass, store }
  }
  const next = await refreshed(store)
  const passId = Array.isArray(data) ? data[0]?.pass_id : data?.pass_id
  const pass = next.passes.find((item) => item.id === passId)
  return { ok: true, kind: 'valid', message: 'Pass verified. Welcome inside.', pass, store: next }
}

function registrationError(message: string) {
  if (message.includes('event_at_capacity')) return 'This event has reached capacity.'
  if (message.includes('registration_duplicate')) return 'You already hold a pass for this event.'
  if (message.includes('event_not_open')) return 'This event is not open for registration.'
  if (message.includes('event_expired')) return 'This event has already ended.'
  return message
}

function verificationKind(message: string): VerificationResult['kind'] {
  if (message.includes('pass_wrong_event')) return 'wrong-event'
  if (message.includes('pass_revoked')) return 'revoked'
  if (message.includes('pass_expired')) return 'expired'
  if (message.includes('pass_already_used')) return 'used'
  if (message.includes('scanner_admin_required')) return 'forbidden'
  return 'invalid'
}

function verificationMessage(message: string) {
  if (message.includes('pass_wrong_event')) return 'Valid pass, wrong event.'
  if (message.includes('pass_revoked')) return 'This pass has been revoked.'
  if (message.includes('pass_expired')) return 'This pass is expired.'
  if (message.includes('pass_already_used')) return 'Already checked in. Entry denied.'
  if (message.includes('scanner_admin_required')) return 'Only an admin scanner can record entry.'
  return 'No pass matches that code.'
}

export { getEvent, getEventRegistrationCount, getEventCheckInCount, roleFromValue }
