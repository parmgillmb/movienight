import { AnimatePresence, motion } from 'framer-motion'
import {
  CalendarDays,
  Clock3,
  Edit3,
  Film,
  House,
  Lock,
  Plus,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Ambience from './Ambience'

type AttendanceStatus = 'yes' | 'maybe' | 'no' | ''

type MovieSuggestion = {
  id: string
  title: string
  favorite: boolean
}

type Friend = {
  id: string
  name: string
  status: AttendanceStatus
  arrivalTime: string
  comments: string
  movies: MovieSuggestion[]
}

type MovieNightDetails = {
  title: string
  date: string
  plannedStartTime: string
  location: string
  host: string
  notes: string
}



type MovieVote = {
  wantToWatch: boolean
  notInterested: boolean
  favorite: boolean
}

type AppState = {
  details: MovieNightDetails
  friends: Friend[]
  movieVotes: Record<string, MovieVote>
}

const generateArrivalOptions = () => {
  const out: string[] = []
  // 12:00 PM (12:00) to 9:00 PM (21:00) every 30 minutes
  for (let h = 12; h <= 21; h++) {
    out.push(`${h % 12 === 0 ? 12 : h % 12}:00 ${h >= 12 ? 'PM' : 'AM'}`)
    if (!(h === 21)) out.push(`${h % 12 === 0 ? 12 : h % 12}:30 ${h >= 12 ? 'PM' : 'AM'}`)
  }
  return out
}
const ARRIVAL_OPTIONS = generateArrivalOptions()

const FRIENDS = ['Nik', 'Sebastian', 'Mattias', 'Robbie', 'Ethan', 'Cam', 'Parmeet', 'Raph', 'Aiden']

const createId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

// Note: this is a convenience gate, not real security — the PIN ships in the
// client bundle. It stops accidental edits, not a determined visitor.
const ADMIN_PIN = '5280'

const STATUS_COLOR: Record<Exclude<AttendanceStatus, ''>, string> = {
  yes: '#22c55e',
  maybe: '#3b82f6',
  no: '#ef4444',
}

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  yes: 'Going',
  maybe: 'Maybe',
  no: "Can't",
  '': 'No reply',
}

const avatarColor = (status: AttendanceStatus) => (status ? STATUS_COLOR[status] : 'rgba(255,255,255,0.18)')

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

const formatTimeInputLabel = (value: string) => {
  const [hourRaw, minuteRaw] = value.split(':')
  let hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  const period = hour >= 12 ? 'PM' : 'AM'
  hour %= 12
  if (hour === 0) hour = 12
  return `${hour}:${String(minute).padStart(2, '0')} ${period}`
}

const toMinutes = (value: string) => {
  const [time, period] = value.split(' ')
  const [hourRaw, minuteRaw] = time.split(':')
  let hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if (period === 'PM' && hour !== 12) hour += 12
  if (period === 'AM' && hour === 12) hour = 0
  return hour * 60 + minute
}

const fromMinutes = (value: number) => {
  const hour24 = Math.floor(value / 60)
  const minute = value % 60
  const period = hour24 >= 12 ? 'PM' : 'AM'
  let hour = hour24 % 12
  if (hour === 0) hour = 12
  return `${hour}:${String(minute).padStart(2, '0')} ${period}`
}

const DEFAULT_DETAILS: MovieNightDetails = {
    title: 'Movie Night',
    date: '2026-08-08',
    plannedStartTime: '16:00',
    location: "Parmeet's House",
    host: 'Parmeet',
    notes: 'Bring your best snacks and arrive 15 minutes early for trailers.',
}

const createDefaultFriends = (plannedStartTime: string): Friend[] => {
  const defaultArrivalTime = formatTimeInputLabel(plannedStartTime)

  return FRIENDS.map((name) => ({
    id: createId(),
    name,
    status: '',
    arrivalTime: defaultArrivalTime,
    comments: '',
    movies: [],
  }))
}

const createDefaultState = (): AppState => ({
  details: { ...DEFAULT_DETAILS },
  friends: createDefaultFriends(DEFAULT_DETAILS.plannedStartTime),
  movieVotes: {},
})

const defaultState: AppState = createDefaultState()

