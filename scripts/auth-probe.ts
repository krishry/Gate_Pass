import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function readEnv() {
  const values = { ...process.env } as Record<string, string | undefined>
  if (!values.VITE_SUPABASE_URL || !values.VITE_SUPABASE_ANON_KEY) {
    const local = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : ''
    for (const line of local.split('\n')) {
      const [key, ...rest] = line.trim().split('=')
      if (key && rest.length && !values[key]) values[key] = rest.join('=')
    }
  }
  if (!values.VITE_SUPABASE_URL || !values.VITE_SUPABASE_ANON_KEY) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.')
  return values as { VITE_SUPABASE_URL: string; VITE_SUPABASE_ANON_KEY: string }
}

const env = readEnv()
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data: profiles, error: profileError } = await supabase.from('profiles').select('id').limit(1)
if (profileError) throw new Error(`Profiles table probe failed: ${profileError.message}`)

for (const [table, columns] of Object.entries({
  profiles: 'id,display_name,email,role,created_at,updated_at',
  events: 'id,title,description,starts_at,ends_at,venue,city,capacity,status,created_by,created_at,updated_at',
  registrations: 'id,event_id,guest_id,role,privilege,status,registered_at',
})) {
  const response = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${table}?select=${columns}&limit=0`, { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` } })
  const body = await response.json() as { message?: string }
  if (!response.ok) throw new Error(`Existing ${table} table is incompatible with GatePass: ${body.message ?? `HTTP ${response.status}`}. Use a clean project or reconcile the legacy schema before applying the migration.`)
}

const invalidLogin = await supabase.auth.signInWithPassword({ email: 'gatepass.invalid.test@example.com', password: 'not-a-real-password' })
if (!invalidLogin.error || invalidLogin.error.message.toLowerCase().includes('unexpected')) throw new Error('Invalid credential rejection was not observed.')

const unauthenticatedRegistration = await supabase.rpc('register_for_event', { p_event_id: '00000000-0000-0000-0000-000000000000' })
if (unauthenticatedRegistration.error?.code === 'PGRST202') throw new Error('GatePass migration is not applied: register_for_event is missing from the schema cache.')
if (!unauthenticatedRegistration.error || !/guest_registration_required|not authenticated|jwt/i.test(unauthenticatedRegistration.error.message)) throw new Error(`Registration authorization probe returned an unexpected result: ${unauthenticatedRegistration.error?.message ?? 'success'}`)

const unauthenticatedCheckIn = await supabase.rpc('check_in_pass', { p_token: 'NOT-A-REAL-PASS', p_event_id: '00000000-0000-0000-0000-000000000000', p_gate: 'North Gate' })
if (unauthenticatedCheckIn.error?.code === 'PGRST202') throw new Error('GatePass migration is not applied: check_in_pass is missing from the schema cache.')
if (!unauthenticatedCheckIn.error || !/scanner_admin_required|not authenticated|jwt/i.test(unauthenticatedCheckIn.error.message)) throw new Error(`Check-in authorization probe returned an unexpected result: ${unauthenticatedCheckIn.error?.message ?? 'success'}`)

console.log(JSON.stringify({
  projectReachable: true,
  profilesTableReachable: true,
  profileRowsVisibleWithoutSession: profiles?.length ?? 0,
  invalidCredentialsRejected: true,
  unauthenticatedRegistrationRejected: true,
  unauthenticatedCheckInRejected: true,
}))
