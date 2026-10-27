// Usage: npm run commit -- "commit message"
// Writes history.json with every existing commit plus the one about to be made,
// then commits with the same timestamp, so the deployed site (without .git)
// can show the full history.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const message = process.argv.slice(2).join(' ').trim();
if (!message) {
  console.error('Usage: npm run commit -- "commit message"');
  process.exit(1);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

let previous = [];
try {
  previous = git('log', '--reverse', '--format=%aI%x1f%s%x1e')
    .split('\x1e')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [date, subject] = line.split('\x1f');
      return { message: subject, date: new Date(date).toISOString() };
    });
} catch {
  // No commits yet.
}

const now = new Date();
now.setMilliseconds(0);
const date = now.toISOString();
const history = [...previous, { message, date }];
writeFileSync('history.json', JSON.stringify(history, null, 2) + '\n');

git('add', '-A');
execFileSync('git', ['commit', '-m', message], {
  stdio: 'inherit',
  env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
});
console.log(`history.json: ${history.length} commits`);
