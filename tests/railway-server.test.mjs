import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../railway/server.mjs';

async function start(databasePath) {
  const server = createAppServer({ databasePath });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function stop(server) {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test('Railway server serves assets and keeps Notes across a restart', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'alex-railway-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'notes.sqlite');
  let { server, base } = await start(databasePath);
  t.after(async () => { if (server.listening) await stop(server); });

  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.match(await home.text(), /Alex/);
  assert.equal((await fetch(`${base}/app.js`)).status, 200);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);

  const note = { id: crypto.randomUUID(), title: 'From Railway', body: 'A persistent message', drawing: [] };
  const posted = await fetch(`${base}/api/notes`, {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify(note),
  });
  assert.equal(posted.status, 201);
  const cookie = posted.headers.get('set-cookie').split(';')[0];
  assert.equal((await posted.json()).note.canEdit, true);

  await stop(server);
  ({ server, base } = await start(databasePath));
  const listed = await fetch(`${base}/api/notes`, { headers: { cookie } });
  assert.equal(listed.status, 200);
  const saved = (await listed.json()).notes;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].title, note.title);
  assert.equal(saved[0].canEdit, true);
});
