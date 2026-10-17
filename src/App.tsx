import { useEffect, useState } from 'react'
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  DoorOpen,
  Grid2X2,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  LockKeyhole,
  Mail,
  MapPin,
  Menu,
  Plus,
  QrCode,
  RotateCcw,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  Ticket,
  TriangleAlert,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import {
  type CreateEventInput,
  type EventRecord,
  type GatePassStore,
  type MutationResult,
  type PassRecord,
  type Role,
  type VerificationResult,
  getEvent,
  getEventCheckInCount,
  getEventRegistrationCount,
  getMyPasses,
  initials,
} from './lib/types'
import {
  createEvent,
  loadStore,
  publishEvent,
  registerForEvent,
  revokePass,
  updateEvent,
  verifyAndCheckIn,
} from './lib/gatepassStore'
import {
  currentSession,
  loadProfile,
  signIn,
  signOut,
  signUp,
  supabase,
  supabaseConfigured,
  type AuthProfile,
} from './lib/supabase'
import './styles.css'

type AppView = 'dashboard' | 'events' | 'scanner' | 'passes' | 'settings'
type Toast = { kind: 'success' | 'error' | 'info'; message: string }

const navItems: Array<{ id: AppView; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'events', label: 'Events', icon: CalendarDays },
  { id: 'scanner', label: 'Door scanner', icon: ScanLine },
  { id: 'passes', label: 'Passes', icon: Ticket },
]

const roleMeta: Record<Role, { label: string; initials: string; description: string }> = {
  admin: { label: 'Admin', initials: 'AD', description: 'Run the room' },
  guest: { label: 'Guest', initials: 'GU', description: 'View your access' },
  vip: { label: 'VIP', initials: 'VP', description: 'Priority access' },
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

function viewFromPath(pathname: string): AppView {
  const match = pathname.match(/^\/app(?:\/(events|scanner|passes|settings))?\/?$/)
  const pathView = match?.[1]
  return pathView === 'events' || pathView === 'scanner' || pathView === 'passes' || pathView === 'settings' ? pathView : 'dashboard'
}

function Wordmark({ inverted = false, small = false }: { inverted?: boolean; small?: boolean }) {
  return <div className={`wordmark ${inverted ? 'inverted' : ''} ${small ? 'small' : ''}`}><span className="wordmark-glyph">⌁</span><span>GatePass</span></div>
}

function App() {
  const [authReady, setAuthReady] = useState(false)
  const [authOpen, setAuthOpen] = useState(window.location.pathname === '/auth' || window.location.pathname.startsWith('/app'))
  const [profile, setProfile] = useState<AuthProfile | null>(null)
  const [store, setStore] = useState<GatePassStore | null>(null)
  const [view, setView] = useState<AppView>(() => viewFromPath(window.location.pathname))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [authError, setAuthError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [eventDraft, setEventDraft] = useState<EventRecord | null>(null)
  const [scanQuery, setScanQuery] = useState('')
  const [scanResult, setScanResult] = useState<VerificationResult | null>(null)
  const [scannerEventId, setScannerEventId] = useState('')
  const [mutationBusy, setMutationBusy] = useState(false)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    let alive = true
    const hydrate = async (sessionUserId: string | null) => {
      if (!sessionUserId) {
        if (!alive) return
        setProfile(null)
        setStore(null)
        setAuthError('')
        setAuthReady(true)
        return
      }
      const result = await loadProfile(sessionUserId)
      if (!alive) return
      if (!result.profile) {
        setAuthError(result.error ?? 'Your profile could not be loaded.')
        setProfile(null)
        setStore(null)
        setAuthReady(true)
        return
      }
      try {
        const nextStore = await loadStore(result.profile)
        if (!alive) return
        setProfile(result.profile)
        setStore(nextStore)
        if (!scannerEventId && nextStore.events[0]) setScannerEventId(nextStore.events.find((event) => event.status !== 'draft')?.id ?? nextStore.events[0].id)
        setAuthError('')
        setAuthReady(true)
      } catch (error) {
        if (!alive) return
        setAuthError(error instanceof Error ? error.message : 'Your GatePass data could not be loaded.')
        setAuthReady(true)
      }
    }

    if (!supabaseConfigured || !supabase) {
      setAuthReady(true)
      return () => { alive = false }
    }
    currentSession().then((session) => hydrate(session?.user.id ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => hydrate(session?.user.id ?? null), 0)
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [])

  const openAuth = () => {
    setAuthOpen(true)
    window.history.replaceState({}, '', '/auth')
  }

  const handleSignedOut = async () => {
    const result = await signOut()
    if (!result.ok) setToast({ kind: 'error', message: result.message })
    setAuthOpen(false)
    window.history.replaceState({}, '', '/')
  }

  const navigate = (nextView: AppView) => {
    setView(nextView)
    setSidebarOpen(false)
    window.history.replaceState({}, '', `/app${nextView === 'dashboard' ? '' : `/${nextView}`}`)
  }

  const applyMutation = async (operation: Promise<MutationResult>) => {
    setMutationBusy(true)
    try {
      const result = await operation
      setStore(result.store)
      setToast({ kind: result.ok ? 'success' : 'error', message: result.message })
    } catch (error) {
      setToast({ kind: 'error', message: error instanceof Error ? error.message : 'The operation could not be completed.' })
    } finally {
      setMutationBusy(false)
    }
  }

  const handleEventSave = async (input: CreateEventInput) => {
    if (!store) return
    setMutationBusy(true)
    try {
      const next = eventDraft ? await updateEvent(store, eventDraft.id, input) : await createEvent(store, input)
      setStore(next)
      setCreateOpen(false)
      setEventDraft(null)
      setToast({ kind: 'success', message: eventDraft ? 'Event details updated.' : 'Draft event created.' })
    } catch (error) {
      setToast({ kind: 'error', message: error instanceof Error ? error.message : 'The event could not be saved.' })
    } finally {
      setMutationBusy(false)
    }
  }

  if (!authReady) return <AuthLoading />
  if (!supabaseConfigured) return <AuthConfiguration onOpenAuth={openAuth} />
  if (!profile || !store) return authOpen ? <AuthScreen initialMode="signin" initialError={authError} onBack={() => { setAuthOpen(false); window.history.replaceState({}, '', '/') }} /> : <Landing onOpenAuth={openAuth} />

  const isAdmin = store.session.role === 'admin'
  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
      <div className="sidebar-top"><Wordmark /><button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
      <div className="workspace-label"><span className="status-dot" /> Authenticated workspace</div>
      <nav className="sidebar-nav" aria-label="Primary navigation"><div className="nav-label">Workspace</div>{navItems.filter(({ id }) => id !== 'scanner' || isAdmin).map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => navigate(id)}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === 'scanner' && <span className="nav-pulse" />}</button>)}<div className="nav-label nav-label-spaced">Manage</div><button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings2 size={17} strokeWidth={1.8} /><span>Settings</span></button></nav>
      <div className="sidebar-bottom"><div className="operator-card"><div className={`avatar avatar-small ${store.session.role === 'vip' ? 'avatar-vip' : ''}`}>{roleMeta[store.session.role].initials}</div><div className="operator-copy"><strong>{store.session.name}</strong><span>{roleMeta[store.session.role].label} access</span></div><ChevronDown size={15} className="muted-icon" /></div><button className="sign-out" onClick={handleSignedOut}><LogOut size={15} /> Sign out</button></div>
    </aside>
    {sidebarOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <main className="main-area"><header className="topbar"><button className="icon-button menu-toggle" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><div className="topbar-crumb"><span>GatePass</span><span className="crumb-slash">/</span><strong>{navItems.find((item) => item.id === view)?.label ?? 'Settings'}</strong></div><div className="topbar-actions"><span className="system-status"><span className="status-dot" /> Authenticated</span><div className="identity-chip"><span className={`role-avatar ${store.session.role === 'vip' ? 'role-avatar-vip' : ''}`}>{roleMeta[store.session.role].initials}</span><span className="role-switch-copy"><small>{roleMeta[store.session.role].label} account</small><strong>{store.session.email}</strong></span></div></div></header>
      <div className="main-content">
        {view === 'dashboard' && <Dashboard store={store} onNavigate={navigate} onRegister={(eventId) => void applyMutation(registerForEvent(store, eventId))} />}
        {view === 'events' && <EventsView store={store} onRegister={(eventId) => void applyMutation(registerForEvent(store, eventId))} onCreate={() => { setEventDraft(null); setCreateOpen(true) }} onEdit={(event) => { setEventDraft(event); setCreateOpen(true) }} onPublish={(eventId) => void applyMutation(publishEvent(store, eventId))} />}
        {view === 'scanner' && isAdmin && <ScannerView store={store} eventId={scannerEventId || store.events[0]?.id || ''} onEventChange={setScannerEventId} query={scanQuery} result={scanResult} onQueryChange={setScanQuery} onVerify={(query, gate, eventId) => { setScanQuery(query); void verifyAndCheckIn(store, query, eventId, gate).then((result) => { setScanResult(result); if (result.ok) setStore(result.store) }).catch((error) => setScanResult({ ok: false, kind: 'invalid', message: error instanceof Error ? error.message : 'Verification failed.', store })) }} />}
        {view === 'passes' && <PassesView store={store} onRevoke={(passId) => void applyMutation(revokePass(store, passId))} />}
        {view === 'settings' && <SettingsView store={store} onSignOut={handleSignedOut} />}
      </div>
    </main>
    {createOpen && <CreateEventModal event={eventDraft ?? undefined} busy={mutationBusy} onClose={() => { setCreateOpen(false); setEventDraft(null) }} onCreate={(input) => void handleEventSave(input)} />}
    {toast && <ToastMessage toast={toast} onClose={() => setToast(null)} />}
  </div>
}

