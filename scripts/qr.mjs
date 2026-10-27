// Usage: npm run qr -- https://your-public-url
import { qrTerminal } from '../qr.js';

const url = process.argv[2] || process.env.PUBLIC_URL;
if (!url) {
  console.error('Usage: npm run qr -- https://your-public-url');
  process.exit(1);
}
console.log(qrTerminal(url));
console.log(`\n${url}\n`);
