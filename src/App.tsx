import { AnimatePresence, motion } from 'framer-motion'
import {
  CalendarDays,
  CalendarPlus,
  Camera,
  Check,
  Clock3,
  Edit3,
  Film,
  House,
  Lock,
  Plus,
  Share2,
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
  avatarUrl?: string // small downscaled data URL, stored in shared state
}

type MovieNightDetails = {
  title: string
  date: string
  plannedStartTime: string
  plannedEndTime: string
  location: string
  host: string
  notes: string
}



type MovieVote = {
  wantToWatch: boolean
  notInterested: boolean
  favorite: boolean
}

// An entry in the shared activity log.
type LogEntry = {
  id: string
  at: number // epoch ms
  kind: 'status' | 'details'
  who: string // person name, or the field label for details edits
  from: string
  to: string
}

// A frozen record of one event, snapshotted at start time.
type EventArchive = {
  id: string
  archivedAt: number
  details: MovieNightDetails
  attendees: { name: string; status: AttendanceStatus; arrivalTime: string; comments: string; avatarUrl?: string }[]
}

type AppState = {
  details: MovieNightDetails
  friends: Friend[]
  movieVotes: Record<string, MovieVote>
  activityLog: LogEntry[]
  archives: EventArchive[]
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

const FRIENDS = ['Nik', 'Sebastien', 'Mattias', 'Robbie', 'Ethan', 'Cam', 'Parmeet', 'Raph', 'Aiden']

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

// Turn a 24h "HH:MM" input value into a friendly 12-hour label ("4:00 PM").
// Pinned to 12-hour everywhere so the site never shows military time, even on
// devices whose locale defaults to a 24-hour clock.
const formatTimeInputLabel = (value: string) => {
  const [hourRaw, minuteRaw] = value.split(':')
  let hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  const period = hour >= 12 ? 'PM' : 'AM'
  hour %= 12
  if (hour === 0) hour = 12
  return `${hour}:${String(minute).padStart(2, '0')} ${period}`
}

const formatTimestamp = (ms: number) =>
  new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

// A self-contained VTIMEZONE for America/Winnipeg (Central) so the event lands
// in Winnipeg local time on any device, regardless of the viewer's timezone.
const WINNIPEG_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:America/Winnipeg',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0600',
  'TZOFFSETTO:-0500',
  'TZNAME:CDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0600',
  'TZNAME:CST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

// Build an .ics for the event, pinned to Winnipeg time. Times are written as
// local wall-clock with TZID=America/Winnipeg (no 'Z'), so Apple Calendar shows
// exactly the start/end you set here no matter where the phone is.
const buildIcsText = (details: MovieNightDetails) => {
  // Local wall-clock stamp: YYYYMMDDTHHMMSS (no timezone suffix).
  const localStamp = (date: string, time: string) => {
    const [hh = '00', mm = '00'] = time.split(':')
    return `${date.replace(/-/g, '')}T${hh}${mm}00`
  }
  // DTSTAMP must be UTC.
  const utcStamp = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}T${String(
      d.getUTCHours(),
    ).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}00Z`

  const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')

  // Fall back to a 2-hour block if no end time is set or it isn't after start.
  const startStamp = localStamp(details.date, details.plannedStartTime)
  let endStamp = details.plannedEndTime ? localStamp(details.date, details.plannedEndTime) : ''
  if (!endStamp || endStamp <= startStamp) {
    const [h = '0', m = '0'] = details.plannedStartTime.split(':')
    const endMin = Number(h) * 60 + Number(m) + 120
    const eh = String(Math.floor((endMin % 1440) / 60)).padStart(2, '0')
    const em = String(endMin % 60).padStart(2, '0')
    endStamp = localStamp(details.date, `${eh}:${em}`)
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Movie Night//EN',
    'CALSCALE:GREGORIAN',
    ...WINNIPEG_VTIMEZONE,
    'BEGIN:VEVENT',
    `UID:${details.date}-${details.plannedStartTime}@movie-night`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART;TZID=America/Winnipeg:${startStamp}`,
    `DTEND;TZID=America/Winnipeg:${endStamp}`,
    `SUMMARY:${esc(details.title)}`,
    `LOCATION:${esc(details.location)}`,
    `DESCRIPTION:${esc(`Hosted by ${details.host}. ${details.notes}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}

