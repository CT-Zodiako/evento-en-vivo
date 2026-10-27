import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';

let server;
let base;

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'poll-'));
  server = createApp({ dbPath: join(dir, 'test.db'), adminKey: '' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.closeAllConnections(); server.close(); });

const vote = (body, cookie) =>
  fetch(`${base}/api/poll/vote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

const getPoll = async (cookie) => (await fetch(`${base}/api/poll`, { headers: cookie ? { cookie } : {} })).json();

test('the poll exposes the question and four options with empty results', async () => {
  const poll = await getPoll();
  assert.equal(poll.question, '¿Para qué usarías un agente?');
  assert.equal(poll.options.length, 4);
  for (const role of ['estudiante', 'profesor']) {
    for (const { id } of poll.options) assert.equal(poll.results[role][id], 0);
  }
  assert.equal(poll.myVote, null);
});

test('votes are counted separately for students and teachers', async () => {
  const [a, b] = (await getPoll()).options.map((o) => o.id);
  assert.equal((await vote({ option: a, role: 'estudiante' })).status, 201);
  assert.equal((await vote({ option: a, role: 'estudiante' })).status, 201);
  assert.equal((await vote({ option: b, role: 'profesor' })).status, 201);
  const { results } = await getPoll();
  assert.equal(results.estudiante[a], 2);
  assert.equal(results.profesor[a], 0);
  assert.equal(results.profesor[b], 1);
});

test('a person can vote only once', async () => {
  const [, , c, d] = (await getPoll()).options.map((o) => o.id);
  const first = await vote({ option: c, role: 'profesor' });
  assert.equal(first.status, 201);
  const cookie = first.headers.get('set-cookie').split(';')[0];
  const before = (await getPoll()).results;

  const second = await vote({ option: d, role: 'estudiante' }, cookie);
  assert.equal(second.status, 409);
  assert.deepEqual(await second.json(), { error: 'Ya votaste. ¡Gracias por participar!' });
  assert.deepEqual((await getPoll()).results, before);
  assert.equal((await getPoll(cookie)).myVote, c);
});

test('unknown options and roles are rejected without counting', async () => {
  const before = (await getPoll()).results;
  const badOption = await vote({ option: 'nada', role: 'profesor' });
  assert.equal(badOption.status, 400);
  assert.deepEqual(await badOption.json(), { error: 'Opción no válida.' });
  const badRole = await vote({ option: (await getPoll()).options[0].id, role: 'otro' });
  assert.equal(badRole.status, 400);
  assert.deepEqual((await getPoll()).results, before);
});

test('every vote pushes the new results to open event streams', async () => {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/events`, { signal: controller.signal });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const option = (await getPoll()).options[3].id;
  await vote({ option, role: 'estudiante' });

  let received = '';
  while (!received.includes('event: poll')) received += (await reader.read()).value;
  controller.abort();
  const data = JSON.parse(received.split('event: poll\ndata: ')[1].split('\n')[0]);
  assert.equal(data.results.estudiante[option], 1);
});
