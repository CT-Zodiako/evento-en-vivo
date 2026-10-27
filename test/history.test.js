import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server.js';

const COMMIT_SCRIPT = fileURLToPath(new URL('../scripts/commit.mjs', import.meta.url));
let server;
let base;

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'history-'));
  const historyPath = join(dir, 'history.json');
  writeFileSync(historyPath, JSON.stringify([
    { message: 'feat: primero', date: '2026-10-27T10:00:00.000Z' },
    { message: 'feat: segundo', date: '2026-10-27T11:00:00.000Z' },
  ]));
  server = createApp({ historyPath, dbPath: join(dir, 'test.db') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.closeAllConnections(); server.close(); });

test('GET /api/history returns every commit from first to last', async () => {
  const res = await fetch(`${base}/api/history`);
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).commits.map((c) => c.message), ['feat: primero', 'feat: segundo']);
});

test('GET /bitacora serves the log page', async () => {
  const res = await fetch(`${base}/bitacora`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /Bitácora/);
});

test('the commit script writes the history, including the new commit, before committing', () => {
  const repo = mkdtempSync(join(tmpdir(), 'repo-'));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');

  writeFileSync(join(repo, 'a.txt'), 'a');
  execFileSync('node', [COMMIT_SCRIPT, 'feat: uno'], { cwd: repo, stdio: 'pipe' });
  writeFileSync(join(repo, 'b.txt'), 'b');
  execFileSync('node', [COMMIT_SCRIPT, 'fix: dos'], { cwd: repo, stdio: 'pipe' });

  const history = JSON.parse(readFileSync(join(repo, 'history.json'), 'utf8'));
  assert.deepEqual(history.map((c) => c.message), ['feat: uno', 'fix: dos']);

  // The committed file matches the working copy and each date matches its commit.
  assert.equal(git('show', 'HEAD:history.json'), readFileSync(join(repo, 'history.json'), 'utf8'));
  const gitDates = git('log', '--reverse', '--format=%aI').trim().split('\n').map((d) => new Date(d).toISOString());
  assert.deepEqual(history.map((c) => c.date), gitDates);
});