function App() {
  const [state, setState] = useState<AppState>(defaultState)
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  // Unlocked for the rest of the session once the PIN is entered.
  const [isUnlocked, setIsUnlocked] = useState(false)
  // Which action the PIN prompt is currently gating, if any.
  const [pinPrompt, setPinPrompt] = useState<'edit' | 'reset' | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)
  const [draftMovies, setDraftMovies] = useState<Record<string, string>>({})
  const [draggedMovie, setDraggedMovie] = useState<{ friendId: string; movieId: string } | null>(null)
  // Unconfirmed status picks live only in local state; they sync to everyone
  // only after the person presses Confirm.
  const [pendingStatus, setPendingStatus] = useState<Record<string, AttendanceStatus>>({})
  const [now, setNow] = useState(Date.now())
  const [isLoaded, setIsLoaded] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'loading' | 'saved' | 'saving' | 'error'>('loading')
  const [syncMessage, setSyncMessage] = useState('')
  const lastSavedStateRef = useRef('')
  const versionRef = useRef(0)

  // app is dark-only by design per user request

  useEffect(() => {
    let cancelled = false

    const loadState = async () => {
      try {
        const response = await fetch('/api/state')
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? `Failed to load shared state: ${response.status}`)
        }

        const payload = (await response.json()) as { state: AppState; version: number }
        const remoteState = payload.state
        const serialized = JSON.stringify(remoteState)

        if (cancelled) return

        versionRef.current = payload.version
        lastSavedStateRef.current = serialized
        setState(remoteState)
        setSyncStatus('saved')
        setSyncMessage('')
      } catch (error) {
        if (cancelled) return

        const serialized = JSON.stringify(defaultState)
        lastSavedStateRef.current = serialized
        setState(defaultState)
        setSyncStatus('error')
        setSyncMessage(
          error instanceof Error ? error.message : 'Shared cloud state is unavailable. Check /api/state for the backend error.',
        )
      } finally {
        if (!cancelled) setIsLoaded(true)
      }
    }

    void loadState()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isLoaded) return

    const serialized = JSON.stringify(state)
    if (serialized === lastSavedStateRef.current) return

    // We never successfully loaded a version (initial GET failed), so we can't
    // safely save without risking a blind overwrite. Keep the error banner.
    if (versionRef.current < 1) return

    setSyncStatus('saving')

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch('/api/state', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ state, version: versionRef.current }),
          })

          if (response.status === 409) {
            // Someone else saved first. Adopt their state so we don't clobber
            // it, and surface a message — the local edits that lost are
            // discarded (refresh-only, last-committed-wins semantics).
            const payload = (await response.json().catch(() => null)) as
              | { state?: AppState; version?: number }
              | null
            if (payload?.state && typeof payload.version === 'number') {
              versionRef.current = payload.version
              lastSavedStateRef.current = JSON.stringify(payload.state)
              setState(payload.state)
            }
            setSyncStatus('error')
            setSyncMessage('Someone else updated movie night while you were editing. Loaded their latest changes — please redo your edit.')
            return
          }

          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as { error?: string } | null
            throw new Error(payload?.error ?? `Failed to save shared state: ${response.status}`)
          }

          const payload = (await response.json()) as { version: number }
          versionRef.current = payload.version
          lastSavedStateRef.current = serialized
          setSyncStatus('saved')
          setSyncMessage('')
        } catch (error) {
          setSyncMessage(error instanceof Error ? error.message : 'Cloud save failed. Check /api/state for the backend error.')
          setSyncStatus('error')
        }
      })()
    }, 350)

    return () => window.clearTimeout(timeout)
  }, [isLoaded, state])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const updateFriend = (friendId: string, updater: (friend: Friend) => Friend) => {
    setState((prev) => ({
      ...prev,
      friends: prev.friends.map((friend) => (friend.id === friendId ? updater(friend) : friend)),
    }))
  }

  const defaultArrivalLabel = formatTimeInputLabel(state.details.plannedStartTime)

  // The pick a person is currently considering: their local pending choice if
  // any, otherwise their confirmed status.
  const effectiveStatus = (friend: Friend): AttendanceStatus =>
    friend.id in pendingStatus ? pendingStatus[friend.id] : friend.status

  // Tap a status button: toggle it as a pending pick. Tapping the active one
  // again clears it back to grey. Nothing syncs until Confirm.
  const pickStatus = (friend: Friend, status: AttendanceStatus) => {
    const current = effectiveStatus(friend)
    setPendingStatus((prev) => ({ ...prev, [friend.id]: current === status ? '' : status }))
  }

  // Confirm locks the pending pick into the synced state for everyone to see.
  const confirmStatus = (friendId: string) => {
    const next = pendingStatus[friendId] ?? ''
    updateFriend(friendId, (current) => ({ ...current, status: next }))
    setPendingStatus((prev) => {
      const clone = { ...prev }
      delete clone[friendId]
      return clone
    })
  }

  const resetAll = () => {
    // Keep all hero details (title, date, time, location, host, notes) exactly
    // as they are; only clear each person's attendance and comments.
    setState((prev) => ({
      ...prev,
      friends: prev.friends.map((friend) => ({
        ...friend,
        status: '',
        arrivalTime: formatTimeInputLabel(prev.details.plannedStartTime),
        comments: '',
        movies: friend.movies,
      })),
    }))
    setPendingStatus({})
    setIsEditingDetails(false)
    setDraftMovies({})
    setDraggedMovie(null)
  }

  // Run a protected action, prompting for the PIN first if still locked.
  const requestUnlock = (action: 'edit' | 'reset') => {
    if (isUnlocked) {
      if (action === 'edit') setIsEditingDetails((prev) => !prev)
      else resetAll()
      return
    }
    setPinInput('')
    setPinError(false)
    setPinPrompt(action)
  }

  const submitPin = () => {
    if (pinInput !== ADMIN_PIN) {
      setPinError(true)
      setPinInput('')
      return
    }
    const action = pinPrompt
    setIsUnlocked(true)
    setPinPrompt(null)
    setPinInput('')
    setPinError(false)
    if (action === 'edit') setIsEditingDetails(true)
    else if (action === 'reset') resetAll()
  }

  const attendanceStats = useMemo(() => {
    const yes = state.friends.filter((friend) => friend.status === 'yes')
    const maybe = state.friends.filter((friend) => friend.status === 'maybe')
    const no = state.friends.filter((friend) => friend.status === 'no')
    const arrivals = [...yes, ...maybe].map((friend) => toMinutes(friend.arrivalTime))

    const earliest = arrivals.length ? fromMinutes(Math.min(...arrivals)) : '--'
    const latest = arrivals.length ? fromMinutes(Math.max(...arrivals)) : '--'
    const average = arrivals.length
      ? fromMinutes(Math.round(arrivals.reduce((total, value) => total + value, 0) / arrivals.length))
      : '--'

    return {
      yes: yes.length,
      maybe: maybe.length,
      no: no.length,
      expectedGuests: yes.length + maybe.length,
      earliest,
      latest,
      average,
    }
  }, [state.friends])

  const comments = useMemo(
    () =>
      state.friends
        .filter((friend) => friend.comments.trim().length > 0)
        .map((friend) => ({ id: friend.id, name: friend.name, status: friend.status, text: friend.comments.trim() })),
    [state.friends],
  )

  // Each person's movie picks, favourites first, capped at 3 per person.
  const moviePicks = useMemo(
    () =>
      state.friends
        .filter((friend) => friend.movies.length > 0)
        .map((friend) => ({
          id: friend.id,
          name: friend.name,
          status: friend.status,
          extra: Math.max(0, friend.movies.length - 3),
          movies: [...friend.movies]
            .sort((a, b) => Number(b.favorite) - Number(a.favorite))
            .slice(0, 3),
        })),
    [state.friends],
  )

  const countdown = useMemo(() => {
    const target = new Date(`${state.details.date}T${state.details.plannedStartTime}:00`).getTime()
    const diff = target - now
    if (diff <= 0) return 'Movie night is live now!'
    const totalMinutes = Math.floor(diff / 1000 / 60)
    const days = Math.floor(totalMinutes / (60 * 24))
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
    const minutes = totalMinutes % 60
    return `${days}d ${hours}h ${minutes}m until showtime`
  }, [now, state.details.date, state.details.plannedStartTime])

  return (
    <div className="min-h-screen bg-canvas text-white">
      <div className="mesh-bg" aria-hidden="true" />
      <div className="aurora" aria-hidden="true" />
      <Ambience />
      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card mb-6 overflow-hidden rounded-3xl border border-white/15 p-6 shadow-2xl"
        >
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-3xl tracking-tight sm:text-4xl">Movie Night Command Center</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${syncStatus === 'saved' ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100' : syncStatus === 'saving' ? 'border-amber-400/40 bg-amber-500/15 text-amber-100' : syncStatus === 'error' ? 'border-rose-400/40 bg-rose-500/15 text-rose-100' : 'border-white/15 bg-white/5 text-white/70'}`}>
                {syncStatus === 'loading' ? 'Loading cloud state...' : syncStatus === 'saving' ? 'Saving to cloud...' : syncStatus === 'error' ? 'Cloud sync error' : 'Saved to cloud'}
              </span>
              <button
                type="button"
                onClick={() => requestUnlock('edit')}
                className="rounded-xl bg-red-500/90 px-3 py-2 text-sm font-semibold transition hover:bg-red-400"
              >
                <span className="inline-flex items-center gap-2">
                  {isUnlocked ? <Edit3 size={16} /> : <Lock size={16} />} Edit Details
                </span>
              </button>
            </div>
          </div>

          {syncStatus === 'error' && syncMessage ? (
            <p className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {syncMessage}
            </p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="hero-detail">
              <span className="icon-wrap"><Film size={20} /></span>
              <div>
                <p className="label">Event</p>
                <p className="value">{state.details.title}</p>
              </div>
            </div>
            <div className="hero-detail">
              <span className="icon-wrap"><CalendarDays size={20} /></span>
              <div>
                <p className="label">Date</p>
                <p className="value">{new Date(`${state.details.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
              </div>
            </div>
            <div className="hero-detail">
              <span className="icon-wrap"><Clock3 size={20} /></span>
              <div>
                <p className="label">Start Time</p>
                <p className="value">
                  {new Date(`1970-01-01T${state.details.plannedStartTime}:00`).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
            <div className="hero-detail">
              <span className="icon-wrap"><House size={20} /></span>
              <div>
                <p className="label">Where</p>
                <p className="value">{state.details.location}</p>
                <p className="text-xs text-white/60">Host: {state.details.host}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="countdown-pill"><span className="dot" /> {countdown}</span>
            {state.details.notes.trim() ? (
              <p className="flex-1 min-w-64 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white/80">
                <Sparkles size={14} className="mr-1.5 inline text-red-300" />
                {state.details.notes}
              </p>
            ) : null}
          </div>

          <AnimatePresence>
            {isEditingDetails ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 grid gap-3 overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-4 md:grid-cols-2"
              >
                <input className="field" value={state.details.title} onChange={(event) => setState((prev) => ({ ...prev, details: { ...prev.details, title: event.target.value } }))} placeholder="Movie Night Title" />
                <input className="field" type="date" value={state.details.date} onChange={(event) => setState((prev) => ({ ...prev, details: { ...prev.details, date: event.target.value } }))} />
                <input className="field" type="time" value={state.details.plannedStartTime} onChange={(event) => setState((prev) => {
                  const prevDefault = formatTimeInputLabel(prev.details.plannedStartTime)
                  const nextDefault = formatTimeInputLabel(event.target.value)
                  return {
                    ...prev,
                    details: { ...prev.details, plannedStartTime: event.target.value },
                    // Everyone still on the old default arrival follows the new start time.
                    friends: prev.friends.map((friend) =>
                      friend.arrivalTime === prevDefault ? { ...friend, arrivalTime: nextDefault } : friend,
                    ),
                  }
                })} />
                <input className="field" value={state.details.location} onChange={(event) => setState((prev) => ({ ...prev, details: { ...prev.details, location: event.target.value } }))} placeholder="Location" />
                <input className="field" value={state.details.host} onChange={(event) => setState((prev) => ({ ...prev, details: { ...prev.details, host: event.target.value } }))} placeholder="Host" />
                <input className="field md:col-span-2" value={state.details.notes} onChange={(event) => setState((prev) => ({ ...prev, details: { ...prev.details, notes: event.target.value } }))} placeholder="Description / Notes" />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.header>

        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <section className="glass-card rounded-2xl border border-white/10 p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="section-title mb-0">Who's Coming</h2>
                  <div className="flex gap-2 text-sm font-semibold">
                    <span className="status-chip chip-yes">{attendanceStats.yes} Going</span>
                    <span className="status-chip chip-maybe">{attendanceStats.maybe} Maybe</span>
                    <span className="status-chip chip-no">{attendanceStats.no} Can't</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {state.friends.map((friend) => (
                    <span
                      key={friend.id}
                      className={`status-chip ${friend.status ? `chip-${friend.status}` : 'chip-none'}`}
                      title={STATUS_LABEL[friend.status]}
                    >
                      {friend.status === 'yes' ? '✅' : friend.status === 'maybe' ? '🤔' : friend.status === 'no' ? '❌' : '•'} {friend.name}
                    </span>
                  ))}
                </div>
              </section>

              {moviePicks.length ? (
                <section className="glass-card rounded-2xl border border-white/10 p-5">
                  <h2 className="section-title">🍿 Movie Picks</h2>
                  <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {moviePicks.map((person) => (
                      <div key={person.id} className="pick-row">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="comment-avatar" style={{ background: avatarColor(person.status) }}>
                            {initials(person.name)}
                          </span>
                          <p className="font-semibold">{person.name}</p>
                        </div>
                        <ul className="space-y-1.5">
                          {person.movies.map((movie) => (
                            <li key={movie.id} className={`pick-item ${movie.favorite ? 'pick-fav' : ''}`}>
                              {movie.favorite ? <Star size={14} fill="currentColor" className="shrink-0" /> : <Film size={14} className="shrink-0 opacity-60" />}
                              <span className="truncate">{movie.title}</span>
                            </li>
                          ))}
                        </ul>
                        {person.extra > 0 ? (
                          <p className="mt-1.5 text-xs text-white/50">+{person.extra} more</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {comments.length ? (
                <section className="glass-card rounded-2xl border border-white/10 p-5">
                  <h2 className="section-title">💬 What People Said</h2>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {comments.map((comment) => (
                      <div key={comment.id} className="comment-row">
                        <span className="comment-avatar" style={{ background: avatarColor(comment.status) }}>
                          {initials(comment.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold">
                            {comment.name}
                            <span className="ml-2 text-xs font-normal text-white/50">{STATUS_LABEL[comment.status]}</span>
                          </p>
                          <p className="text-sm text-white/80">{comment.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <h2 className="section-title">Attendance</h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {state.friends.map((friend, index) => {
                    const hasCustomArrival = Boolean(friend.arrivalTime) && friend.arrivalTime !== defaultArrivalLabel
                    const hasComment = friend.comments.trim().length > 0

                    const pending = effectiveStatus(friend)
                    const needsConfirm = pending !== friend.status

                    return (
                    <motion.article
                      key={friend.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className={`glass-card lift person-card rounded-2xl border border-white/10 p-4 ${friend.status ? `person-${friend.status}` : ''}`}
                    >
                      <h3 className="font-display text-xl">{friend.name}</h3>
                      <p className="mb-3 text-xs uppercase tracking-wide text-white/60">Attendance Status</p>
                      <div className="mb-3 grid grid-cols-3 gap-2">
                        {([
                          ['yes', 'Yes', '✅'],
                          ['maybe', 'Maybe', '🤔'],
                          ['no', 'No', '❌'],
                        ] as const).map(([status, label, emoji]) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => pickStatus(friend, status)}
                            className={`status-btn status-btn-${status} ${pending === status ? 'status-btn-active' : ''}`}
                          >
                            <span className="emoji">{emoji}</span>
                            {label}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => confirmStatus(friend.id)}
                        disabled={!needsConfirm}
                        className={`confirm-btn mb-3 ${needsConfirm ? 'confirm-btn-ready' : ''}`}
                      >
                        {needsConfirm
                          ? `✓ Confirm ${pending ? STATUS_LABEL[pending] : 'no reply'}`
                          : friend.status
                            ? `Confirmed: ${STATUS_LABEL[friend.status]}`
                            : 'Pick a status above'}
                      </button>

                      {(hasCustomArrival || hasComment) ? (
                        <div className="mt-2 space-y-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/80">
                          {hasCustomArrival ? <p><span className="text-white/55">Arrival:</span> {friend.arrivalTime}</p> : null}
                          {hasComment ? <p><span className="text-white/55">Comment:</span> {friend.comments}</p> : null}
                        </div>
                      ) : null}

                      <details className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
                        <summary className="cursor-pointer font-medium">Add arrival time, comments, or movies</summary>
                        <ul className="mt-3 space-y-2">
                          {friend.movies.map((movie) => (
                            <li
                              key={movie.id}
                              draggable
                              onDragStart={() => setDraggedMovie({ friendId: friend.id, movieId: movie.id })}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => {
                                if (!draggedMovie || draggedMovie.friendId !== friend.id || draggedMovie.movieId === movie.id) return
                                updateFriend(friend.id, (current) => {
                                  const fromIndex = current.movies.findIndex((item) => item.id === draggedMovie.movieId)
                                  const toIndex = current.movies.findIndex((item) => item.id === movie.id)
                                  if (fromIndex < 0 || toIndex < 0) return current
                                  const nextMovies = [...current.movies]
                                  const [moved] = nextMovies.splice(fromIndex, 1)
                                  nextMovies.splice(toIndex, 0, moved)
                                  return { ...current, movies: nextMovies }
                                })
                              }}
                              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                            >
                              <span>{movie.title}</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateFriend(friend.id, (current) => ({
                                      ...current,
                                      movies: current.movies.map((item) =>
                                        item.id === movie.id ? { ...item, favorite: !item.favorite } : item,
                                      ),
                                    }))
                                  }
                                  className="rounded-md p-1 text-amber-300 transition hover:bg-white/10"
                                >
                                  <Star size={16} fill={movie.favorite ? 'currentColor' : 'none'} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateFriend(friend.id, (current) => ({
                                      ...current,
                                      movies: current.movies.filter((item) => item.id !== movie.id),
                                    }))
                                  }
                                  className="rounded-md p-1 text-rose-300 transition hover:bg-white/10"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>

                        <div className="mt-3 flex gap-2">
                          <select
                            className="field"
                            value={friend.arrivalTime}
                            onChange={(event) => updateFriend(friend.id, (current) => ({ ...current, arrivalTime: event.target.value }))}
                          >
                            {ARRIVAL_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>

                        <label className="mt-3 block text-xs uppercase tracking-wide text-white/60">Comments</label>
                        <textarea
                          className="field mt-1 min-h-20 resize-y"
                          value={friend.comments}
                          onChange={(event) => updateFriend(friend.id, (current) => ({ ...current, comments: event.target.value }))}
                          placeholder="Bringing snacks, running late, need a ride..."
                        />

                        <div className="mt-3 flex gap-2">
                          <input
                            className="field"
                            value={draftMovies[friend.id] ?? ''}
                            onChange={(event) => setDraftMovies((prev) => ({ ...prev, [friend.id]: event.target.value }))}
                            placeholder="Add a movie"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const title = (draftMovies[friend.id] ?? '').trim()
                              if (!title) return
                              updateFriend(friend.id, (current) => ({
                                ...current,
                                movies: [...current.movies, { id: createId(), title, favorite: false }],
                              }))
                              setDraftMovies((prev) => ({ ...prev, [friend.id]: '' }))
                            }}
                            className="rounded-lg bg-red-500/90 px-3 text-sm font-semibold transition hover:bg-red-400"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </details>
                    </motion.article>
                    )
                  })}
                </div>
              </section>

              <section className="mt-8 flex justify-end">
                <button
                  type="button"
                  onClick={() => requestUnlock('reset')}
                  className="inline-flex items-center gap-2 rounded-2xl border border-red-300/30 bg-red-500/15 px-5 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/25 hover:text-white"
                >
                  {isUnlocked ? null : <Lock size={14} />} Reset Everything
                </button>
              </section>
        </motion.section>
      </main>

      <AnimatePresence>
        {pinPrompt ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setPinPrompt(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              onClick={(event) => event.stopPropagation()}
              className="glass-card w-full max-w-sm rounded-3xl border border-white/15 p-6 shadow-2xl"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-red-500/20 text-red-200">
                  <Lock size={20} />
                </span>
                <div>
                  <h2 className="font-display text-xl leading-tight">Enter PIN</h2>
                  <p className="text-xs text-white/60">
                    {pinPrompt === 'reset' ? 'Required to reset everything' : 'Required to edit the details'}
                  </p>
                </div>
              </div>

              <input
                className={`field text-center text-2xl tracking-[0.5em] ${pinError ? 'pin-error' : ''}`}
                type="password"
                inputMode="numeric"
                autoFocus
                maxLength={4}
                value={pinInput}
                onChange={(event) => {
                  setPinInput(event.target.value.replace(/\D/g, ''))
                  setPinError(false)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitPin()
                  if (event.key === 'Escape') setPinPrompt(null)
                }}
                placeholder="••••"
              />

              {pinError ? (
                <p className="mt-2 text-center text-sm font-semibold text-rose-300">Wrong PIN, try again</p>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPinPrompt(null)}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitPin}
                  className="rounded-xl bg-red-500/90 px-4 py-2.5 text-sm font-semibold transition hover:bg-red-400"
                >
                  Unlock
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export default App