function AuthLoading() {
  return <div className="auth-state"><LoaderCircle className="spin" size={25} /><span>Restoring your GatePass session…</span></div>
}

function AuthConfiguration({ onOpenAuth }: { onOpenAuth: () => void }) {
  return <div className="auth-state auth-state-dark"><Wordmark inverted /><div className="auth-state-card"><span className="eyebrow"><span className="eyebrow-mark" /> AUTHENTICATION REQUIRED</span><h1>Connect the room to Supabase.</h1><p>This build has no fallback accounts. Configure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to enable real email-and-password authentication.</p><button className="button button-lime" onClick={onOpenAuth}>Open sign in</button><a href="/setup/">Read secure setup notes <ArrowUpRight size={15} /></a></div></div>
}

function AuthScreen({ initialMode, initialError = '', onBack }: { initialMode: 'signin' | 'signup'; initialError?: string; onBack: () => void }) {
  const [mode, setMode] = useState(initialMode)
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError)
  const [notice, setNotice] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!email.includes('@')) return setError('Enter a valid email address.')
    if (password.length < 8) return setError('Use a password with at least 8 characters.')
    if (mode === 'signup' && !displayName.trim()) return setError('Enter your name.')
    if (mode === 'signup' && password !== confirmPassword) return setError('Passwords do not match.')
    setBusy(true)
    const result = mode === 'signin' ? await signIn(email, password) : await signUp(displayName, email, password)
    setBusy(false)
    if (!result.ok) return setError(result.message)
    if (result.session) return
    setNotice(result.message)
    setMode('signin')
    setPassword('')
    setConfirmPassword('')
  }

  return <div className="auth-page"><div className="auth-backdrop"><div className="auth-orbit" /></div><div className="auth-shell"><div className="auth-brand"><Wordmark inverted /><button className="text-link" onClick={onBack}>Back to landing <ArrowUpRight size={15} /></button></div><div className="auth-card"><div className="auth-card-heading"><span className="eyebrow dark-eyebrow">GATEPASS / {mode === 'signin' ? '01' : '02'}</span><h1>{mode === 'signin' ? 'Your pass starts here.' : 'Make room for access.'}</h1><p>{mode === 'signin' ? 'Sign in with the account assigned to your GatePass profile.' : 'Create a Guest account. Admin and VIP access can only be assigned by an authorized administrator.'}</p></div><div className="auth-tabs"><button className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setError(''); setNotice('') }}>Sign in</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); setNotice('') }}>Sign up</button></div><form className="auth-form" onSubmit={submit}>{mode === 'signup' && <label className="field"><span>Full name</span><div className="input-with-icon"><UserRound size={16} /><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" /></div></label>}<label className="field"><span>Email</span><div className="input-with-icon"><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></div></label><label className="field"><span>Password</span><div className="input-with-icon"><LockKeyhole size={16} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} /></div></label>{mode === 'signup' && <label className="field"><span>Confirm password</span><div className="input-with-icon"><LockKeyhole size={16} /><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></div></label>}{error && <div className="auth-message auth-message-error" role="alert"><TriangleAlert size={16} />{error}</div>}{notice && <div className="auth-message auth-message-success" role="status"><CircleCheck size={16} />{notice}</div>}<button className="button button-dark auth-submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={16} /> Working…</> : mode === 'signin' ? 'Sign in' : 'Create Guest account'} <ArrowUpRight size={16} /></button></form><p className="auth-footnote"><ShieldCheck size={14} /> Your role is read from the protected profile record. It cannot be chosen in this form.</p></div></div></div>
}

