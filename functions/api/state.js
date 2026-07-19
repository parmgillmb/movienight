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

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS movie_night_state (
  id TEXT PRIMARY KEY NOT NULL,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
`

async function ensureStateRow(env) {
  if (!env.DB) {
    throw new Error('Missing Cloudflare Pages D1 binding named DB.')
  }

  await env.DB.exec(TABLE_SQL)

  const existing = await env.DB.prepare('SELECT state_json FROM movie_night_state WHERE id = ?1').bind('primary').first()
  if (!existing) {
    await env.DB.prepare(
      'INSERT INTO movie_night_state (id, state_json) VALUES (?1, ?2)'
    ).bind('primary', JSON.stringify(defaultState)).run()
    return defaultState
  }

  try {
    return JSON.parse(existing.state_json)
  } catch {
    await env.DB.prepare('UPDATE movie_night_state SET state_json = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1')
      .bind('primary', JSON.stringify(defaultState))
      .run()
    return defaultState
  }
}

async function saveState(env, state) {
  if (!env.DB) {
    throw new Error('Missing Cloudflare Pages D1 binding named DB.')
  }

  await env.DB.exec(TABLE_SQL)
  await env.DB.prepare(
    `
    INSERT INTO movie_night_state (id, state_json, updated_at)
    VALUES (?1, ?2, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      state_json = excluded.state_json,
      updated_at = CURRENT_TIMESTAMP
    `,
  )
    .bind('primary', JSON.stringify(state))
    .run()
}

export async function onRequest(context) {
  try {
    const { request, env } = context
    const { method } = request

    if (method === 'GET') {
      const state = await ensureStateRow(env)
      return Response.json(state)
    }

    if (method === 'PUT') {
      const state = await request.json()
      await saveState(env, state)
      return Response.json({ ok: true })
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error'
    return Response.json({ error: message }, { status: 500 })
  }
}
