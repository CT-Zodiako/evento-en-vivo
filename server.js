import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { isOffensive } from './filter.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const SITE = JSON.parse(readFileSync(join(ROOT, 'site.json'), 'utf8'));
const ROLES = new Set(['estudiante', 'profesor']);
const MAX_BODY_BYTES = 4 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readHistory(historyPath) {
  try {
    return JSON.parse(await readFile(historyPath, 'utf8'));
  } catch {
    return [];
  }
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'La solicitud es demasiado grande.');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

// Each browser gets an anonymous id cookie, used for rate limiting and one vote per person.
function visitorId(req, res) {
  const match = /(?:^|;\s*)vid=([0-9a-f-]{36})/.exec(req.headers.cookie || '');
  if (match) return match[1];
  const id = randomUUID();
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('set-cookie', `vid=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`);
  return id;
}

function sameSecret(given, expected) {
  // Hash both sides so timingSafeEqual always compares equal-length buffers.
  const a = createHash('sha256').update(String(given)).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function createEventHub() {
  const clients = new Set();
  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, 25_000);
  heartbeat.unref();
  return {
    subscribe(req, res) {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.write('retry: 3000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
    },
    broadcast(event, data) {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const res of clients) res.write(payload);
    },
    get size() {
      return clients.size;
    },
  };
}

async function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return sendJson(res, 400, { error: 'Bad path' });
  }
  if (decoded.endsWith('/')) decoded += 'index.html';
  const filePath = normalize(join(PUBLIC_DIR, decoded));
  if (!filePath.startsWith(PUBLIC_DIR + sep)) return sendJson(res, 404, { error: 'Not found' });
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

export function createApp({
  historyPath = join(ROOT, 'history.json'),
  dbPath = process.env.DB_PATH || join(ROOT, 'data', 'evento.db'),
  adminKey = process.env.ADMIN_KEY || '',
  messageCooldownMs = 5_000,
} = {}) {
  const db = openDb(dbPath);
  const events = createEventHub();
  const lastMessageAt = new Map();

  async function postMessage(req, res) {
    const id = visitorId(req, res);
    const { text, role } = await readJson(req);
    const clean = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
    const length = [...clean].length;
    if (length < 1 || length > 140) throw new HttpError(400, 'El mensaje debe tener entre 1 y 140 caracteres.');
    if (!ROLES.has(role)) throw new HttpError(400, 'Elige si eres estudiante o profesor.');
    if (isOffensive(clean)) throw new HttpError(422, 'Tu mensaje contiene palabras no permitidas.');
    const now = Date.now();
    if (now - (lastMessageAt.get(id) ?? -Infinity) < messageCooldownMs) {
      throw new HttpError(429, 'Espera unos segundos antes de enviar otro mensaje.');
    }
    lastMessageAt.set(id, now);
    const message = db.addMessage(clean, role);
    events.broadcast('message', message);
    sendJson(res, 201, { message });
  }

  function hideMessage(req, res, messageId) {
    if (!adminKey) throw new HttpError(503, 'La moderación está desactivada: falta configurar ADMIN_KEY.');
    if (!sameSecret(req.headers['x-admin-key'] ?? '', adminKey)) throw new HttpError(401, 'Clave incorrecta.');
    if (!db.hideMessage(messageId)) throw new HttpError(404, 'El mensaje no existe.');
    events.broadcast('hide', { id: messageId });
    sendJson(res, 200, { ok: true });
  }

  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && pathname === '/api/site') {
        const history = await readHistory(historyPath);
        const last = history.at(-1);
        return sendJson(res, 200, { stage: SITE.stage, lastChange: last ? last.date : null });
      }
      if (req.method === 'GET' && pathname === '/api/events') return events.subscribe(req, res);
      if (req.method === 'GET' && pathname === '/api/messages') {
        return sendJson(res, 200, { messages: db.listMessages(), moderation: Boolean(adminKey) });
      }
      if (req.method === 'POST' && pathname === '/api/messages') return await postMessage(req, res);
      const hide = /^\/api\/messages\/(\d+)\/hide$/.exec(pathname);
      if (req.method === 'POST' && hide) return hideMessage(req, res, Number(hide[1]));
      if (pathname.startsWith('/api/')) throw new HttpError(404, 'Not found');
      if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res, pathname);
      sendJson(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { error: 'Error interno.' });
    }
  });
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, '0.0.0.0', () => {
    console.log(`Listening on http://localhost:${port}`);
    if (!process.env.ADMIN_KEY) console.warn('ADMIN_KEY is not set: hiding messages is disabled.');
  });
}
