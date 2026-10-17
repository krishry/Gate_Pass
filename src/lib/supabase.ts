import { createClient, type Session as SupabaseSession, type User } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function originOf(value: string | undefined) {
  try { return value ? new URL(value).origin : null } catch { return null }
}

export const supabaseProjectOrigin = originOf(url)
export const supabaseConfigured = Boolean(url && anonKey && supabaseProjectOrigin)
const projectRef = url?.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/i)?.[1] ?? 'unresolved'
const sessionStorageKey = `gatepass-auth-session-${projectRef}`

export const supabase = supabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // A project-specific key prevents a token issued by an old Supabase
        // project from being replayed against the currently configured project.
        storageKey: sessionStorageKey,
      },
    })
  : null

export type AuthProfile = {
  id: string
  display_name: string
  email: string
  role: 'admin' | 'guest' | 'vip'
}

export type AuthResult = { ok: boolean; message: string; session?: SupabaseSession; user?: User }

type SessionCheck = { session: SupabaseSession | null; error?: string }

function readableAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Authentication failed.'
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email address before signing in.'
  if (/already registered|user already registered/i.test(message)) return 'An account with this email already exists.'
  if (/password should be at least/i.test(message)) return 'Use a password with at least 8 characters.'
  return message
}

function issuerOrigin(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as { iss?: string }
    return decoded.iss ? new URL(decoded.iss).origin : null
  } catch {
    return null
  }
}

async function checkedSession(expectedUserId?: string): Promise<SessionCheck> {
  if (!supabase) return { session: null, error: 'Authentication is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' }
  const { data, error } = await supabase.auth.getSession()
  if (error) return { session: null, error: `Your authentication session could not be restored: ${error.message}` }
  const session = data.session
  if (!session?.access_token || !session.user?.id) return { session: null, error: 'Your session has expired. Sign in again.' }
  if (expectedUserId && session.user.id !== expectedUserId) return { session: null, error: 'The authenticated user does not match the requested profile.' }

  const tokenOrigin = issuerOrigin(session.access_token)
  if (tokenOrigin && supabaseProjectOrigin && tokenOrigin !== supabaseProjectOrigin) {
    // Clear only the local persisted session. Do not change the remote Auth user.
    await supabase.auth.signOut({ scope: 'local' })
    return { session: null, error: `This browser session belongs to a different Supabase project than ${supabaseProjectOrigin}. Sign in again.` }
  }
  return { session }
}

async function verifyProjectConfiguration(): Promise<string | null> {
  if (!supabaseProjectOrigin || !anonKey) return 'Supabase authentication is not configured.'
  try {
    const response = await fetch(`${supabaseProjectOrigin}/auth/v1/settings`, { headers: { apikey: anonKey }, cache: 'no-store' })
    if (response.status === 401) return `The public Supabase key was rejected by ${supabaseProjectOrigin}. The URL and public key belong to different projects.`
    if (!response.ok) return `Supabase configuration could not be verified at ${supabaseProjectOrigin} (HTTP ${response.status}).`
    return null
  } catch {
    return `Supabase could not be reached at ${supabaseProjectOrigin}. Check the configured project URL.`
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'Authentication is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' }
  const configurationError = await verifyProjectConfiguration()
  if (configurationError) return { ok: false, message: configurationError }
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (error) return { ok: false, message: readableAuthError(error) }
  return { ok: true, message: 'Signed in.', session: data.session ?? undefined, user: data.user ?? undefined }
}

export async function signUp(displayName: string, email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'Authentication is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' }
  const configurationError = await verifyProjectConfiguration()
  if (configurationError) return { ok: false, message: configurationError }
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { display_name: displayName.trim() } },
  })
  if (error) return { ok: false, message: readableAuthError(error) }
  return {
    ok: true,
    message: data.session ? 'Account created.' : 'Account created. Check your email to confirm it before signing in.',
    session: data.session ?? undefined,
    user: data.user ?? undefined,
  }
}

export async function signOut(): Promise<{ ok: boolean; message: string }> {
  if (!supabase) return { ok: false, message: 'Authentication is not configured.' }
  const { error } = await supabase.auth.signOut()
  return error ? { ok: false, message: error.message } : { ok: true, message: 'Signed out.' }
}

export async function currentSession(): Promise<SupabaseSession | null> {
  const result = await checkedSession()
  return result.session
}

export async function loadProfile(userId: string): Promise<{ profile: AuthProfile | null; error?: string }> {
  const sessionResult = await checkedSession(userId)
  if (!sessionResult.session) return { profile: null, error: sessionResult.error ?? 'Your session has expired. Sign in again.' }
  if (!supabase) return { profile: null, error: 'Authentication is not configured.' }

  const { data, error } = await supabase.from('profiles').select('id,display_name,email,role').eq('id', userId).maybeSingle()
  if (error) {
    const status = (error as { status?: number }).status
    if (error.code === 'PGRST205') return { profile: null, error: `The active Supabase project ${supabaseProjectOrigin ?? ''} does not have the GatePass profiles table in its schema cache. Apply the GatePass migration before signing in.` }
    if (status === 401 || error.code === 'PGRST301') return { profile: null, error: `Supabase rejected the authenticated profile request at ${supabaseProjectOrigin ?? 'the configured project'}. Sign out and sign in again; if this persists, verify the URL and public key are from the same project.` }
    return { profile: null, error: `Profile lookup failed at ${supabaseProjectOrigin ?? 'the configured project'}: ${error.message}` }
  }
  if (!data) return { profile: null, error: 'Your account is authenticated, but no matching profile row exists. Ask an administrator to run the profile setup migration; no role was assigned automatically.' }
  if (data.id !== sessionResult.session.user.id) return { profile: null, error: 'The returned profile does not match the authenticated user. Access was stopped.' }
  return { profile: data as AuthProfile }
}

export function authErrorMessage(error: unknown): string {
  return readableAuthError(error)
}
