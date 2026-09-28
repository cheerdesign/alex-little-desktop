import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const hosting = JSON.parse(await readFile('.openai/hosting.json', 'utf8'));
// These two directories contain generated output only; authored UI lives in public/.
await rm('dist/client', { recursive: true, force: true });
await rm('dist/server', { recursive: true, force: true });
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await cp('public', 'dist/client', { recursive: true, filter: file => path.basename(file) !== '.DS_Store' });
await cp('worker/index.js', 'dist/server/index.js');
await writeFile('dist/.openai/hosting.json', JSON.stringify(hosting, null, 2) + '\n');
await writeFile('dist/server/wrangler.json', JSON.stringify({
  name: 'alex-little-desktop', main: 'index.js', compatibility_date: '2026-05-15',
  assets: { directory: '../client', binding: 'ASSETS' },
}, null, 2) + '\n');
for (const filename of await readdir('public')) {
  if (filename.endsWith('.html')) {
    const html = await readFile('public/' + filename, 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      if (!/^(https?:|data:)/.test(match[1])) {
        const assetPath = match[1].split('?')[0];
        await readFile('public/' + assetPath);
      }
    }
  }
}
console.log('Built the desktop, Notes API, and database configuration.');
