# evento-en-vivo

Website for the talk **"De chat a agente"**, built live by an AI agent in front of the audience.

- **Home**: animated cover, live wall and live poll.
- **Live wall**: 140-character messages tagged as student or teacher, pushed to every screen in real time.
- **Live poll**: "¿Para qué usarías un agente?", one vote per person, bars split by role.
- **/bitacora**: every commit of the project, first to last.

## Stack

Node.js ≥ 22.13 with **zero runtime dependencies**: `node:http`, `node:sqlite` and Server-Sent Events.

## Run locally

```bash
npm start          # http://localhost:3000
npm test
```

| Variable    | Purpose                                                        | Default            |
|-------------|----------------------------------------------------------------|--------------------|
| `PORT`      | HTTP port                                                      | `3000`             |
| `DB_PATH`   | SQLite file                                                    | `data/evento.db`   |
| `ADMIN_KEY` | Key required to hide wall messages. Unset = moderation disabled | _(none)_           |

`ADMIN_KEY` is never stored in the code or the repository: set it in the environment.

## Commits and the log page

The deployed container has no `.git` folder, so the log page reads `history.json`. Always commit with:

```bash
npm run commit -- "feat: clear message for the audience"
```

The script writes `history.json` with every previous commit plus the new one, stages all changes and commits using the same timestamp. Do not rewrite history (amend, rebase) or the file will drift from `git log`.
