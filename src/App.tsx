import { AnimatePresence, motion } from 'framer-motion'
import {
  CalendarDays,
  Clock3,
  Edit3,
  Film,
  House,
  PartyPopper,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

type AttendanceStatus = 'yes' | 'maybe' | 'no' | ''
type Tab = 'dashboard' | 'voting'

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

type MovieMeta = {
  year: number
  runtime: string
  genre: string
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

const MOVIE_META: Record<string, MovieMeta> = {
  Interstellar: { year: 2014, runtime: '2h 49m', genre: 'Sci-Fi' },
  'The Dark Knight': { year: 2008, runtime: '2h 32m', genre: 'Action' },
  'The Prestige': { year: 2006, runtime: '2h 10m', genre: 'Thriller' },
  'Dune Part Two': { year: 2024, runtime: '2h 46m', genre: 'Sci-Fi' },
  'The Batman': { year: 2022, runtime: '2h 56m', genre: 'Action' },
  'Blade Runner 2049': { year: 2017, runtime: '2h 44m', genre: 'Sci-Fi' },
  Arrival: { year: 2016, runtime: '1h 56m', genre: 'Sci-Fi' },
  Whiplash: { year: 2014, runtime: '1h 47m', genre: 'Drama' },
  'The Lord of the Rings': { year: 2001, runtime: '2h 58m', genre: 'Fantasy' },
  'Mad Max: Fury Road': { year: 2015, runtime: '2h 0m', genre: 'Action' },
  Inception: { year: 2010, runtime: '2h 28m', genre: 'Sci-Fi' },
  'Top Gun: Maverick': { year: 2022, runtime: '2h 10m', genre: 'Action' },
  'Spider-Man: Into the Spider-Verse': { year: 2018, runtime: '1h 57m', genre: 'Animation' },
  'The Matrix': { year: 1999, runtime: '2h 16m', genre: 'Sci-Fi' },
  'Everything Everywhere All at Once': { year: 2022, runtime: '2h 19m', genre: 'Sci-Fi' },
  'John Wick': { year: 2014, runtime: '1h 41m', genre: 'Action' },
  'The Social Network': { year: 2010, runtime: '2h 0m', genre: 'Drama' },
  Oppenheimer: { year: 2023, runtime: '3h 0m', genre: 'Drama' },
  'Avengers: Endgame': { year: 2019, runtime: '3h 1m', genre: 'Action' },
}

const createId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

const normalizeTitle = (value: string) => value.trim().toLowerCase()

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
    title: 'Movie Night #12',
    date: '2026-08-08',
    plannedStartTime: '19:00',
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
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [movieSearch, setMovieSearch] = useState('')
  const [genreFilter, setGenreFilter] = useState('All')
  const [sortMode, setSortMode] = useState<'popularity' | 'title'>('popularity')
  const [draftMovies, setDraftMovies] = useState<Record<string, string>>({})
  const [draggedMovie, setDraggedMovie] = useState<{ friendId: string; movieId: string } | null>(null)
  const [now, setNow] = useState(Date.now())
  const [pickerResult, setPickerResult] = useState('')
  const [isPickingMovie, setIsPickingMovie] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'loading' | 'saved' | 'saving' | 'error'>('loading')
  const lastSavedStateRef = useRef('')

  // app is dark-only by design per user request

  useEffect(() => {
    let cancelled = false

    const loadState = async () => {
      try {
        const response = await fetch('/api/state')
        if (!response.ok) {
          throw new Error(`Failed to load shared state: ${response.status}`)
        }

        const remoteState = (await response.json()) as AppState
        const serialized = JSON.stringify(remoteState)

        if (cancelled) return

        lastSavedStateRef.current = serialized
        setState(remoteState)
        setSyncStatus('saved')
      } catch {
        if (cancelled) return

        const serialized = JSON.stringify(defaultState)
        lastSavedStateRef.current = serialized
        setState(defaultState)
        setSyncStatus('error')
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

    setSyncStatus('saving')

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch('/api/state', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: serialized,
          })

          if (!response.ok) {
            throw new Error(`Failed to save shared state: ${response.status}`)
          }

          lastSavedStateRef.current = serialized
          setSyncStatus('saved')
        } catch {
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

  const resetAll = () => {
    const nextState: AppState = {
      details: { ...DEFAULT_DETAILS },
      friends: state.friends.map((friend) => ({
        ...friend,
        status: '',
        arrivalTime: formatTimeInputLabel(DEFAULT_DETAILS.plannedStartTime),
        comments: '',
        movies: friend.movies,
      })),
      movieVotes: {},
    }
    setState(nextState)
    setActiveTab('dashboard')
    setIsEditingDetails(false)
    setMovieSearch('')
    setGenreFilter('All')
    setSortMode('popularity')
    setDraftMovies({})
    setDraggedMovie(null)
    setPickerResult('')
    setIsPickingMovie(false)
  }

  const defaultArrivalLabel = formatTimeInputLabel(state.details.plannedStartTime)

  const movieMasterList = useMemo(() => {
    const movieMap = new Map<
      string,
      {
        key: string
        title: string
        suggestedBy: string[]
        year: number
        runtime: string
        genre: string
      }
    >()

    state.friends.forEach((friend) => {
      friend.movies.forEach((movie) => {
        const key = normalizeTitle(movie.title)
        const existing = movieMap.get(key)
        const meta = MOVIE_META[movie.title] ?? {
          year: 2020,
          runtime: '2h 0m',
          genre: 'Drama',
        }
        if (!existing) {
          movieMap.set(key, {
            key,
            title: movie.title,
            suggestedBy: [friend.name],
            year: meta.year,
            runtime: meta.runtime,
            genre: meta.genre,
          })
          return
        }
        if (!existing.suggestedBy.includes(friend.name)) {
          existing.suggestedBy.push(friend.name)
        }
      })
    })

    return [...movieMap.values()].map((movie) => {
      const vote = state.movieVotes[movie.key] ?? {
        wantToWatch: false,
        notInterested: false,
        favorite: false,
      }
      const popularity =
        movie.suggestedBy.length * 3 + (vote.wantToWatch ? 3 : 0) + (vote.favorite ? 2 : 0) - (vote.notInterested ? 2 : 0)
      return {
        ...movie,
        vote,
        popularity,
      }
    })
  }, [state.friends, state.movieVotes])

  const filteredMovies = useMemo(() => {
    const searched = movieMasterList.filter((movie) => {
      const matchesSearch = movie.title.toLowerCase().includes(movieSearch.toLowerCase())
      const matchesGenre = genreFilter === 'All' || movie.genre === genreFilter
      return matchesSearch && matchesGenre
    })

    return searched.sort((a, b) => {
      if (sortMode === 'title') return a.title.localeCompare(b.title)
      return b.popularity - a.popularity
    })
  }, [genreFilter, movieMasterList, movieSearch, sortMode])

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

  const topMovies = useMemo(
    () => [...movieMasterList].sort((a, b) => b.suggestedBy.length - a.suggestedBy.length).slice(0, 10),
    [movieMasterList],
  )

  const genres = useMemo(() => ['All', ...new Set(movieMasterList.map((movie) => movie.genre))], [movieMasterList])

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

  const randomPickMovie = () => {
    if (!movieMasterList.length) return
    setIsPickingMovie(true)
    window.setTimeout(() => {
      const randomMovie = movieMasterList[Math.floor(Math.random() * movieMasterList.length)]
      setPickerResult(randomMovie.title)
      setIsPickingMovie(false)
    }, 1200)
  }

  const toggleMovieVote = (movieKey: string, field: keyof MovieVote) => {
    setState((prev) => {
      const current = prev.movieVotes[movieKey] ?? {
        wantToWatch: false,
        notInterested: false,
        favorite: false,
      }

      const next: MovieVote = {
        ...current,
        [field]: !current[field],
      }

      if (field === 'wantToWatch' && next.wantToWatch) next.notInterested = false
      if (field === 'notInterested' && next.notInterested) next.wantToWatch = false

      return {
        ...prev,
        movieVotes: {
          ...prev.movieVotes,
          [movieKey]: next,
        },
      }
    })
  }

  // snack signup removed per user request

  return (
    <div className="min-h-screen bg-canvas text-white">
      <div className="mesh-bg" aria-hidden="true" />
      <main className="relative mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
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
                onClick={() => setIsEditingDetails((prev) => !prev)}
                className="rounded-xl bg-red-500/90 px-3 py-2 text-sm font-semibold transition hover:bg-red-400"
              >
                <span className="inline-flex items-center gap-2">
                  <Edit3 size={16} /> Edit Details
                </span>
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="info-pill">
              <Film size={18} className="text-red-300" />
              <div>
                <p className="text-xs uppercase text-white/60">Movie Night Title</p>
                <p className="font-medium">{state.details.title}</p>
              </div>
            </div>
            <div className="info-pill">
              <CalendarDays size={18} className="text-red-300" />
              <div>
                <p className="text-xs uppercase text-white/60">Date</p>
                <p className="font-medium">{new Date(state.details.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
              </div>
            </div>
            <div className="info-pill">
              <Clock3 size={18} className="text-red-300" />
              <div>
                <p className="text-xs uppercase text-white/60">Planned Start Time</p>
                <p className="font-medium">
                  {new Date(`1970-01-01T${state.details.plannedStartTime}:00`).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
            <div className="info-pill">
              <House size={18} className="text-red-300" />
              <div>
                <p className="text-xs uppercase text-white/60">Location / Host</p>
                <p className="font-medium">{state.details.location}</p>
                <p className="text-xs text-white/70">Host: {state.details.host}</p>
              </div>
            </div>
          </div>

          <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/80">{state.details.notes}</p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-red-500/20 px-4 py-2 text-sm text-red-100">
            <Sparkles size={16} /> {countdown}
          </p>

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
                <input className="field" type="time" value={state.details.plannedStartTime} onChange={(event) => setState((prev) => ({ ...prev, details: { ...prev.details, plannedStartTime: event.target.value } }))} />
                <input className="field" value={state.details.location} onChange={(event) => setState((prev) => ({ ...prev, details: { ...prev.details, location: event.target.value } }))} placeholder="Location" />
                <input className="field" value={state.details.host} onChange={(event) => setState((prev) => ({ ...prev, details: { ...prev.details, host: event.target.value } }))} placeholder="Host" />
                <input className="field md:col-span-2" value={state.details.notes} onChange={(event) => setState((prev) => ({ ...prev, details: { ...prev.details, notes: event.target.value } }))} placeholder="Description / Notes" />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.header>

        <div className="mb-6 flex gap-2 rounded-2xl border border-white/10 bg-black/20 p-1.5 backdrop-blur">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`tab-btn ${activeTab === 'dashboard' ? 'tab-btn-active' : ''}`}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('voting')}
            className={`tab-btn ${activeTab === 'voting' ? 'tab-btn-active' : ''}`}
          >
            Movie Voting
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' ? (
            <motion.section key="dashboard" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-6">
              <section>
                <h2 className="section-title">Attendance</h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {state.friends.map((friend, index) => {
                    const hasCustomArrival = Boolean(friend.arrivalTime) && friend.arrivalTime !== defaultArrivalLabel
                    const hasComment = friend.comments.trim().length > 0

                    return (
                    <motion.article
                      key={friend.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="glass-card rounded-2xl border border-white/10 p-4"
                    >
                      <h3 className="font-display text-xl">{friend.name}</h3>
                      <p className="mb-3 text-xs uppercase tracking-wide text-white/60">Attendance Status</p>
                      <div className="mb-3 grid grid-cols-3 gap-2">
                        {([
                          ['yes', 'Yes'],
                          ['maybe', 'Maybe'],
                          ['no', 'No'],
                        ] as const).map(([status, label]) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => updateFriend(friend.id, (current) => ({ ...current, status }))}
                            className={`rounded-xl px-2 py-2 text-sm font-semibold transition-all duration-200 ${friend.status === status
                              ? 'scale-[1.04] border border-red-300/70 bg-red-500 text-white shadow-[0_10px_28px_rgba(239,68,68,0.35)] ring-2 ring-red-200/60'
                              : 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                              }`}
                          >
                              {status === 'yes' ? '✅' : status === 'maybe' ? '❓' : '❌'} {label}
                          </button>
                        ))}
                      </div>

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

              <section className="grid gap-4 lg:grid-cols-2">
                <article className="glass-card rounded-2xl border border-white/10 p-5">
                  <h2 className="section-title">Attendance Summary</h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="stat-block"><p>Yes</p><strong>{attendanceStats.yes}</strong></div>
                    <div className="stat-block"><p>Maybe</p><strong>{attendanceStats.maybe}</strong></div>
                    <div className="stat-block"><p>No</p><strong>{attendanceStats.no}</strong></div>
                    <div className="stat-block"><p>Expected</p><strong>{attendanceStats.expectedGuests}</strong></div>
                  </div>
                  <div className="mt-4 space-y-1 text-sm text-white/80">
                    <p>Coming Earliest: {attendanceStats.earliest}</p>
                    <p>Coming Latest: {attendanceStats.latest}</p>
                    <p>Average Arrival Time: {attendanceStats.average}</p>
                  </div>
                </article>

                <article className="glass-card rounded-2xl border border-white/10 p-5">
                  <h2 className="section-title">Movie Suggestions Summary</h2>
                  <ul className="space-y-2">
                    {topMovies.map((movie, index) => (
                      <li key={movie.key} className="rounded-lg border border-white/10 bg-white/5 p-3">
                        <p className="font-semibold">
                          #{index + 1} {movie.title}
                        </p>
                        <p className="text-xs text-white/70">Suggested by: {movie.suggestedBy.join(', ')}</p>
                      </li>
                    ))}
                  </ul>
                </article>
              </section>

              

              <section className="glass-card rounded-2xl border border-white/10 p-5">
                <h2 className="section-title">Random Movie Picker Wheel</h2>
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <button type="button" onClick={randomPickMovie} className={`rounded-xl px-4 py-2 font-semibold transition ${isPickingMovie ? 'animate-pulse bg-white/20' : 'bg-red-500/90 hover:bg-red-400'}`}>
                    <span className="inline-flex items-center gap-2"><PartyPopper size={16} /> Spin Picker</span>
                  </button>
                  <p className="text-sm text-white/75">{pickerResult ? `Selected: ${pickerResult}` : 'Pick a random movie from all suggestions.'}</p>
                </div>
              </section>

              <section className="mt-8 flex justify-end">
                <button
                  type="button"
                  onClick={resetAll}
                  className="rounded-2xl border border-red-300/30 bg-red-500/15 px-5 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/25 hover:text-white"
                >
                  Reset Everything
                </button>
              </section>
            </motion.section>
          ) : (
            <motion.section key="voting" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-5">
              <div className="glass-card flex flex-col gap-3 rounded-2xl border border-white/10 p-4 md:flex-row md:items-center">
                <label className="relative flex-1">
                  <Search size={16} className="pointer-events-none absolute left-3 top-3 text-white/60" />
                  <input className="field pl-9" value={movieSearch} onChange={(event) => setMovieSearch(event.target.value)} placeholder="Search movies" />
                </label>
                <select className="field md:max-w-52" value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)}>
                  {genres.map((genre) => (
                    <option key={genre} value={genre}>{genre}</option>
                  ))}
                </select>
                <select className="field md:max-w-52" value={sortMode} onChange={(event) => setSortMode(event.target.value as 'popularity' | 'title')}>
                  <option value="popularity">Sort by Popularity</option>
                  <option value="title">Sort by Title</option>
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredMovies.map((movie) => (
                  <article key={movie.key} className="glass-card overflow-hidden rounded-2xl border border-white/10">
                    <img
                      src={`https://dummyimage.com/420x560/111827/f3f4f6&text=${encodeURIComponent(movie.title)}`}
                      alt={`${movie.title} poster`}
                      className="h-44 w-full object-cover"
                      loading="lazy"
                    />
                    <div className="space-y-2 p-4">
                      <h3 className="font-display text-xl leading-tight">{movie.title}</h3>
                      <p className="text-sm text-white/75">{movie.year} • {movie.runtime} • {movie.genre}</p>
                      <p className="text-sm text-white/80">Suggested by {movie.suggestedBy.length} {movie.suggestedBy.length === 1 ? 'person' : 'people'}</p>
                      <p className="text-xs text-white/60">{movie.suggestedBy.join(', ')}</p>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button type="button" onClick={() => toggleMovieVote(movie.key, 'wantToWatch')} className={`vote-btn ${movie.vote.wantToWatch ? 'vote-positive' : ''}`}>👍 Want</button>
                        <button type="button" onClick={() => toggleMovieVote(movie.key, 'notInterested')} className={`vote-btn ${movie.vote.notInterested ? 'vote-negative' : ''}`}>👎 Pass</button>
                        <button type="button" onClick={() => toggleMovieVote(movie.key, 'favorite')} className={`vote-btn ${movie.vote.favorite ? 'vote-favorite' : ''}`}>⭐ Fav</button>
                      </div>

                      <p className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-white/70">Popularity Score: {movie.popularity}</p>
                    </div>
                  </article>
                ))}
              </div>

              <article className="glass-card rounded-2xl border border-white/10 p-5">
                <h2 className="section-title">Top 10 Ranked</h2>
                <ol className="grid gap-2 sm:grid-cols-2">
                  {filteredMovies.slice(0, 10).map((movie, index) => (
                    <li key={movie.key} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                      <strong>#{index + 1} {movie.title}</strong>
                      <p className="text-xs text-white/65">Popularity {movie.popularity}</p>
                    </li>
                  ))}
                </ol>
              </article>

              <section className="flex justify-end pt-3">
                <button
                  type="button"
                  onClick={resetAll}
                  className="rounded-2xl border border-red-300/30 bg-red-500/15 px-5 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/25 hover:text-white"
                >
                  Reset Everything
                </button>
              </section>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

export default App