// Navigate straight to the .ics so iOS Safari hands it to Apple Calendar's
// "Add Event" screen directly — no share sheet, no saved file.
const saveCalendarEvent = (details: MovieNightDetails) => {
  const text = buildIcsText(details)
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }))
  window.location.href = url
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
}

const buildInviteText = (details: MovieNightDetails) => {
  const date = new Date(`${details.date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const time = formatTimeInputLabel(details.plannedStartTime)
  const endTime = details.plannedEndTime ? ` – ${formatTimeInputLabel(details.plannedEndTime)}` : ''
  const url = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''
  return `🎬 ${details.title}\n📅 ${date} at ${time}${endTime}\n📍 ${details.location} (host: ${details.host})\nRSVP: ${url}`
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10MB
const AVATAR_SIZE = 256 // px, square

// Read an image file and return a small square JPEG data URL. We accept files
// up to 10MB but downscale to AVATAR_SIZE so only a few KB land in D1.
const fileToAvatarDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('That file is not an image.'))
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      reject(new Error('Image is larger than 10MB.'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not decode that image.'))
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = AVATAR_SIZE
        canvas.height = AVATAR_SIZE
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas not supported.'))
          return
        }
        // center-crop to a square, then draw scaled down
        const side = Math.min(img.width, img.height)
        const sx = (img.width - side) / 2
        const sy = (img.height - side) / 2
        ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

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
    plannedEndTime: '18:00',
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
  activityLog: [],
  archives: [],
})

const defaultState: AppState = createDefaultState()

// Shows a friend's photo if they have one, else colored initials.
function Avatar({
  name,
  status,
  avatarUrl,
  size = 40,
}: {
  name: string
  status: AttendanceStatus
  avatarUrl?: string
  size?: number
}) {
  const style = { width: size, height: size, fontSize: size * 0.36 }
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="avatar-img"
        style={{ ...style, borderColor: avatarColor(status) }}
      />
    )
  }
  return (
    <span className="comment-avatar" style={{ ...style, background: avatarColor(status) }}>
      {initials(name)}
    </span>
  )
}

function App() {
  const [state, setState] = useState<AppState>(defaultState)
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [view, setView] = useState<'dashboard' | 'log' | 'archive'>('dashboard')
  // Unlocked for the rest of the session once the PIN is entered.
  const [isUnlocked, setIsUnlocked] = useState(false)
  // Which action the PIN prompt is currently gating, if any.
  const [pinPrompt, setPinPrompt] = useState<'edit' | 'reset' | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)
  // Reset asks for a final confirmation even after the PIN is entered.
  const [confirmReset, setConfirmReset] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  // Friend whose photo removal is awaiting confirmation.
  const [removePhotoFor, setRemovePhotoFor] = useState<Friend | null>(null)
  const [copiedInvite, setCopiedInvite] = useState(false)
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
  // Snapshot of details taken when the edit panel opens, to diff on close.
  const detailsSnapshotRef = useRef<MovieNightDetails | null>(null)

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
        // Older DB rows predate some fields; default them so the app is safe.
        const remoteState: AppState = {
          ...payload.state,
          details: { ...payload.state.details, plannedEndTime: payload.state.details.plannedEndTime ?? '18:00' },
          activityLog: payload.state.activityLog ?? [],
          archives: payload.state.archives ?? [],
        }
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

  // Once the event's start time passes, snapshot it into the archive exactly
  // once. The archive id encodes the event so re-editing details later (a new
  // event) archives separately, but the same event never double-archives.
  useEffect(() => {
    if (!isLoaded) return
    const startMs = new Date(`${state.details.date}T${state.details.plannedStartTime}:00`).getTime()
    if (Number.isNaN(startMs) || now < startMs) return

    const eventId = `${state.details.date}|${state.details.plannedStartTime}|${state.details.title}`
    if (state.archives.some((archive) => archive.id === eventId)) return

    setState((prev) => {
      if (prev.archives.some((archive) => archive.id === eventId)) return prev
      const archive: EventArchive = {
        id: eventId,
        archivedAt: Date.now(),
        details: { ...prev.details },
        attendees: prev.friends.map((friend) => ({
          name: friend.name,
          status: friend.status,
          arrivalTime: friend.arrivalTime,
          comments: friend.comments,
          avatarUrl: friend.avatarUrl,
        })),
      }
      return { ...prev, archives: [archive, ...prev.archives] }
    })
  }, [isLoaded, now, state.details, state.archives, state.friends])

  const updateFriend = (friendId: string, updater: (friend: Friend) => Friend) => {
    setState((prev) => ({
      ...prev,
      friends: prev.friends.map((friend) => (friend.id === friendId ? updater(friend) : friend)),
    }))
  }

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(buildInviteText(state.details))
      setCopiedInvite(true)
      window.setTimeout(() => setCopiedInvite(false), 2000)
    } catch {
      setAvatarError('Could not copy — your browser blocked clipboard access.')
    }
  }

  const handleAvatarUpload = async (friendId: string, file: File | undefined) => {
    if (!file) return
    try {
      const dataUrl = await fileToAvatarDataUrl(file)
      updateFriend(friendId, (current) => ({ ...current, avatarUrl: dataUrl }))
      setAvatarError('')
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : 'Upload failed.')
    }
  }

  // Append entries to the shared activity log (most recent first, capped).
  const pushLog = (entries: Omit<LogEntry, 'id' | 'at'>[]) => {
    if (!entries.length) return
    const now = Date.now()
    const stamped: LogEntry[] = entries.map((entry, index) => ({
      ...entry,
      id: createId(),
      at: now + index, // keep insertion order stable within one batch
    }))
    setState((prev) => ({
      ...prev,
      activityLog: [...stamped.reverse(), ...(prev.activityLog ?? [])].slice(0, 200),
    }))
  }

  const DETAIL_LABELS: Record<keyof MovieNightDetails, string> = {
    title: 'Title',
    date: 'Date',
    plannedStartTime: 'Start time',
    plannedEndTime: 'End time',
    location: 'Location',
    host: 'Host',
    notes: 'Notes',
  }

  const openDetailsEditing = () => {
    detailsSnapshotRef.current = { ...state.details }
    setIsEditingDetails(true)
  }

  // Diff details against the snapshot from when editing opened and log changes.
  const closeDetailsEditing = () => {
    const before = detailsSnapshotRef.current
    if (before) {
      const changes = (Object.keys(DETAIL_LABELS) as (keyof MovieNightDetails)[])
        .filter((key) => before[key] !== state.details[key])
        .map((key) => ({
          kind: 'details' as const,
          who: DETAIL_LABELS[key],
          from: before[key] || '(empty)',
          to: state.details[key] || '(empty)',
        }))
      pushLog(changes)
    }
    detailsSnapshotRef.current = null
    setIsEditingDetails(false)
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
    const friend = state.friends.find((item) => item.id === friendId)
    if (friend && friend.status !== next) {
      pushLog([{ kind: 'status', who: friend.name, from: STATUS_LABEL[friend.status], to: STATUS_LABEL[next] }])
    }
    updateFriend(friendId, (current) => ({ ...current, status: next }))
    setPendingStatus((prev) => {
      const clone = { ...prev }
      delete clone[friendId]
      return clone
    })
  }

  const resetAll = () => {
    // Keep all hero details (title, date, time, location, host, notes) exactly
    // as they are; clear each person's attendance/comments and the activity log.
    // Profile pictures and archived past events are preserved.
    setState((prev) => ({
      ...prev,
      friends: prev.friends.map((friend) => ({
        ...friend,
        status: '',
        arrivalTime: formatTimeInputLabel(prev.details.plannedStartTime),
        comments: '',
        movies: friend.movies,
      })),
      activityLog: [],
    }))
    setPendingStatus({})
    setIsEditingDetails(false)
    setDraftMovies({})
    setDraggedMovie(null)
    setConfirmReset(false)
  }

  // Reset requires a final confirmation on top of the PIN, since it wipes
  // everyone's answers and the activity log.
  const startEditOrReset = (action: 'edit' | 'reset') => {
    if (action === 'edit') {
      if (isEditingDetails) closeDetailsEditing()
      else openDetailsEditing()
    } else {
      setConfirmReset(true)
    }
  }

  // Run a protected action, prompting for the PIN first if still locked.
  const requestUnlock = (action: 'edit' | 'reset') => {
    if (isUnlocked) {
      startEditOrReset(action)
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
    if (action === 'edit') startEditOrReset('edit')
    else if (action === 'reset') startEditOrReset('reset')
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
        .map((friend) => ({ id: friend.id, name: friend.name, status: friend.status, avatarUrl: friend.avatarUrl, text: friend.comments.trim() })),
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
          avatarUrl: friend.avatarUrl,
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
                onClick={() => void copyInvite()}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold transition hover:bg-white/10"
              >
                <span className="inline-flex items-center gap-2">
                  {copiedInvite ? <Check size={16} className="text-emerald-300" /> : <Share2 size={16} />}
                  {copiedInvite ? 'Copied!' : 'Invite'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => saveCalendarEvent(state.details)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold transition hover:bg-white/10"
              >
                <span className="inline-flex items-center gap-2">
                  <CalendarPlus size={16} /> Add to Calendar
                </span>
              </button>
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

          {avatarError ? (
            <p className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <span>{avatarError}</span>
              <button type="button" onClick={() => setAvatarError('')} className="text-amber-200/70 hover:text-white">✕</button>
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
                <p className="value">{new Date(`${state.details.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
            <div className="hero-detail">
              <span className="icon-wrap"><Clock3 size={20} /></span>
              <div>
                <p className="label">Time</p>
                <p className="value">
                  {formatTimeInputLabel(state.details.plannedStartTime)}
                  {state.details.plannedEndTime ? ` – ${formatTimeInputLabel(state.details.plannedEndTime)}` : null}
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
                <label className="block text-xs text-white/60">
                  Start time
                  <input className="field mt-1" type="time" value={state.details.plannedStartTime} onChange={(event) => setState((prev) => {
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
                </label>
                <label className="block text-xs text-white/60">
                  End time
                  <input className="field mt-1" type="time" value={state.details.plannedEndTime} onChange={(event) => setState((prev) => ({ ...prev, details: { ...prev.details, plannedEndTime: event.target.value } }))} />
                </label>
                <input className="field" value={state.details.location} onChange={(event) => setState((prev) => ({ ...prev, details: { ...prev.details, location: event.target.value } }))} placeholder="Location" />
                <input className="field" value={state.details.host} onChange={(event) => setState((prev) => ({ ...prev, details: { ...prev.details, host: event.target.value } }))} placeholder="Host" />
                <input className="field md:col-span-2" value={state.details.notes} onChange={(event) => setState((prev) => ({ ...prev, details: { ...prev.details, notes: event.target.value } }))} placeholder="Description / Notes" />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.header>

        <div className="mb-6 flex gap-2 rounded-2xl border border-white/10 bg-black/20 p-1.5 backdrop-blur">
          {([
            ['dashboard', 'Dashboard'],
            ['log', `Activity Log${state.activityLog.length ? ` (${state.activityLog.length})` : ''}`],
            ['archive', `Past Events${state.archives.length ? ` (${state.archives.length})` : ''}`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`tab-btn ${view === key ? 'tab-btn-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'dashboard' ? (
        <motion.section key="dashboard" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
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
                          <Avatar name={person.name} status={person.status} avatarUrl={person.avatarUrl} size={36} />
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
                        <Avatar name={comment.name} status={comment.status} avatarUrl={comment.avatarUrl} size={36} />
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
                      <div className="mb-3 flex items-center gap-3">
                        <label className="avatar-upload" title="Upload a profile picture (max 10MB)">
                          <Avatar name={friend.name} status={friend.status} avatarUrl={friend.avatarUrl} size={52} />
                          <span className="avatar-upload-badge"><Camera size={13} /></span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                              void handleAvatarUpload(friend.id, event.target.files?.[0])
                              event.target.value = ''
                            }}
                          />
                        </label>
                        <div className="min-w-0">
                          <h3 className="font-display text-xl leading-tight">{friend.name}</h3>
                          {friend.avatarUrl ? (
                            <button
                              type="button"
                              onClick={() => setRemovePhotoFor(friend)}
                              className="text-xs text-white/50 underline-offset-2 hover:text-white/80 hover:underline"
                            >
                              Remove photo
                            </button>
                          ) : (
                            <p className="text-xs text-white/45">Tap the circle to add a photo</p>
                          )}
                        </div>
                      </div>
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
        ) : null}

        {view === 'log' ? (
          <motion.section key="log" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl border border-white/10 p-5">
            <h2 className="section-title">📝 Activity Log</h2>
            <p className="mb-4 text-sm text-white/60">Every attendance change and detail edit, newest first.</p>
            {state.activityLog.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                No activity yet. Changes to attendance or event details will show up here.
              </p>
            ) : (
              <ul className="space-y-2">
                {state.activityLog.map((entry) => (
                  <li key={entry.id} className="log-row">
                    <span className={`log-dot ${entry.kind === 'status' ? 'log-dot-status' : 'log-dot-details'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {entry.kind === 'status' ? (
                          <>
                            <span className="font-semibold">{entry.who}</span> changed attendance{' '}
                            <span className="text-white/60">{entry.from}</span>
                            <span className="mx-1 text-white/40">→</span>
                            <span className="font-semibold text-white">{entry.to}</span>
                          </>
                        ) : (
                          <>
                            <span className="font-semibold">{entry.who}</span> updated{' '}
                            <span className="text-white/60 line-through">{entry.from}</span>
                            <span className="mx-1 text-white/40">→</span>
                            <span className="font-semibold text-white">{entry.to}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-white/45">{formatTimestamp(entry.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.section>
        ) : null}

        {view === 'archive' ? (
          <motion.section key="archive" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="glass-card rounded-2xl border border-white/10 p-5">
              <h2 className="section-title">🎞️ Past Events</h2>
              <p className="text-sm text-white/60">
                Each event is saved automatically once its start time passes — a permanent record of who came and what they said.
              </p>
            </div>

            {state.archives.length === 0 ? (
              <div className="glass-card rounded-2xl border border-white/10 p-6 text-sm text-white/60">
                No events archived yet. The current event will be saved here once its start time passes.
              </div>
            ) : (
              state.archives.map((archive) => {
                const going = archive.attendees.filter((a) => a.status === 'yes')
                return (
                  <article key={archive.id} className="glass-card rounded-2xl border border-white/10 p-5">
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-display text-xl">{archive.details.title}</h3>
                      <span className="text-xs text-white/50">Archived {formatTimestamp(archive.archivedAt)}</span>
                    </div>
                    <div className="mb-4 flex flex-wrap gap-3 text-sm text-white/70">
                      <span>📅 {new Date(`${archive.details.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      <span>🕘 {formatTimeInputLabel(archive.details.plannedStartTime)}{archive.details.plannedEndTime ? ` – ${formatTimeInputLabel(archive.details.plannedEndTime)}` : ''}</span>
                      <span>📍 {archive.details.location}</span>
                      <span className="font-semibold text-emerald-200">{going.length} went</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {archive.attendees.map((attendee) => (
                        <div key={attendee.name} className={`archive-person ${attendee.status ? `person-${attendee.status}` : ''}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 font-semibold">
                              <Avatar name={attendee.name} status={attendee.status} avatarUrl={attendee.avatarUrl} size={28} />
                              {attendee.name}
                            </span>
                            <span className={`status-chip ${attendee.status ? `chip-${attendee.status}` : 'chip-none'}`}>
                              {STATUS_LABEL[attendee.status]}
                            </span>
                          </div>
                          {attendee.comments.trim() ? (
                            <p className="mt-1 text-xs text-white/70">“{attendee.comments}”</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </article>
                )
              })
            )}
          </motion.section>
        ) : null}
      </main>

      <AnimatePresence>
        {removePhotoFor ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setRemovePhotoFor(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              onClick={(event) => event.stopPropagation()}
              className="glass-card w-full max-w-sm rounded-3xl border border-white/15 p-6 shadow-2xl"
            >
              <div className="mb-4 flex items-center gap-3">
                <Avatar
                  name={removePhotoFor.name}
                  status={removePhotoFor.status}
                  avatarUrl={removePhotoFor.avatarUrl}
                  size={48}
                />
                <div>
                  <h2 className="font-display text-xl leading-tight">Remove photo?</h2>
                  <p className="text-xs text-white/60">{removePhotoFor.name}'s profile picture</p>
                </div>
              </div>
              <p className="text-sm text-white/70">
                This clears the picture for everyone. You can always upload a new one.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRemovePhotoFor(null)}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateFriend(removePhotoFor.id, (current) => ({ ...current, avatarUrl: undefined }))
                    setRemovePhotoFor(null)
                  }}
                  className="rounded-xl bg-red-500/90 px-4 py-2.5 text-sm font-semibold transition hover:bg-red-400"
                >
                  Remove
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {confirmReset ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setConfirmReset(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              onClick={(event) => event.stopPropagation()}
              className="glass-card w-full max-w-sm rounded-3xl border border-white/15 p-6 shadow-2xl"
            >
              <h2 className="font-display text-xl">Reset everything?</h2>
              <p className="mt-2 text-sm text-white/70">
                This clears everyone's attendance, comments, and the activity log. Profile pictures and past events are kept. This can't be undone.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={resetAll}
                  className="rounded-xl bg-red-500/90 px-4 py-2.5 text-sm font-semibold transition hover:bg-red-400"
                >
                  Yes, reset
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
