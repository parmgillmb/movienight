import { AnimatePresence, motion } from 'framer-motion'
import {
  CalendarDays,
  Clock3,
  Edit3,
  Film,
  House,
  Moon,
  PartyPopper,
  Pizza,
  Plus,
  Search,
  Sparkles,
  Star,
  Sun,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type Theme = 'dark' | 'light'
type AttendanceStatus = 'yes' | 'maybe' | 'no'
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

type SnackSignup = {
  id: string
  item: string
  by: string
}

type PizzaPoll = {
  pepperoni: number
  veggie: number
  cheese: number
  hawaiian: number
}

type MovieVote = {
  wantToWatch: boolean
  notInterested: boolean
  favorite: boolean
}

type AppState = {
  theme: Theme
  details: MovieNightDetails
  friends: Friend[]
  snackSignups: SnackSignup[]
  pizzaPoll: PizzaPoll
  movieVotes: Record<string, MovieVote>
}

type MovieMeta = {
  year: number
  runtime: string
  genre: string
}

const STORAGE_KEY = 'movie-night-planner-v1'

const ARRIVAL_OPTIONS = ['6:30 PM', '6:45 PM', '7:00 PM', '7:15 PM', '7:30 PM', '7:45 PM']

const FRIENDS = ['Nik', 'Sebastian', 'Mattias', 'Robbie', 'Ethan', 'Cam', 'Parmeet', 'Raph', 'Aiden']

const DEFAULT_MOVIES: Record<string, string[]> = {
  Nik: ['Interstellar', 'The Batman', 'Dune Part Two'],
  Sebastian: ['The Prestige', 'Blade Runner 2049', 'Arrival'],
  Mattias: ['Interstellar', 'The Dark Knight', 'Whiplash'],
  Robbie: ['Dune Part Two', 'The Lord of the Rings', 'Mad Max: Fury Road'],
  Ethan: ['The Dark Knight', 'Inception', 'Top Gun: Maverick'],
  Cam: ['The Prestige', 'Spider-Man: Into the Spider-Verse', 'The Matrix'],
  Parmeet: ['Interstellar', 'The Dark Knight', 'The Prestige', 'Dune Part Two'],
  Raph: ['Everything Everywhere All at Once', 'John Wick', 'The Social Network'],
  Aiden: ['Oppenheimer', 'The Matrix', 'Avengers: Endgame'],
}

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

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  yes: 'bg-emerald-500/25 text-emerald-200 ring-2 ring-emerald-400/60',
  maybe: 'bg-amber-500/25 text-amber-100 ring-2 ring-amber-400/60',
  no: 'bg-rose-500/25 text-rose-100 ring-2 ring-rose-400/60',
}

const createId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

const normalizeTitle = (value: string) => value.trim().toLowerCase()

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

const defaultState: AppState = {
  theme: 'dark',
  details: {
    title: 'Movie Night #12',
    date: '2026-08-08',
    plannedStartTime: '19:00',
    location: "Parmeet's House",
    host: 'Parmeet',
    notes: 'Bring your best snacks and arrive 15 minutes early for trailers.',
  },
  friends: FRIENDS.map((name, index) => ({
    id: createId(),
    name,
    status: index < 5 ? 'yes' : index < 7 ? 'maybe' : 'no',
    arrivalTime: ARRIVAL_OPTIONS[index % ARRIVAL_OPTIONS.length],
    comments: ['Bringing snacks', 'Running late', 'Need a ride', "I'll bring drinks"][index % 4],
    movies: (DEFAULT_MOVIES[name] ?? []).map((title, movieIndex) => ({
      id: `${name}-${movieIndex}-${normalizeTitle(title)}`,
      title,
      favorite: movieIndex === 0,
    })),
  })),
  snackSignups: [
    { id: createId(), item: 'Popcorn', by: 'Nik' },
    { id: createId(), item: 'Coke Zero', by: 'Parmeet' },
    { id: createId(), item: 'Nachos', by: 'Ethan' },
  ],
  pizzaPoll: {
    pepperoni: 4,
    veggie: 2,
    cheese: 1,
    hawaiian: 2,
  },
  movieVotes: {},
}

const readState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState
    return JSON.parse(raw) as AppState
  } catch {
    return defaultState
  }
}

