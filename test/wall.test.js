import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';
import { isOffensive } from '../filter.js';

const ADMIN_KEY = 'test-only-key';
const servers = [];

async function start(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wall-'));
  const server = createApp({ dbPath: join(dir, 'test.db'), adminKey: ADMIN_KEY, messageCooldownMs: 0, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

const post = (base, path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const listMessages = async (base) => (await (await fetch(`${base}/api/messages`)).json()).messages;

let base;
before(async () => { base = await start(); });
after(() => servers.forEach((s) => { s.closeAllConnections(); s.close(); }));

test('a valid message is stored and listed with its role', async () => {
  const res = await post(base, '/api/messages', { text: '  Hola desde la charla  ', role: 'estudiante' });
  assert.equal(res.status, 201);
  const { message } = await res.json();
  assert.equal(message.text, 'Hola desde la charla');
  assert.equal(message.role, 'estudiante');
  const messages = await listMessages(base);
  assert.ok(messages.some((m) => m.id === message.id && m.role === 'estudiante'));
});

test('140 characters are accepted, 141 are rejected and not stored', async () => {
  const ok = await post(base, '/api/messages', { text: 'a'.repeat(140), role: 'profesor' });
  assert.equal(ok.status, 201);
  const before = (await listMessages(base)).length;
  const tooLong = await post(base, '/api/messages', { text: 'b'.repeat(141), role: 'profesor' });
  assert.equal(tooLong.status, 400);
  assert.deepEqual(await tooLong.json(), { error: 'El mensaje debe tener entre 1 y 140 caracteres.' });
  assert.equal((await listMessages(base)).length, before);
});

test('empty text and unknown roles are rejected', async () => {
  assert.equal((await post(base, '/api/messages', { text: '   ', role: 'profesor' })).status, 400);
  const badRole = await post(base, '/api/messages', { text: 'hola', role: 'admin' });
  assert.equal(badRole.status, 400);
  assert.deepEqual(await badRole.json(), { error: 'Elige si eres estudiante o profesor.' });
});

test('offensive messages are rejected and not stored', async () => {
  const before = (await listMessages(base)).length;
  const res = await post(base, '/api/messages', { text: 'qué charla tan MIERDA', role: 'estudiante' });
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { error: 'Tu mensaje contiene palabras no permitidas.' });
  assert.equal((await listMessages(base)).length, before);
});

test('the filter catches common evasions without false positives', () => {
  assert.ok(isOffensive('p.u.t.a'));
  assert.ok(isOffensive('PUUUTA'));
  assert.ok(isOffensive('m1erd4'));
  assert.ok(isOffensive('Idiotas'));
  assert.ok(!isOffensive('Mi computadora y la disputa'));
  assert.ok(!isOffensive('Me encantó la charla'));
});

test('hiding requires the admin key', async () => {
  const { message } = await (await post(base, '/api/messages', { text: 'para ocultar', role: 'profesor' })).json();
  const noKey = await post(base, `/api/messages/${message.id}/hide`, {});
  assert.equal(noKey.status, 401);
  const wrongKey = await post(base, `/api/messages/${message.id}/hide`, {}, { 'x-admin-key': 'nope' });
  assert.equal(wrongKey.status, 401);
  assert.ok((await listMessages(base)).some((m) => m.id === message.id));

  const ok = await post(base, `/api/messages/${message.id}/hide`, {}, { 'x-admin-key': ADMIN_KEY });
  assert.equal(ok.status, 200);
  assert.ok(!(await listMessages(base)).some((m) => m.id === message.id));

  const missing = await post(base, '/api/messages/999999/hide', {}, { 'x-admin-key': ADMIN_KEY });
  assert.equal(missing.status, 404);
});

test('hiding is disabled when ADMIN_KEY is not configured', async () => {
  const noAdmin = await start({ adminKey: '' });
  const { message } = await (await post(noAdmin, '/api/messages', { text: 'hola', role: 'profesor' })).json();
  const res = await post(noAdmin, `/api/messages/${message.id}/hide`, {}, { 'x-admin-key': '' });
  assert.equal(res.status, 503);
});

test('a second message within the cooldown is rejected', async () => {
  const slow = await start({ messageCooldownMs: 60_000 });
  const first = await post(slow, '/api/messages', { text: 'uno', role: 'profesor' });
  const cookie = first.headers.get('set-cookie').split(';')[0];
  const second = await post(slow, '/api/messages', { text: 'dos', role: 'profesor' }, { cookie });
  assert.equal(second.status, 429);
  assert.equal((await listMessages(slow)).length, 1);
});

test('new and hidden messages are pushed to open event streams', async () => {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/events`, { signal: controller.signal });
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();

  const { message } = await (await post(base, '/api/messages', { text: 'en vivo', role: 'estudiante' })).json();
  await post(base, `/api/messages/${message.id}/hide`, {}, { 'x-admin-key': ADMIN_KEY });

  let received = '';
  while (!received.includes('event: hide')) received += (await reader.read()).value;
  controller.abort();
  assert.match(received, /event: message\ndata: .*"en vivo"/);
  assert.match(received, new RegExp(`event: hide\\ndata: \\{"id":${message.id}\\}`));
});
