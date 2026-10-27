import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('estudiante', 'profesor')),
      created_at TEXT NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS votes (
      voter_id TEXT PRIMARY KEY,
      option TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('estudiante', 'profesor')),
      created_at TEXT NOT NULL
    );
  `);

  const insertMessage = db.prepare(
    'INSERT INTO messages (text, role, created_at) VALUES (?, ?, ?) RETURNING id, text, role, created_at AS createdAt',
  );
  const visibleMessages = db.prepare(
    'SELECT id, text, role, created_at AS createdAt FROM messages WHERE hidden = 0 ORDER BY id DESC LIMIT ?',
  );
  const hideMessage = db.prepare('UPDATE messages SET hidden = 1 WHERE id = ?');
  // voter_id is the primary key, so the database itself enforces one vote per person.
  const insertVote = db.prepare(
    'INSERT OR IGNORE INTO votes (voter_id, option, role, created_at) VALUES (?, ?, ?, ?)',
  );
  const voteCounts = db.prepare('SELECT role, option, COUNT(*) AS total FROM votes GROUP BY role, option');
  const voteOf = db.prepare('SELECT option FROM votes WHERE voter_id = ?');

  return {
    addMessage: (text, role) => insertMessage.get(text, role, new Date().toISOString()),
    listMessages: (limit = 100) => visibleMessages.all(limit),
    hideMessage: (id) => hideMessage.run(id).changes > 0,
    addVote: (voterId, option, role) => insertVote.run(voterId, option, role, new Date().toISOString()).changes > 0,
    voteCounts: () => voteCounts.all(),
    voteOf: (voterId) => voteOf.get(voterId)?.option ?? null,
    close: () => db.close(),
  };
}