function Landing({ onOpenAuth }: { onOpenAuth: () => void }) {
  return <div className="landing-page"><header className="landing-nav page-width"><Wordmark inverted /><div className="landing-nav-right"><span className="nav-note">Event access, without the noise.</span><button className="text-link" onClick={onOpenAuth}>Sign in <ArrowUpRight size={15} /></button></div></header><main><section className="hero page-width"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-mark" /> ACCESS CONTROL / 01</div><h1>The room is ready<span className="lime-period">.</span></h1><p className="hero-lede">GatePass turns event access into a quiet, precise operation — from the first registration to the last check-in.</p><div className="hero-actions"><button className="button button-lime" onClick={onOpenAuth}>Sign in to GatePass <ArrowUpRight size={17} /></button><button className="button button-ghost-light" onClick={onOpenAuth}>Create an account</button></div><p className="hero-footnote"><ShieldCheck size={14} /> Secure email-and-password access</p></div><div className="hero-visual" aria-label="GatePass access preview"><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="access-card"><div className="access-card-top"><span>ENTRY / 001</span><span className="access-live"><span className="status-dot lime-dot" /> LIVE</span></div><div className="access-mark"><span>GP</span></div><div className="access-card-body"><span className="micro-label">CURRENT ROOM</span><h2>The Quiet<br />Signal</h2><div className="access-meta"><span><CalendarDays size={14} /> 24 OCT 2026</span><span><MapPin size={14} /> ATRIUM 06</span></div></div><div className="access-card-footer"><div><span className="micro-label">STATUS</span><strong>Doors open in 07 days</strong></div><ArrowUpRight size={18} /></div></div><div className="floating-stamp"><CircleCheck size={16} /><span>PASS<br /><strong>VERIFIED</strong></span></div><div className="hero-index">GP / <strong>2026</strong></div></div></section><section className="landing-rule page-width"><div><span className="rule-number">01</span><span>One pass. One entry. No ambiguity.</span></div><div className="rule-end">SECURE ACCESS <span>↓</span></div></section><section className="landing-benefits page-width"><div className="benefit-intro"><span className="eyebrow">BUILT FOR THE DOOR</span><h2>Every detail<br /><em>has a job.</em></h2></div><div className="benefit-grid"><Benefit number="01" icon={<Ticket size={19} />} title="Digital passes" copy="Persistent tickets with unique access codes, role-aware privileges, and no paper trail." /><Benefit number="02" icon={<ScanLine size={19} />} title="Calm check-in" copy="A focused scanner for the moment that matters. Invalid, used, or revoked never gets through." /><Benefit number="03" icon={<Grid2X2 size={19} />} title="One clear view" copy="Registration, attendance, and capacity pulled from the same source of truth." /></div></section><section className="landing-cta page-width"><div><span className="eyebrow">READY WHEN YOU ARE</span><h2>Make the door<br /><span>feel effortless.</span></h2></div><button className="button button-dark" onClick={onOpenAuth}>Open GatePass <ArrowUpRight size={17} /></button></section></main><footer className="landing-footer page-width"><Wordmark inverted small /><span>© 2026 GatePass Systems / Secure build</span><span>MANIFEST / 001</span></footer></div>
}

function Benefit({ number, icon, title, copy }: { number: string; icon: React.ReactNode; title: string; copy: string }) {
  return <article className="benefit"><div className="benefit-top"><span>{number}</span><span className="benefit-icon">{icon}</span></div><h3>{title}</h3><p>{copy}</p><ArrowUpRight className="benefit-arrow" size={17} /></article>
}

