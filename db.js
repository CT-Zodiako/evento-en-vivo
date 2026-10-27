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
  `);

  const insertMessage = db.prepare(
    'INSERT INTO messages (text, role, created_at) VALUES (?, ?, ?) RETURNING id, text, role, created_at AS createdAt',
  );
  const visibleMessages = db.prepare(
    'SELECT id, text, role, created_at AS createdAt FROM messages WHERE hidden = 0 ORDER BY id DESC LIMIT ?',
  );
  const hideMessage = db.prepare('UPDATE messages SET hidden = 1 WHERE id = ?');

  return {
    addMessage: (text, role) => insertMessage.get(text, role, new Date().toISOString()),
    listMessages: (limit = 100) => visibleMessages.all(limit),
    hideMessage: (id) => hideMessage.run(id).changes > 0,
    close: () => db.close(),
  };
}
