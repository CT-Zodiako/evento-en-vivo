import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';
import { qrMatrix, qrTerminal } from '../qr.js';

const servers = [];

async function start(options) {
  const dir = mkdtempSync(join(tmpdir(), 'qr-'));
  const server = createApp({ dbPath: join(dir, 'test.db'), ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

after(() => servers.forEach((s) => { s.closeAllConnections(); s.close(); }));

test('the configured public URL is exposed and drawn as an SVG QR code', async () => {
  const base = await start({ publicUrl: 'https://evento.example.app' });
  const site = await (await fetch(`${base}/api/site`)).json();
  assert.equal(site.publicUrl, 'https://evento.example.app');

  const res = await fetch(`${base}/qr.svg`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /image\/svg\+xml/);
  const svg = await res.text();
  assert.match(svg, /^<svg[^>]*viewBox/);
  assert.match(svg, /<title>https:\/\/evento\.example\.app<\/title>/);
});

test('without configuration the public URL comes from the proxy headers', async () => {
  const base = await start({ publicUrl: '' });
  const site = await (await fetch(`${base}/api/site`, {
    headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'mi-evento.up.railway.app' },
  })).json();
  assert.equal(site.publicUrl, 'https://mi-evento.up.railway.app');
});

test('an invalid host header never ends up in the QR code', async () => {
  const base = await start({ publicUrl: '' });
  const site = await (await fetch(`${base}/api/site`, {
    headers: { 'x-forwarded-host': 'evil.com/"><script>' },
  })).json();
  assert.doesNotMatch(site.publicUrl, /[<>"]/);
});

test('the terminal QR keeps a light quiet zone and one line per two module rows', () => {
  const url = 'https://evento.example.app';
  const size = qrMatrix(url).length;
  const lines = qrTerminal(url).split('\n');
  const margin = 2;
  assert.equal(lines.length, Math.ceil((size + margin * 2) / 2));
  assert.ok(lines.every((line) => [...line].length === size + margin * 2));
  assert.match(lines[0], /^█+$/);
});
