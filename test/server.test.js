import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';

let server;
let base;
const dir = mkdtempSync(join(tmpdir(), 'evento-'));

before(async () => {
  const historyPath = join(dir, 'history.json');
  writeFileSync(historyPath, JSON.stringify([
    { message: 'first', date: '2026-10-27T10:00:00.000Z' },
    { message: 'second', date: '2026-10-27T11:30:00.000Z' },
  ]));
  server = createApp({ historyPath, dbPath: join(dir, 'test.db') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('GET /api/site returns the stage and the time of the last change', async () => {
  const res = await fetch(`${base}/api/site`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body.stage, 'number');
  assert.equal(body.lastChange, '2026-10-27T11:30:00.000Z');
});

test('GET / serves the home page', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
});

test('static server does not escape the public folder', async () => {
  const res = await fetch(`${base}/..%2fpackage.json`);
  assert.equal(res.status, 404);
});