function Dashboard({ store, onNavigate, onRegister }: { store: GatePassStore; onNavigate: (view: AppView) => void; onRegister: (eventId: string) => void }) {
  const isAdmin = store.session.role === 'admin'
  const isVip = store.session.role === 'vip'
  const featured = store.events.find((event) => event.status === 'live') ?? store.events[0]
  const myPasses = getMyPasses(store)
  const registrations = store.registrations.filter((item) => item.status === 'confirmed')
  const checkIns = store.checkIns.length
  if (!featured) return <div className="view-stack">
    <PageHeader eyebrow={isAdmin ? 'OPERATIONS / READY' : `${roleMeta[store.session.role].label.toUpperCase()} ACCESS`} title={isAdmin ? 'The room is waiting.' : 'No events yet.'} description={isAdmin ? 'Create or publish an event to give this workspace a room to operate.' : 'Published events will appear here once an organizer opens the room.'} action={isAdmin ? <button className="button button-dark small-button" onClick={() => onNavigate('events')}><Plus size={16} /> Create an event</button> : <button className="button button-dark small-button" onClick={() => onNavigate('events')}><CalendarDays size={16} /> Browse events</button>} />
    <section className="panel empty-panel dashboard-empty-state"><div className="empty-ring"><CalendarDays size={24} /></div><h3>{isAdmin ? 'No event has been created.' : 'Nothing is open for registration.'}</h3><p>{isAdmin ? 'The dashboard will show capacity, registrations, and attendance after the first event exists.' : 'There is no missing pass or broken session here — the account simply has no published event to display yet.'}</p></section>
  </div>
  const liveRegistrations = getEventRegistrationCount(store, featured.id)
  const featuredPass = myPasses.find((pass) => pass.eventId === featured.id)

  return <div className="view-stack">
    <PageHeader eyebrow={isAdmin ? 'OPERATIONS / SATURDAY' : `${roleMeta[store.session.role].label.toUpperCase()} ACCESS`} title={isAdmin ? `Good morning, ${store.session.name.split(' ')[0]}.` : `Your access, ${store.session.name.split(' ')[0]}.`} description={isAdmin ? 'The room is quiet. Here is what needs your attention.' : isVip ? 'Your priority access is confirmed. Keep this pass close.' : 'Your events and passes, in one calm place.'} action={isAdmin ? <button className="button button-dark small-button" onClick={() => onNavigate('scanner')}><ScanLine size={16} /> Open scanner</button> : <button className="button button-dark small-button" onClick={() => onNavigate('events')}><Plus size={16} /> Find an event</button>} />
    {isAdmin ? <>
      <div className="dashboard-hero admin-hero"><div className="hero-event-copy"><div className="mini-tag lime-tag"><span className="status-dot" /> NEXT UP</div><h2>{featured.title}</h2><p>{featured.description}</p><div className="hero-event-meta"><span><CalendarDays size={15} /> {featured.dateLabel}</span><span><Clock3 size={15} /> {featured.timeLabel}</span><span><MapPin size={15} /> {featured.venue}</span></div></div><div className="hero-event-side"><span className="micro-label">LIVE CAPACITY</span><strong>{liveRegistrations}<small> / {featured.capacity}</small></strong><div className="capacity-track"><span style={{ width: `${Math.max(6, (liveRegistrations / featured.capacity) * 100)}%` }} /></div><button className="inline-action" onClick={() => onNavigate('events')}>Manage event <ArrowUpRight size={15} /></button></div></div>
      <div className="stat-grid"><Stat label="Registrations" value={String(registrations.length).padStart(2, '0')} note="across all events" icon={<Users size={17} />} /><Stat label="Checked in" value={String(checkIns).padStart(2, '0')} note="all events · current data" icon={<ClipboardCheck size={17} />} /><Stat label="Open capacity" value={`${Math.max(0, featured.capacity - liveRegistrations)}`} note="remaining for next up" icon={<DoorOpen size={17} />} /><Stat label="Active passes" value={String(store.passes.filter((pass) => !pass.revokedAt).length).padStart(2, '0')} note="persistent access records" icon={<ShieldCheck size={17} />} positive /></div>
      <div className="split-grid"><section className="panel event-list-panel"><PanelHeading label="UPCOMING EVENTS" action="View all" onAction={() => onNavigate('events')} /><div className="event-list">{store.events.map((event) => <EventRow key={event.id} event={event} store={store} admin onNavigate={onNavigate} />)}</div></section><ActivityFeed store={store} /></div>
    </> : <>
      <div className={`dashboard-hero personal-hero ${isVip ? 'vip-hero' : ''}`}><div className="hero-event-copy"><div className={`mini-tag ${isVip ? 'dark-tag' : 'lime-tag'}`}>{isVip ? 'VIP ACCESS' : 'YOUR NEXT EVENT'}</div><h2>{featured.title}</h2><p>{isVip ? 'Priority entry, front-row access, and a guest lounge wristband are attached to your pass.' : 'Your entry is confirmed. Show your pass at North Gate when doors open.'}</p><div className="hero-event-meta"><span><CalendarDays size={15} /> {featured.dateLabel}</span><span><Clock3 size={15} /> {featured.timeLabel}</span><span><MapPin size={15} /> {featured.venue}</span></div></div><div className="personal-pass-teaser">{featuredPass ? <><div className="pass-teaser-top"><span>ACTIVE PASS</span><CircleCheck size={17} /></div><QrMark token={featuredPass.token} small /><strong>{featuredPass.token}</strong><button className="inline-action" onClick={() => onNavigate('passes')}>Open full pass <ArrowUpRight size={15} /></button></> : <><Ticket size={28} /><span>No pass for this room yet.</span><button className="button button-lime small-button" onClick={() => onRegister(featured.id)}>Register now</button></>}</div></div>
      <div className="stat-grid"><Stat label="My passes" value={String(myPasses.length).padStart(2, '0')} note="active access records" icon={<Ticket size={17} />} /><Stat label="Events open" value={String(store.events.filter((event) => event.status !== 'draft').length).padStart(2, '0')} note="ready to explore" icon={<CalendarDays size={17} />} /><Stat label="Access level" value={isVip ? 'VIP' : 'GUEST'} note={isVip ? 'priority privileges' : 'general admission'} icon={<ShieldCheck size={17} />} positive={isVip} /></div>
      <div className="split-grid"><section className="panel event-list-panel"><PanelHeading label="EXPLORE EVENTS" action="Browse all" onAction={() => onNavigate('events')} /><div className="event-list">{store.events.map((event) => <EventRow key={event.id} event={event} store={store} onRegister={onRegister} />)}</div></section><ActivityFeed store={store} personal /></div>
    </>}
    {isAdmin && <section className="panel attention-strip"><div className="attention-icon"><TriangleAlert size={17} /></div><div><strong>Scanner is ready for the door team.</strong><span>Run a test pass before the first guest arrives.</span></div><button className="inline-action" onClick={() => onNavigate('scanner')}>Test a pass <ArrowUpRight size={15} /></button></section>}
    {!isAdmin && myPasses.length > 0 && <section className="panel pass-strip"><div className="strip-icon"><QrCode size={18} /></div><div><strong>Your pass is persistent and ready.</strong><span>It lives here until the event is over — no download required.</span></div><button className="inline-action" onClick={() => onNavigate('passes')}>View passes <ArrowUpRight size={15} /></button></section>}
  </div>
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-header"><div><div className="eyebrow dark-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="page-header-action">{action}</div>}</div>
}

