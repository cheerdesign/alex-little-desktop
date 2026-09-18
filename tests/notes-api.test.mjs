import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../worker/index.js';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  const env = { DB: { prepare(sql) {
    const statement = sqlite.prepare(sql);
    return { bind(...values) { return {
      async first() { return statement.get(...values) ?? null; },
      async all() { return { results: statement.all(...values) }; },
      async run() { return { meta: statement.run(...values) }; },
    }; } };
  } }, ASSETS: { fetch: async () => new Response('desktop') } };
  async function request(path = '', method = 'GET', value, cookie, origin = 'https://alex.example') {
    const headers = { origin, 'content-type': 'application/json' };
    if (cookie) headers.cookie = cookie;
    const response = await worker.fetch(new Request('https://alex.example/api/notes' + path, { method, headers, body: value === undefined ? undefined : JSON.stringify(value) }), env);
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], data: await response.json() };
  }
  return { request, sqlite };
}
const drawing = [{ tool: 'pen', color: '#333333', width: 4, points: [[10,20],[30,40]] }];

test('published messages and drawings are shared; only the author can edit; retries are idempotent', async t => {
  const { request, sqlite } = setup(); t.after(() => sqlite.close());
  const author = (await request()).cookie;
  const visitor = (await request()).cookie;
  assert.notEqual(author, visitor);
  const value = { id: crypto.randomUUID(), title: 'Hello!', body: '<script>hello</script>', drawing };
  const created = await request('', 'POST', value, author);
  assert.equal(created.status, 201); assert.equal(created.data.note.canEdit, true);
  const authorName = created.data.note.authorName;
  assert.match(authorName, /^[A-Z][a-z]+ [A-Z][a-z]+$/);
  assert.deepEqual(created.data.note.drawing, drawing);
  const list = await request('', 'GET', undefined, visitor);
  assert.equal(list.data.notes.length, 1); assert.equal(list.data.notes[0].canEdit, false);
  assert.equal(list.data.notes[0].hasDrawing, true);
  assert.equal(list.data.notes[0].authorName, authorName);
  assert.equal('owner_hash' in list.data.notes[0], false);
  const read = await request('/' + value.id, 'GET', undefined, visitor);
  assert.equal(read.data.note.body, value.body); assert.deepEqual(read.data.note.drawing, drawing);
  assert.equal('owner_hash' in read.data.note, false);
  assert.equal(read.data.note.authorName, authorName);
  const denied = await request('/' + value.id, 'PATCH', { ...value, revision: 1 }, visitor);
  assert.equal(denied.status, 403);
  const edited = await request('/' + value.id, 'PATCH', { ...value, title: 'Updated', authorName: 'Fake Name', revision: 1 }, author);
  assert.equal(edited.status, 200); assert.equal(edited.data.note.revision, 2);
  assert.equal(edited.data.note.authorName, authorName);
  assert.equal((await request('/' + value.id, 'PATCH', { ...value, revision: 1 }, author)).status, 409);
  assert.equal((await request('', 'POST', value, author)).status, 200);
  assert.equal((await request()).data.notes.length, 1);
  const next = await request('', 'POST', { ...value, id: crypto.randomUUID() }, author);
  assert.equal(next.data.note.authorName, authorName);
});

test('rejects cross-site writes, empty notes, malformed drawings, oversized payloads and invalid cursors', async t => {
  const { request, sqlite } = setup(); t.after(() => sqlite.close());
  const author = (await request()).cookie;
  const value = { id: crypto.randomUUID(), title: 'Hello', body: '', drawing: [] };
  assert.equal((await request('', 'POST', value, author, 'https://elsewhere.example')).status, 403);
  assert.equal((await request('', 'POST', { ...value, title: '' }, author)).status, 400);
  assert.equal((await request('', 'POST', { ...value, drawing: [{ ...drawing[0], points: [[-1,20]] }] }, author)).status, 400);
  assert.equal((await request('', 'POST', { ...value, body: 'x'.repeat(512001) }, author)).status, 413);
  assert.equal((await request('?cursor=invalid')).status, 400);
  assert.equal((await request()).data.notes.length, 0);
});

test('pagination does not omit notes with matching timestamps', async t => {
  const { request, sqlite } = setup(); t.after(() => sqlite.close());
  const insert = sqlite.prepare('INSERT INTO guest_notes (id, owner_hash, title, body, drawing, created_at, updated_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, 1)');
  for (let i = 0; i < 35; i++) insert.run(crypto.randomUUID(), '0'.repeat(64), 'Note ' + i, '', '[]', 100, 100);
  const first = await request();
  assert.equal(first.data.notes.length, 30); assert.ok(first.data.cursor);
  const second = await request('?cursor=' + first.data.cursor);
  assert.equal(second.data.notes.length, 5); assert.equal(second.data.cursor, null);
  assert.equal(new Set([...first.data.notes, ...second.data.notes].map(n => n.id)).size, 35);
  assert.ok([...first.data.notes, ...second.data.notes].every(n => n.authorName === 'Misty Fox'));
});

test('only the author can delete and undo; deleted notes disappear and cannot be edited or recreated by retry', async t => {
  const { request, sqlite } = setup(); t.after(() => sqlite.close());
  const author = (await request()).cookie;
  const visitor = (await request()).cookie;
  const value = { id: crypto.randomUUID(), title: 'Delete and undo', body: 'Keep my drawing when restored.', drawing };
  await request('', 'POST', value, author);
  const path = '/' + value.id;
  assert.equal((await request(path, 'DELETE', { revision: 1 }, visitor)).status, 403);
  assert.equal((await request(path, 'DELETE', { revision: 1 }, author, 'https://elsewhere.example')).status, 403);
  assert.equal((await request(path, 'DELETE', { revision: 0 }, author)).status, 409);
  const removed = await request(path, 'DELETE', { revision: 1 }, author);
  assert.equal(removed.status, 200); assert.equal(removed.data.revision, 2);
  assert.equal((await request(path, 'GET', undefined, visitor)).status, 404);
  assert.equal((await request()).data.notes.length, 0);
  assert.equal((await request(path, 'DELETE', { revision: 1 }, author)).status, 200);
  assert.equal((await request(path, 'PATCH', { ...value, revision: 2 }, author)).status, 404);
  assert.equal((await request('', 'POST', value, author)).status, 409);
  assert.equal((await request(path + '/restore', 'POST', { revision: 2 }, visitor)).status, 403);
  assert.equal((await request(path + '/restore', 'POST', { revision: 2 }, author, 'https://elsewhere.example')).status, 403);
  assert.equal((await request(path + '/restore', 'POST', { revision: 1 }, author)).status, 409);
  const restored = await request(path + '/restore', 'POST', { revision: 2 }, author);
  assert.equal(restored.status, 200); assert.equal(restored.data.note.revision, 3);
  assert.deepEqual(restored.data.note.drawing, drawing);
  assert.equal((await request()).data.notes.length, 1);
  assert.equal((await request(path + '/restore', 'POST', { revision: 2 }, author)).status, 200);
});
