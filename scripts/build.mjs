import { copyFile, mkdir } from 'node:fs/promises';

// Publish only the site: never ship the server code, tests or environment files.
const root = new URL('../', import.meta.url);
await mkdir(new URL('dist/assets/', root), { recursive: true });
for (const file of ['index.html', 'hibiscus.js', 'assets/ibisco.jpg']) {
  await copyFile(new URL(file, root), new URL(`dist/${file}`, root));
}
console.log('Sito preparato in dist/.');
