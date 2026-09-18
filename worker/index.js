const COLORS = new Set(['#333333', '#2875c7', '#c94f45', '#b28723']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Keep these lists in order so existing anonymous names remain stable.
// Names are display labels only; ownership always uses the full private hash.
const NAME_ADJECTIVES = ['Misty', 'Sunny', 'Quiet', 'Gentle', 'Cozy', 'Bright', 'Merry', 'Little', 'Silver', 'Golden', 'Velvet', 'Dreamy', 'Happy', 'Lucky', 'Kind', 'Calm', 'Daring', 'Nimble', 'Jolly', 'Sleepy', 'Curious', 'Clever', 'Breezy', 'Witty', 'Soft', 'Wild', 'Dapper', 'Swift', 'Warm', 'Bold', 'Rosy', 'Snowy'];
const NAME_ANIMALS = ['Fox', 'Otter', 'Owl', 'Panda', 'Robin', 'Deer', 'Koala', 'Finch', 'Seal', 'Hare', 'Lynx', 'Wren', 'Bear', 'Cat', 'Dove', 'Swan', 'Moose', 'Tiger', 'Wolf', 'Lark', 'Badger', 'Rabbit', 'Penguin', 'Sparrow', 'Raven', 'Puffin', 'Heron', 'Gecko', 'Fawn', 'Moth', 'Bee', 'Duck'];
function anonymousName(ownerHash) {
  return `${NAME_ADJECTIVES[parseInt(ownerHash.slice(0, 2), 16) % NAME_ADJECTIVES.length]} ${NAME_ANIMALS[parseInt(ownerHash.slice(2, 4), 16) % NAME_ANIMALS.length]}`;
}
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function validateNote(value) {
  if (!value || typeof value !== 'object' || typeof value.title !== 'string' || typeof value.body !== 'string') throw new ApiError(400, 'Please enter a note.');
  if (value.title.length > 140 || value.body.length > 10000) throw new ApiError(400, 'This note is too long.');
  if (!Array.isArray(value.drawing) || value.drawing.length > 256) throw new ApiError(400, 'This drawing has too many strokes.');
  let pointCount = 0;
  const drawing = value.drawing.map(stroke => {
    if (!stroke || !['pen', 'eraser'].includes(stroke.tool) || !COLORS.has(stroke.color) || ![4, 20].includes(stroke.width) || !Array.isArray(stroke.points) || !stroke.points.length) throw new ApiError(400, 'Invalid drawing.');
    pointCount += stroke.points.length;
    if (pointCount > 20000) throw new ApiError(400, 'This drawing is full. Please start another note.');
    const points = stroke.points.map(point => {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || point[0] < 0 || point[0] > 960 || point[1] < 0 || point[1] > 540) throw new ApiError(400, 'Invalid drawing coordinates.');
      return point.map(n => Math.round(n * 10) / 10);
    });
    return { tool: stroke.tool, color: stroke.color, width: stroke.width, points };
  });
  if (!value.title.trim() && !value.body.trim() && !drawing.some(s => s.tool === 'pen')) throw new ApiError(400, 'Write a message or add a drawing first.');
  return { title: value.title.trim() || 'Untitled note', body: value.body.trim(), drawing };
}

async function readPayload(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'Expected a note in JSON format.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Missing note.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 512000) { await reader.cancel(); throw new ApiError(413, 'This note is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ApiError(400, 'Invalid note data.'); }
}

async function visitor(request) {
  const existing = request.headers.get('cookie')?.match(/(?:^|;\s*)alex_notes_owner=([a-f0-9]{64})(?:;|$)/)?.[1];
  const token = existing || Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('');
  return { hash, cookie: existing ? null : `alex_notes_owner=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}` };
}

function json(value, status = 200, cookie = null) {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (cookie) headers['set-cookie'] = cookie;
  return new Response(JSON.stringify(value), { status, headers });
}

function record(row, owner) {
  return { id: row.id, title: row.title, body: row.body, drawing: JSON.parse(row.drawing), createdAt: row.created_at, updatedAt: row.updated_at, revision: row.revision, authorName: anonymousName(row.owner_hash), canEdit: row.owner_hash === owner };
}

function notesStore(db) {
  return {
    get: id => db.prepare('SELECT * FROM guest_notes WHERE id = ?').bind(id).first(),
    async list(owner, before, id) {
      return db.prepare(`SELECT id, owner_hash, title, substr(body, 1, 140) AS snippet, drawing != '[]' AS hasDrawing,
        created_at AS createdAt, updated_at AS updatedAt, revision, owner_hash = ? AS canEdit
        FROM guest_notes WHERE deleted_at IS NULL AND (created_at < ? OR (created_at = ? AND id < ?))
        ORDER BY created_at DESC, id DESC LIMIT 31`).bind(owner, before, before, id).all();
    },
    countRecent: (owner, since) => db.prepare('SELECT count(*) AS total FROM guest_notes WHERE owner_hash = ? AND created_at > ?').bind(owner, since).first(),
    insert: (id, owner, note, now) => db.prepare('INSERT INTO guest_notes (id, owner_hash, title, body, drawing, created_at, updated_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO NOTHING').bind(id, owner, note.title, note.body, JSON.stringify(note.drawing), now, now).run(),
    update: (id, owner, note, now, revision) => db.prepare('UPDATE guest_notes SET title = ?, body = ?, drawing = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND owner_hash = ? AND revision = ? AND deleted_at IS NULL').bind(note.title, note.body, JSON.stringify(note.drawing), now, id, owner, revision).run(),
    remove: (id, owner, now, revision) => db.prepare('UPDATE guest_notes SET deleted_at = ?, revision = revision + 1 WHERE id = ? AND owner_hash = ? AND revision = ? AND deleted_at IS NULL').bind(now, id, owner, revision).run(),
    restore: (id, owner, revision) => db.prepare('UPDATE guest_notes SET deleted_at = NULL, revision = revision + 1 WHERE id = ? AND owner_hash = ? AND revision = ? AND deleted_at IS NOT NULL').bind(id, owner, revision).run(),
  };
}

