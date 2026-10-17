export type Role = 'admin' | 'guest' | 'vip'
export type EventStatus = 'live' | 'upcoming' | 'draft' | 'archived'

export type Session = {
  userId: string
  name: string
  email: string
  role: Role
}

export type EventRecord = {
  id: string
  title: string
  date: string
  dateLabel: string
  timeLabel: string
  venue: string
  city: string
  capacity: number
  status: EventStatus
  tag: string
  accent: 'lime' | 'coral' | 'pine' | 'sage'
  description: string
  createdAt: string
}

export type Registration = {
  id: string
  eventId: string
  guestName: string
  guestEmail: string
  role: Role
  privilege: string
  registeredAt: string
  status: 'confirmed' | 'revoked'
}

export type PassRecord = {
  id: string
  eventId: string
  registrationId: string
  holderId: string
  holderName: string
  holderEmail: string
  role: Role
  privilege: string
  token: string
  issuedAt: string
  revokedAt?: string
}

export type CheckIn = {
  id: string
  passId: string
  eventId: string
  checkedInAt: string
  gate: string
}

export type AuditLog = {
  id: string
  actor: string
  action: string
  detail: string
  at: string
  tone: 'neutral' | 'positive' | 'warning'
}

export type GatePassStore = {
  session: Session
  events: EventRecord[]
  registrations: Registration[]
  passes: PassRecord[]
  checkIns: CheckIn[]
  auditLogs: AuditLog[]
}

export type CreateEventInput = Pick<EventRecord, 'title' | 'date' | 'dateLabel' | 'timeLabel' | 'venue' | 'city' | 'capacity' | 'tag' | 'accent' | 'description'>

export type MutationResult = { ok: boolean; message: string; store: GatePassStore; pass?: PassRecord }
export type VerificationResult = { ok: boolean; kind: 'valid' | 'invalid' | 'revoked' | 'expired' | 'wrong-event' | 'used' | 'forbidden'; message: string; pass?: PassRecord; store: GatePassStore }

export function roleFromValue(value: unknown): Role {
  return value === 'admin' || value === 'vip' ? value : 'guest'
}

export function initials(name: string): string {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export function getEvent(store: GatePassStore, eventId: string): EventRecord | undefined {
  return store.events.find((event) => event.id === eventId)
}

export function getMyPasses(store: GatePassStore): PassRecord[] {
  return store.passes.filter((pass) => pass.holderId === store.session.userId && !pass.revokedAt)
}

export function getEventRegistrationCount(store: GatePassStore, eventId: string): number {
  return store.registrations.filter((registration) => registration.eventId === eventId && registration.status === 'confirmed').length
}

export function getEventCheckInCount(store: GatePassStore, eventId: string): number {
  return store.checkIns.filter((checkIn) => checkIn.eventId === eventId).length
}