function App() {
  const [state, setState] = useState<AppState>(readState)
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [movieSearch, setMovieSearch] = useState('')
  const [genreFilter, setGenreFilter] = useState('All')
  const [sortMode, setSortMode] = useState<'popularity' | 'title'>('popularity')
  const [draftMovies, setDraftMovies] = useState<Record<string, string>>({})
  const [draggedMovie, setDraggedMovie] = useState<{ friendId: string; movieId: string } | null>(null)
  const [newSnackItem, setNewSnackItem] = useState('')
  const [newSnackBy, setNewSnackBy] = useState(state.friends[0]?.name ?? '')
  const [now, setNow] = useState(Date.now())
  const [pickerResult, setPickerResult] = useState('')
  const [isPickingMovie, setIsPickingMovie] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme)
  }, [state.theme])

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

  const incrementPizzaVote = (option: keyof PizzaPoll, delta: number) => {
    setState((prev) => ({
      ...prev,
      pizzaPoll: {
        ...prev.pizzaPoll,
        [option]: Math.max(0, prev.pizzaPoll[option] + delta),
      },
    }))
  }

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

  const addSnackItem = () => {
    const item = newSnackItem.trim()
    if (!item) return
    setState((prev) => ({
      ...prev,
      snackSignups: [...prev.snackSignups, { id: createId(), item, by: newSnackBy }],
    }))
    setNewSnackItem('')
  }

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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setState((prev) => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }))}
                className="rounded-xl border border-white/20 px-3 py-2 text-sm font-medium transition hover:bg-white/10"
              >
                <span className="inline-flex items-center gap-2">
                  {state.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                  Theme: {state.theme === 'dark' ? 'Dark' : 'Light'}
                </span>
              </button>
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
                  {state.friends.map((friend, index) => (
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
                            className={`rounded-lg px-2 py-2 text-sm font-semibold transition ${friend.status === status ? STATUS_STYLES[status] : 'bg-white/5 hover:bg-white/10'}`}
                          >
                            {status === 'yes' ? '✅' : status === 'maybe' ? '❓' : '❌'} {label}
                          </button>
                        ))}
                      </div>

                      <label className="text-xs uppercase tracking-wide text-white/60">Arrival Time</label>
                      <select
                        className="field mt-1"
                        value={friend.arrivalTime}
                        onChange={(event) => updateFriend(friend.id, (current) => ({ ...current, arrivalTime: event.target.value }))}
                      >
                        {ARRIVAL_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>

                      <label className="mt-3 block text-xs uppercase tracking-wide text-white/60">Comments</label>
                      <textarea
                        className="field mt-1 min-h-20 resize-y"
                        value={friend.comments}
                        onChange={(event) => updateFriend(friend.id, (current) => ({ ...current, comments: event.target.value }))}
                        placeholder="Bringing snacks, running late, need a ride..."
                      />

                      <details className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
                        <summary className="cursor-pointer font-medium">Movies I Want to Watch</summary>
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
                  ))}
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

              <section className="grid gap-4 lg:grid-cols-3">
                <article className="glass-card rounded-2xl border border-white/10 p-5 lg:col-span-2">
                  <h2 className="section-title">Snack & Drink Signup</h2>
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                    <input className="field" value={newSnackItem} onChange={(event) => setNewSnackItem(event.target.value)} placeholder="Add snack or drink" />
                    <select className="field sm:max-w-44" value={newSnackBy} onChange={(event) => setNewSnackBy(event.target.value)}>
                      {state.friends.map((friend) => (
                        <option key={friend.id} value={friend.name}>{friend.name}</option>
                      ))}
                    </select>
                    <button type="button" onClick={addSnackItem} className="rounded-lg bg-red-500/90 px-4 py-2 font-semibold transition hover:bg-red-400">Add</button>
                  </div>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {state.snackSignups.map((snack) => (
                      <li key={snack.id} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                        <span className="font-medium">{snack.item}</span>
                        <span className="text-white/70"> by {snack.by}</span>
                      </li>
                    ))}
                  </ul>
                </article>

                <article className="glass-card rounded-2xl border border-white/10 p-5">
                  <h2 className="section-title">Pizza Poll</h2>
                  {(
                    [
                      ['pepperoni', 'Pepperoni'],
                      ['veggie', 'Veggie'],
                      ['cheese', 'Cheese'],
                      ['hawaiian', 'Hawaiian'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="mb-2 flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                      <span className="inline-flex items-center gap-2"><Pizza size={14} /> {label}</span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => incrementPizzaVote(key, -1)} className="mini-btn">-</button>
                        <strong>{state.pizzaPoll[key]}</strong>
                        <button type="button" onClick={() => incrementPizzaVote(key, 1)} className="mini-btn">+</button>
                      </div>
                    </div>
                  ))}
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
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

export default App
