import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { authenticate } from '../server/auth.js';

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/hibiscus.js', ['hibiscus.js', 'text/javascript; charset=utf-8']],
  ['/assets/ibisco.jpg', ['assets/ibisco.jpg', 'image/jpeg']],
]);
const port = Number(process.env.PORT || 5173);
const origin = `http://localhost:${port}`;
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      ...(!['GET', 'HEAD'].includes(req.method) ? { body: req, duplex: 'half' } : {}),
    });
    let result = await authenticate(request);
    if (!result) {
      const file = files.get(url.pathname);
      if (!['GET', 'HEAD'].includes(req.method)) result = new Response('Metodo non consentito.', { status: 405 });
      else if (!file) result = new Response('Pagina non trovata.', { status: 404 });
      else result = new Response(await readFile(new URL(`../${file[0]}`, import.meta.url)), { headers: { 'Content-Type': file[1] } });
    }
    result.headers.set('Cache-Control', 'private, no-store');
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(req.method === 'HEAD' ? undefined : Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end('Errore del server.');
  }
}).listen(port, '127.0.0.1', () => console.log(`Hibiscus: ${origin}`));
