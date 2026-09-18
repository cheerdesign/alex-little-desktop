import { createServer as createHttpServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createReadStream, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import worker from '../worker/index.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const MIGRATIONS = join(ROOT, 'drizzle');
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

function migrate(database) {
  database.exec('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY NOT NULL)');
  const applied = database.prepare('SELECT 1 FROM app_migrations WHERE name = ?');
  const markApplied = database.prepare('INSERT INTO app_migrations (name) VALUES (?)');
  for (const name of readdirSync(MIGRATIONS).filter(file => file.endsWith('.sql')).sort()) {
    if (applied.get(name)) continue;
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(readFileSync(join(MIGRATIONS, name), 'utf8'));
      markApplied.run(name);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
}

function d1Adapter(database) {
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      return {
        bind(...values) {
          return {
            async first() { return statement.get(...values) ?? null; },
            async all() { return { results: statement.all(...values) }; },
            async run() { return { meta: statement.run(...values) }; },
          };
        },
      };
    },
  };
}

function sendStatic(request, response, pathname, publicDir) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { response.writeHead(400).end(); return; }
  if (decoded.includes('\0') || decoded.split('/').includes('..')) { response.writeHead(403).end(); return; }
  const file = resolve(publicDir, decoded.replace(/^\/+/, '') || 'index.html');
  const root = resolve(publicDir);
  if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  let info;
  try { info = statSync(file); }
  catch { response.writeHead(404).end(); return; }
  if (!info.isFile()) { response.writeHead(404).end(); return; }
  const extension = file.slice(file.lastIndexOf('.'));
  const headers = {
    'Content-Type': MIME[extension] || 'application/octet-stream',
    'Content-Length': info.size,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
  };
  response.writeHead(200, headers);
  if (request.method === 'HEAD') { response.end(); return; }
  createReadStream(file).pipe(response);
}

export function createAppServer({ databasePath, publicDir = PUBLIC } = {}) {
  if (!databasePath) throw new Error('A persistent database path is required.');
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath, { timeout: 5000 });
  database.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  migrate(database);
  const env = { DB: d1Adapter(database) };
  const server = createHttpServer(async (request, response) => {
    try {
      const forwardedProtocol = request.headers['x-forwarded-proto'];
      const protocol = (typeof forwardedProtocol === 'string' ? forwardedProtocol.split(',')[0] : undefined) || (request.socket.encrypted ? 'https' : 'http');
      const origin = `${protocol}://${request.headers.host}`;
      const url = new URL(request.url || '/', origin);
      if (url.pathname === '/healthz') { response.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok'); return; }
      if (!url.pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
        sendStatic(request, response, url.pathname, publicDir);
        return;
      }
      const body = ['GET', 'HEAD'].includes(request.method) ? undefined : Readable.toWeb(request);
      const webRequest = new Request(url, { method: request.method, headers: request.headers, body, duplex: body ? 'half' : undefined });
      const result = await worker.fetch(webRequest, env);
      response.writeHead(result.status, Object.fromEntries(result.headers));
      if (result.body) Readable.fromWeb(result.body).pipe(response);
      else response.end();
    } catch (error) {
      console.error('Request failed:', error);
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain' });
      response.end('The website is temporarily unavailable.');
    }
  });
  server.on('close', () => database.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.env.RAILWAY_PROJECT_ID && !process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    throw new Error('Attach a Railway volume before starting the site, so Notes are not lost on redeploy.');
  }
  const databasePath = process.env.DATABASE_PATH || join(process.env.RAILWAY_VOLUME_MOUNT_PATH || join(ROOT, 'data'), 'notes.sqlite');
  const port = Number(process.env.PORT || 3000);
  const server = createAppServer({ databasePath });
  server.listen(port, '0.0.0.0', () => console.log(`Alex's little desktop listening on ${port}`));
}
