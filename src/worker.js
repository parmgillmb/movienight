const FRIENDS = ['Nik', 'Sebastian', 'Mattias', 'Robbie', 'Ethan', 'Cam', 'Parmeet', 'Raph', 'Aiden']

const DEFAULT_DETAILS = {
  title: 'Movie Night #12',
  date: '2026-08-08',
  plannedStartTime: '19:00',
  location: "Parmeet's House",
  host: 'Parmeet',
  notes: 'Bring your best snacks and arrive 15 minutes early for trailers.',
}

const defaultState = {
  details: { ...DEFAULT_DETAILS },
  friends: FRIENDS.map((name, index) => ({
    id: `friend-${index + 1}`,
    name,
    status: '',
    arrivalTime: '7:00 PM',
    comments: '',
    movies: [],
  })),
  movieVotes: {},
}

// Single-line form: D1's env.DB.exec() parses input line-by-line and rejects a
// multi-line statement ("incomplete input"), so keep this on one line. We use
// prepare().run() below, which is robust either way.
const TABLE_SQL =
  'CREATE TABLE IF NOT EXISTS movie_night_state (id TEXT PRIMARY KEY NOT NULL, state_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'

// Older deployments created the table before `version` existed; add it if missing.
async function ensureSchema(env) {
  await env.DB.prepare(TABLE_SQL).run()
  try {
    await env.DB.prepare('ALTER TABLE movie_night_state ADD COLUMN version INTEGER NOT NULL DEFAULT 1').run()
  } catch {
    // Column already exists — SQLite throws a duplicate-column error we can ignore.
  }
}

// Reads the shared row, seeding it with defaults on first run.
// Returns { state, version } so callers can enforce optimistic concurrency.
async function readState(env) {
  if (!env.DB) {
    throw new Error('Missing Cloudflare D1 binding named DB.')
  }

  await ensureSchema(env)

  const existing = await env.DB.prepare(
    'SELECT state_json, version FROM movie_night_state WHERE id = ?1',
  )
    .bind('primary')
    .first()

  if (!existing) {
    await env.DB.prepare('INSERT INTO movie_night_state (id, state_json, version) VALUES (?1, ?2, 1)')
      .bind('primary', JSON.stringify(defaultState))
      .run()
    return { state: defaultState, version: 1 }
  }

  try {
    return { state: JSON.parse(existing.state_json), version: existing.version }
  } catch {
    await env.DB.prepare(
      'UPDATE movie_night_state SET state_json = ?2, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?1',
    )
      .bind('primary', JSON.stringify(defaultState))
      .run()
    return { state: defaultState, version: existing.version + 1 }
  }
}

// Saves state only if `baseVersion` matches the row's current version, then
// bumps the version. Returns { ok: true, version } on success, or
// { conflict: true, version, state } if someone else saved first.
async function saveState(env, state, baseVersion) {
  if (!env.DB) {
    throw new Error('Missing Cloudflare D1 binding named DB.')
  }

  await ensureSchema(env)

  // Conditional update: only writes when the version still matches what the
  // client based its edit on. D1/SQLite runs this atomically, so two
  // concurrent saves can't both succeed.
  const result = await env.DB.prepare(
    `
    UPDATE movie_night_state
    SET state_json = ?2, version = version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?1 AND version = ?3
    `,
  )
    .bind('primary', JSON.stringify(state), baseVersion)
    .run()

  if (result.meta.changes === 1) {
    return { ok: true, version: baseVersion + 1 }
  }

  // No row updated: either the version moved on (conflict) or the row is
  // missing. Re-read so the client can reconcile against fresh state.
  const current = await readState(env)
  return { conflict: true, version: current.version, state: current.state }
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url)

      if (url.pathname === '/api/state') {
        if (request.method === 'GET') {
          const { state, version } = await readState(env)
          return Response.json({ state, version })
        }

        if (request.method === 'PUT') {
          const body = await request.json()

          // Accept both the versioned envelope { state, version } and, for
          // safety, allow an explicit version via header.
          const state = body && body.state !== undefined ? body.state : body
          const baseVersion = Number(
            body && body.version !== undefined ? body.version : request.headers.get('If-Match-Version'),
          )

          if (!Number.isInteger(baseVersion) || baseVersion < 1) {
            return Response.json(
              { error: 'Missing or invalid version. Send { state, version } from the last GET.' },
              { status: 400 },
            )
          }

          const outcome = await saveState(env, state, baseVersion)

          if (outcome.conflict) {
            return Response.json(
              { error: 'Version conflict — someone else saved first.', ...outcome },
              { status: 409 },
            )
          }

          return Response.json(outcome)
        }

        return Response.json({ error: 'Method not allowed' }, { status: 405 })
      }

      return env.ASSETS.fetch(request)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown sync error'
      return Response.json({ error: message }, { status: 500 })
    }
  },
}
