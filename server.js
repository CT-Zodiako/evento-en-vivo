import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const SITE = JSON.parse(readFileSync(join(ROOT, 'site.json'), 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

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

export function createApp({ historyPath = join(ROOT, 'history.json') } = {}) {
  return createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && pathname === '/api/site') {
        const history = await readHistory(historyPath);
        const last = history.at(-1);
        return sendJson(res, 200, { stage: SITE.stage, lastChange: last ? last.date : null });
      }
      if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname);
      sendJson(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { error: 'Internal error' });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, '0.0.0.0', () => {
    console.log(`Listening on http://localhost:${port}`);
  });
}
