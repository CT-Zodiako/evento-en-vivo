// Basic offensive-word filter for the live wall (Spanish).
// Normalizes accents, case, leetspeak, separators and repeated letters,
// then compares whole words so "computadora" does not match "puta".

const WORDS = [
  'puta', 'puto', 'putas', 'putos', 'hijueputa', 'hijoputa', 'hdp', 'mierda', 'pendejo', 'pendeja',
  'idiota', 'imbecil', 'estupido', 'estupida', 'marica', 'maricon', 'gonorrea', 'malparido',
  'malparida', 'verga', 'culo', 'cono', 'carajo', 'perra', 'zorra', 'cabron', 'cabrona',
  'huevon', 'guevon', 'boludo', 'pelotudo', 'pelotuda', 'mamaguevo', 'chimba', 'culero',
  'joder', 'jodete', 'pajero', 'mogolico', 'retrasado', 'subnormal', 'fuck', 'shit', 'bitch',
];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[013457@$]/g, (c) => LEET[c])
    .replace(/(\p{L})\1+/gu, '$1');
}

const BLOCKED = new Set(WORDS.map(normalize));

function tokens(text) {
  const parts = normalize(text).split(/[^\p{L}]+/u).filter(Boolean);
  // Join runs of single letters so "p.u.t.a" or "p u t a" becomes "puta".
  const joined = [];
  let run = '';
  for (const part of parts) {
    if (part.length === 1) {
      run += part;
      continue;
    }
    if (run) joined.push(run);
    run = '';
    joined.push(part);
  }
  if (run) joined.push(run);
  return joined;
}

export function isOffensive(text) {
  return tokens(text).some((word) =>
    BLOCKED.has(word) || BLOCKED.has(word.replace(/e?s$/, '')),
  );
}