async function handleNotes(request, env) {
  const url = new URL(request.url);
  if (!env.DB) return json({ error: 'The guestbook is temporarily unavailable. Your draft is safe.' }, 503);
  let session;
  try {
    const match = url.pathname.match(/^\/api\/notes(?:\/([^/]+))?(\/restore)?$/);
    if (!match) throw new ApiError(404, 'Not found.');
    const id = match[1];
    const restoring = !!match[2];
    if (restoring && (!id || request.method !== 'POST')) throw new ApiError(405, 'Method not allowed.');
    if (id && !UUID.test(id)) throw new ApiError(404, 'Note not found.');
    session = await visitor(request);
    const store = notesStore(env.DB);
    if (request.method === 'GET' && !id) {
      const cursor = url.searchParams.get('cursor');
      const parts = cursor?.split('_');
      const before = parts ? Number(parts[0]) : Number.MAX_SAFE_INTEGER;
      const lastId = parts ? parts[1] : '~';
      if (!Number.isSafeInteger(before) || (parts && (parts.length !== 2 || !UUID.test(lastId)))) throw new ApiError(400, 'Invalid page.');
      const result = await store.list(session.hash, before, lastId);
      const rows = result.results.slice(0, 30).map(({ owner_hash, ...row }) => ({ ...row, authorName: anonymousName(owner_hash), canEdit: !!row.canEdit, hasDrawing: !!row.hasDrawing }));
      const last = rows.at(-1);
      return json({ notes: rows, cursor: result.results.length > 30 ? `${last.createdAt}_${last.id}` : null }, 200, session.cookie);
    }
    if (request.method === 'GET' && id) {
      const row = await store.get(id);
      if (!row || row.deleted_at !== null) throw new ApiError(404, 'This note is no longer available.');
      return json({ note: record(row, session.hash) }, 200, session.cookie);
    }
    if (!['POST', 'PATCH', 'DELETE'].includes(request.method) || (request.method === 'POST' && id && !restoring) || (['PATCH','DELETE'].includes(request.method) && !id)) throw new ApiError(405, 'Method not allowed.');
    if (request.headers.get('origin') !== url.origin) throw new ApiError(403, 'Please post from this website.');
    const payload = await readPayload(request);
    if (request.method === 'DELETE' || restoring) {
      const current = await store.get(id);
      if (!current) throw new ApiError(404, 'Note not found.');
      if (current.owner_hash !== session.hash) throw new ApiError(403, 'You can only change notes posted from this browser.');
      if (request.method === 'DELETE' && current.deleted_at !== null) return json({ id, revision: current.revision }, 200, session.cookie);
      if (restoring && current.deleted_at === null) return json({ note: record(current, session.hash) }, 200, session.cookie);
      if (!Number.isSafeInteger(payload?.revision) || payload.revision !== current.revision) throw new ApiError(409, 'This note changed in another tab. Reopen it and try again.');
      const result = restoring ? await store.restore(id, session.hash, payload.revision) : await store.remove(id, session.hash, Date.now(), payload.revision);
      if (!result.meta.changes) throw new ApiError(409, 'This note changed in another tab. Reopen it and try again.');
      return json(restoring ? { note: record(await store.get(id), session.hash) } : { id, revision: current.revision + 1 }, 200, session.cookie);
    }
    const note = validateNote(payload);
    const now = Date.now();
    if (request.method === 'POST') {
      if (!UUID.test(payload.id || '')) throw new ApiError(400, 'Invalid note ID.');
      const existing = await store.get(payload.id);
      if (existing) {
        if (existing.deleted_at !== null) throw new ApiError(409, 'This note was deleted. Please start a new note.');
        if (existing.owner_hash !== session.hash) throw new ApiError(409, 'Please start a new note.');
        return json({ note: record(existing, session.hash) }, 200, session.cookie);
      }
      const recent = await store.countRecent(session.hash, now - 3600000);
      if (recent.total >= 10) throw new ApiError(429, 'You have posted several notes. Please try again in an hour. Your draft is kept.');
      await store.insert(payload.id, session.hash, note, now);
      const created = await store.get(payload.id);
      if (created.owner_hash !== session.hash) throw new ApiError(409, 'Please start a new note.');
      return json({ note: record(created, session.hash) }, 201, session.cookie);
    }
    const current = await store.get(id);
    if (!current || current.deleted_at !== null) throw new ApiError(404, 'Note not found.');
    if (current.owner_hash !== session.hash) throw new ApiError(403, 'You can only edit notes posted from this browser.');
    if (!Number.isSafeInteger(payload.revision) || payload.revision !== current.revision) throw new ApiError(409, 'This note changed in another tab. Your draft is kept. Reload the note before saving again.');
    const result = await store.update(id, session.hash, note, now, payload.revision);
    if (!result.meta.changes) throw new ApiError(409, 'This note changed in another tab. Your draft is kept.');
    return json({ note: record(await store.get(id), session.hash) }, 200, session.cookie);
  } catch (error) {
    if (!(error instanceof ApiError)) console.error('Notes API failed:', error.message);
    return json({ error: error instanceof ApiError ? error.message : 'The guestbook is temporarily unavailable. Your draft is kept; please try again.' }, error instanceof ApiError ? error.status : 503, session?.cookie);
  }
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/')) return handleNotes(request, env);
    return env.ASSETS.fetch(request);
  },
};