function Stat({ label, value, note, icon, positive = false }: { label: string; value: string; note: string; icon: React.ReactNode; positive?: boolean }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${positive ? 'positive' : ''}`}>{icon}</span></div><strong>{value}</strong><small>{note}</small></div>
}

function PanelHeading({ label, action, onAction }: { label: string; action?: string; onAction?: () => void }) {
  return <div className="panel-heading"><span className="micro-label">{label}</span>{action && <button className="panel-action" onClick={onAction}>{action} <ArrowUpRight size={14} /></button>}</div>
}

function EventRow({ event, store, admin = false, onNavigate, onRegister }: { event: EventRecord; store: GatePassStore; admin?: boolean; onNavigate?: (view: AppView) => void; onRegister?: (eventId: string) => void }) {
  const count = getEventRegistrationCount(store, event.id)
  const myPass = store.passes.find((pass) => pass.eventId === event.id && pass.holderEmail === store.session.email && !pass.revokedAt)
  return <div className="event-row"><div className={`event-date event-date-${event.accent}`}><strong>{event.dateLabel.split(' ')[0]}</strong><span>{event.dateLabel.split(' ')[1]}</span></div><div className="event-row-main"><div className="event-row-title"><strong>{event.title}</strong><span className={`status-badge ${event.status}`}>{event.status}</span></div><span>{event.venue} <i>·</i> {event.city} <i>·</i> {event.timeLabel}</span></div><div className="event-row-meta"><span>{count}/{event.capacity}</span><small>registered</small></div>{admin ? <button className="icon-button row-arrow" aria-label={`Manage ${event.title}`} onClick={() => onNavigate?.('events')}><ArrowUpRight size={16} /></button> : myPass ? <span className="row-confirmed"><Check size={14} /> Pass ready</span> : <button className="row-register" onClick={() => onRegister?.(event.id)}>Register <ArrowUpRight size={14} /></button>}</div>
}

function ActivityFeed({ store, personal = false }: { store: GatePassStore; personal?: boolean }) {
  const logs = personal ? store.auditLogs.filter((log) => log.actor === store.session.name || log.action === 'Event published').slice(0, 4) : store.auditLogs.slice(0, 4)
  return <section className="panel activity-panel"><PanelHeading label={personal ? 'YOUR ACTIVITY' : 'RECENT ACTIVITY'} /><div className="activity-list">{logs.map((log) => <div className="activity-item" key={log.id}><span className={`activity-mark ${log.tone}`} /> <div><strong>{log.action}</strong><span>{log.detail}</span></div><time>{formatTime(log.at)}</time></div>)}</div>{logs.length === 0 && <EmptyState text="No activity recorded yet." />}</section>
}

function EventsView({ store, onRegister, onCreate, onEdit, onPublish }: { store: GatePassStore; onRegister: (eventId: string) => void; onCreate: () => void; onEdit: (event: EventRecord) => void; onPublish: (eventId: string) => void }) {
  const admin = store.session.role === 'admin'
  const visibleEvents = admin ? store.events : store.events.filter((event) => event.status !== 'draft')
  return <div className="view-stack"><PageHeader eyebrow="EVENT LEDGER / ALL ROOMS" title="Events" description={admin ? 'Shape the room before the guests arrive.' : 'Find your next room and claim a pass.'} action={admin ? <button className="button button-dark small-button" onClick={onCreate}><Plus size={16} /> Create event</button> : <div className="search-field"><Search size={16} /><input placeholder="Search events" aria-label="Search events" /></div>} /><div className="filter-row"><span className="filter-label">SHOWING</span><button className="filter-chip active">All events <span>{visibleEvents.length}</span></button><button className="filter-chip">Live <span>{visibleEvents.filter((event) => event.status === 'live').length}</span></button><button className="filter-chip">Upcoming <span>{visibleEvents.filter((event) => event.status === 'upcoming').length}</span></button>{admin && <button className="filter-chip">Drafts <span>{store.events.filter((event) => event.status === 'draft').length}</span></button>}</div><section className="events-table panel"><div className="table-head"><span>EVENT</span><span>DATE / PLACE</span><span>CAPACITY</span><span>STATUS</span><span /></div>{visibleEvents.map((event) => <EventTableRow key={event.id} event={event} store={store} admin={admin} onRegister={onRegister} onEdit={onEdit} onPublish={onPublish} />)}</section><div className="info-note"><ShieldCheck size={16} /><span>Every registration creates one persistent pass record. Capacity and duplicate checks are enforced by the database RPC and RLS policies.</span></div></div>
}

function EventTableRow({ event, store, admin, onRegister, onEdit, onPublish }: { event: EventRecord; store: GatePassStore; admin: boolean; onRegister: (eventId: string) => void; onEdit: (event: EventRecord) => void; onPublish: (eventId: string) => void }) {
  const count = getEventRegistrationCount(store, event.id)
  const myPass = store.passes.find((pass) => pass.eventId === event.id && pass.holderEmail === store.session.email && !pass.revokedAt)
  return <div className="table-row"><div className="table-event-name"><span className={`event-swatch ${event.accent}`} /><div><strong>{event.title}</strong><small>{event.tag}</small></div></div><div><strong>{event.dateLabel}</strong><small>{event.venue} · {event.city}</small></div><div className="table-capacity"><strong>{count}<small> / {event.capacity}</small></strong><div className="capacity-track"><span style={{ width: `${Math.max(5, (count / event.capacity) * 100)}%` }} /></div></div><div><span className={`status-badge ${event.status}`}>{event.status}</span></div><div>{admin ? <button className="table-action" onClick={() => event.status === 'draft' ? onPublish(event.id) : onEdit(event)}>{event.status === 'draft' ? 'Publish' : 'Edit'} <ArrowUpRight size={14} /></button> : myPass ? <span className="row-confirmed"><Check size={14} /> Ready</span> : <button className="table-action" onClick={() => onRegister(event.id)}>Register <ArrowUpRight size={14} /></button>}</div></div>
}

function ScannerView({ store, eventId, onEventChange, query, result, onQueryChange, onVerify }: { store: GatePassStore; eventId: string; onEventChange: (eventId: string) => void; query: string; result: VerificationResult | null; onQueryChange: (value: string) => void; onVerify: (value: string, gate: string, eventId: string) => void }) {
  const event = getEvent(store, eventId) ?? store.events[0]
  const [selectedGate, setSelectedGate] = useState('North Gate')
  if (!event) return <div className="view-stack scanner-page"><PageHeader eyebrow="DOOR OPERATIONS / WAITING" title="No event to scan." description="The scanner becomes available after an event is created and published." /><section className="panel empty-panel dashboard-empty-state"><div className="empty-ring"><ScanLine size={24} /></div><h3>There is no active event.</h3><p>Nothing is wrong with the scanner session. Create or publish an event before opening the door.</p></section></div>
  const checkInCount = getEventCheckInCount(store, event.id)
  return <div className="view-stack scanner-page"><PageHeader eyebrow="DOOR OPERATIONS / NORTH GATE" title="Scanner" description="Verify a pass before it reaches the room." action={<label className="scanner-event-select"><span className="micro-label">ACTIVE EVENT</span><select value={event.id} onChange={(eventSelect) => onEventChange(eventSelect.target.value)}>{store.events.filter((item) => item.status !== 'draft').map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><ChevronDown size={15} /></label>} /><div className="scanner-layout"><section className="scanner-stage panel"><div className="scanner-stage-top"><span className="mini-tag lime-tag"><span className="status-dot" /> SCANNER LIVE</span><span className="scanner-counter">{checkInCount} checked in today</span></div><div className="scan-frame"><div className="scan-corner corner-tl" /><div className="scan-corner corner-tr" /><div className="scan-corner corner-bl" /><div className="scan-corner corner-br" /><ScanLine className="scan-line-icon" size={42} strokeWidth={1.2} /><div className="scan-pulse" /></div><p className="scanner-instruction">QR-style scan ready for manual demo<br /><span>or use manual lookup below.</span></p><form className="manual-lookup" onSubmit={(eventForm) => { eventForm.preventDefault(); onVerify(query, selectedGate, event.id) }}><label><Search size={16} /><input value={query} onChange={(eventInput) => onQueryChange(eventInput.target.value)} placeholder="Enter pass code, e.g. GP-QUIET-7K4M" aria-label="Pass code" /></label><button className="button button-dark" type="submit">Verify <ArrowUpRight size={16} /></button></form><div className="scanner-shortcuts"><span>TRY A DEMO CODE</span>{store.passes.slice(0, 2).map((pass) => <button key={pass.id} onClick={() => onVerify(pass.token, selectedGate, event.id)}>{pass.role === 'vip' ? 'VIP pass' : 'Valid pass'} <QrCode size={13} /></button>)}</div></section><section className="verification-panel"><div className="panel-heading"><span className="micro-label">VERIFICATION RESULT</span><button className="icon-button" onClick={() => onQueryChange('')} aria-label="Clear lookup"><RotateCcw size={15} /></button></div>{result ? <VerificationResultCard result={result} /> : <div className="verification-empty"><div className="empty-ring"><QrCode size={25} /></div><h3>Ready when you are.</h3><p>Scan or enter a pass code to see the access decision here.</p><div className="gate-control"><span className="micro-label">CHECK-IN GATE</span><select value={selectedGate} onChange={(eventSelect) => setSelectedGate(eventSelect.target.value)}><option>North Gate</option><option>South Gate</option><option>VIP Entrance</option></select></div></div>}</section></div><div className="scanner-footnote"><ShieldCheck size={15} /><span>Every check-in is written once against the pass record. A repeated scan is rejected, not overwritten.</span></div></div>
}

function VerificationResultCard({ result }: { result: VerificationResult }) {
  const success = result.ok
  return <div className={`verification-result ${success ? 'result-success' : 'result-failure'}`}><div className="result-icon">{success ? <CircleCheck size={25} /> : <TriangleAlert size={25} />}</div><span className="micro-label">{success ? 'ACCESS GRANTED' : 'ENTRY DENIED'}</span><h3>{result.message}</h3>{result.pass ? <div className="result-pass"><QrMark token={result.pass.token} small /><div><strong>{result.pass.holderName}</strong><span>{result.pass.role === 'vip' ? 'VIP access' : 'General access'} · {result.pass.privilege}</span><code>{result.pass.token}</code></div></div> : <p>Check the code and try again. The door should never have to guess.</p>}<div className="result-rule"><span>EVENT</span><strong>{result.pass ? 'The Quiet Signal' : 'No matching record'}</strong></div></div>
}

function PassesView({ store, onRevoke }: { store: GatePassStore; onRevoke: (passId: string) => void }) {
  const admin = store.session.role === 'admin'
  const passes = admin ? store.passes : getMyPasses(store)
  return <div className="view-stack"><PageHeader eyebrow={admin ? 'ACCESS LEDGER / ALL PASSES' : 'YOUR ACCESS / DIGITAL PASSES'} title={admin ? 'Passes' : 'Your passes'} description={admin ? 'Every entry record, clearly accounted for.' : 'Persistent tickets for the rooms you have claimed.'} action={admin ? <div className="search-field"><Search size={16} /><input placeholder="Search by guest or token" aria-label="Search passes" /></div> : undefined} />{passes.length === 0 ? <section className="panel empty-panel"><div className="empty-ring"><Ticket size={24} /></div><h3>No active passes yet.</h3><p>Browse an event to claim your place in the room.</p></section> : admin ? <AdminPassTable store={store} passes={passes} onRevoke={onRevoke} /> : <div className="pass-grid">{passes.map((pass) => <DigitalPass key={pass.id} pass={pass} event={getEvent(store, pass.eventId)} admin={false} />)}</div>}<div className="info-note"><ShieldCheck size={16} /><span>Passes are tied to the holder identity shown on this screen. In production, the same ownership rule is enforced by RLS.</span></div></div>
}

function AdminPassTable({ store, passes, onRevoke }: { store: GatePassStore; passes: PassRecord[]; onRevoke: (passId: string) => void }) {
  return <section className="passes-table panel"><div className="table-head"><span>HOLDER</span><span>EVENT</span><span>PRIVILEGE</span><span>STATUS</span><span /></div>{passes.map((pass) => { const event = getEvent(store, pass.eventId); const checked = store.checkIns.some((checkIn) => checkIn.passId === pass.id); return <div className="table-row pass-table-row" key={pass.id}><div className="table-event-name"><span className={`avatar avatar-small ${pass.role === 'vip' ? 'avatar-vip' : ''}`}>{initials(pass.holderName)}</span><div><strong>{pass.holderName}</strong><small>{pass.holderEmail}</small></div></div><div><strong>{event?.title ?? 'Unknown event'}</strong><small>{pass.token}</small></div><div><span className="privilege-label">{pass.role === 'vip' ? 'VIP' : 'General'}</span><small>{pass.privilege}</small></div><div><span className={`status-badge ${pass.revokedAt ? 'revoked' : checked ? 'used' : 'confirmed'}`}>{pass.revokedAt ? 'revoked' : checked ? 'used' : 'active'}</span></div><div>{!pass.revokedAt && !checked && <button className="table-action danger-action" onClick={() => onRevoke(pass.id)}>Revoke <X size={14} /></button>}</div></div> })}</section>
}

function DigitalPass({ pass, event, admin }: { pass: PassRecord; event?: EventRecord; admin: boolean }) {
  return <article className={`digital-pass ${pass.role === 'vip' ? 'vip-pass' : ''}`}><div className="ticket-main"><div className="ticket-top"><Wordmark small /><span className={`mini-tag ${pass.role === 'vip' ? 'dark-tag' : 'lime-tag'}`}>{pass.role === 'vip' ? 'VIP ACCESS' : 'GENERAL ACCESS'}</span></div><div className="ticket-title"><span className="micro-label">DIGITAL PASS / {event?.dateLabel ?? 'EVENT'}</span><h2>{event?.title ?? 'Event access'}</h2><p>{event?.venue} · {event?.city}</p></div><div className="ticket-holder"><span className="micro-label">PASS HOLDER</span><strong>{pass.holderName}</strong><span>{pass.privilege}</span></div><div className="ticket-bottom"><span><CalendarDays size={14} /> {event?.dateLabel}</span><span><Clock3 size={14} /> {event?.timeLabel}</span><span><DoorOpen size={14} /> North Gate</span></div></div><div className="ticket-stub"><QrMark token={pass.token} /><code>{pass.token}</code><span className="stub-note">SCAN AT ENTRY</span></div>{admin && <div className="ticket-admin-note">Admin preview</div>}</article>
}

function QrMark({ token, small = false }: { token: string; small?: boolean }) {
  const cells = Array.from({ length: 81 }, (_, index) => {
    const finder = (x: number, y: number) => (x < 7 && y < 7) || (x > 9 && y < 7) || (x < 7 && y > 9)
    const x = index % 9
    const y = Math.floor(index / 9)
    if (finder(x, y)) {
      const fx = x > 9 ? x - 10 : x
      const fy = y > 9 ? y - 10 : y
      return fx === 0 || fy === 0 || fx === 6 || fy === 6 || (fx > 1 && fx < 5 && fy > 1 && fy < 5)
    }
    return ((token.charCodeAt(index % token.length) + index * 13) % 7) < 3
  })
  return <div className={`qr-mark ${small ? 'small-qr' : ''}`} aria-label={`QR code for ${token}`}>{cells.map((active, index) => <span className={active ? 'active' : ''} key={`${token}-${index}`} />)}</div>
}

function SettingsView({ store, onSignOut }: { store: GatePassStore; onSignOut: () => void }) {
  return <div className="view-stack"><PageHeader eyebrow="SYSTEM / ACCOUNT SECURITY" title="Settings" description="Your access is governed by the authenticated profile returned by Supabase." /><section className="settings-layout"><div className="settings-main panel"><div className="settings-header"><div><span className="micro-label">CURRENT SESSION</span><h2>{store.session.name}</h2><p>{store.session.email} · {roleMeta[store.session.role].label} access. Session persistence and token refresh are managed by Supabase Auth.</p></div><span className="mode-badge"><span className="status-dot" /> SECURE</span></div><div className="settings-rows"><div className="settings-row"><div><strong>Authenticated identity</strong><span>All registrations, passes, and check-ins resolve to your Supabase user ID.</span></div><span className="ready-label"><Check size={14} /> Active</span></div><div className="settings-row"><div><strong>Role authorization</strong><span>Role is read from the protected profiles table; signup always creates Guest access.</span></div><span className="ready-label"><ShieldCheck size={14} /> RLS</span></div><div className="settings-row"><div><strong>Database</strong><span>Events, registrations, passes, check-ins, and audit entries come from Supabase.</span></div><span className="ready-label"><Check size={14} /> Connected</span></div></div><div className="settings-danger"><div><strong>End this session</strong><span>Sign out clears the Supabase browser session and returns you to the public landing page.</span></div><button className="button button-outline-danger" onClick={onSignOut}><LogOut size={15} /> Sign out</button></div></div><aside className="settings-side"><div className="settings-side-mark"><ShieldCheck size={22} /></div><span className="micro-label">ROLE POLICY</span><h3>Access follows the profile.</h3><p>Admin and VIP promotion happens through an authorized administrator or the secure first-admin setup step. It is never selectable during signup.</p><button className="inline-action" onClick={() => window.open('/setup/', '_blank')}>Open setup notes <ArrowUpRight size={15} /></button></aside></section></div>
}

function CreateEventModal({ event, busy, onClose, onCreate }: { event?: EventRecord; busy: boolean; onClose: () => void; onCreate: (input: CreateEventInput) => void }) {
  const [form, setForm] = useState<CreateEventInput>(() => event ? { title: event.title, date: event.date, dateLabel: event.dateLabel, timeLabel: event.timeLabel, venue: event.venue, city: event.city, capacity: event.capacity, tag: event.tag, accent: event.accent, description: event.description } : { title: '', date: '2026-12-01', dateLabel: '01 DEC 2026', timeLabel: '18:00 — 22:00', venue: '', city: '', capacity: 100, tag: 'New listing', accent: 'sage', description: '' })
  const update = (key: keyof CreateEventInput, value: string | number) => setForm((current) => ({ ...current, [key]: key === 'capacity' ? Number(value) : value }))
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Create event"><div className="modal"><div className="modal-top"><div><span className="eyebrow dark-eyebrow">EVENT BUILDER / 01</span><h2>{event ? 'Edit event' : 'Create an event'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close modal"><X size={19} /></button></div><p className="modal-intro">Start with the details guests need at the door. You can publish the draft from the event ledger.</p><div className="form-grid"><label className="field full"><span>Event name</span><input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="e.g. The Long Table" autoFocus /></label><label className="field"><span>Date</span><input type="date" value={form.date} onChange={(event) => update('date', event.target.value)} /></label><label className="field"><span>Time</span><input value={form.timeLabel} onChange={(event) => update('timeLabel', event.target.value)} /></label><label className="field"><span>Venue</span><input value={form.venue} onChange={(event) => update('venue', event.target.value)} placeholder="Venue name" /></label><label className="field"><span>City</span><input value={form.city} onChange={(event) => update('city', event.target.value)} placeholder="City · postcode" /></label><label className="field"><span>Capacity</span><input type="number" min="1" value={form.capacity} onChange={(event) => update('capacity', event.target.value)} /></label><label className="field"><span>Accent</span><select value={form.accent} onChange={(event) => update('accent', event.target.value)}><option value="sage">Sage</option><option value="lime">Lime</option><option value="coral">Coral</option><option value="pine">Pine</option></select></label><label className="field full"><span>Description</span><textarea value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="One line guests will remember." rows={3} /></label></div><div className="modal-actions"><button className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-dark" disabled={busy || !form.title || !form.venue} onClick={() => onCreate({ ...form, dateLabel: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${form.date}T12:00:00`)).toUpperCase() })}>{busy ? <><LoaderCircle className="spin" size={16} /> Saving…</> : event ? 'Save changes' : 'Create draft'} <ArrowUpRight size={16} /></button></div></div></div>
}

function ToastMessage({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  return <div className={`toast toast-${toast.kind}`} role="status"><span className="toast-icon">{toast.kind === 'success' ? <Check size={16} /> : toast.kind === 'error' ? <TriangleAlert size={16} /> : <ShieldCheck size={16} />}</span><span>{toast.message}</span><button onClick={onClose} aria-label="Dismiss notification"><X size={14} /></button></div>
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><CircleCheck size={16} /><span>{text}</span></div>
}

export default App
