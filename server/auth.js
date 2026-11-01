import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { IMPORT_MAP, loginPage } from './login-page.js';

const COOKIE = 'hibiscus_session';
// This grant is only needed to load resources into the current document.
const SESSION_SECONDS = 5 * 60;
const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'same-origin',
};

function response(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { ...PRIVATE_HEADERS, ...headers } });
}

function redirect(location, headers = {}) {
  return response(null, 303, { Location: location, ...headers });
}

function page(error = false, headers = {}) {
  const importMapHash = createHash('sha256').update(IMPORT_MAP).digest('base64');
  return response(loginPage(error), error ? 401 : 200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'self' blob: https://cdn.jsdelivr.net 'sha256-${importMapHash}'; connect-src 'self'; img-src blob:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    ...headers,
  });
}

function json(body, status = 200) {
  return response(JSON.stringify(body), status, { 'Content-Type': 'application/json; charset=utf-8' });
}

function sign(payload, password, secret) {
  // Binding sessions to the password invalidates them after a password change.
  return createHmac('sha256', secret).update(JSON.stringify(['page-access-v2', password, payload])).digest('base64url');
}

function validSession(token, password, secret, now) {
  if (!token || token.length > 256) return false;
  const [expires, nonce, signature, extra] = token.split('.');
  if (extra !== undefined || !/^\d{10,12}$/.test(expires) || !/^[a-f0-9]{32}$/.test(nonce) || !/^[\w-]{43}$/.test(signature)) return false;
  const expiry = Number(expires);
  if (expiry <= now || expiry > now + SESSION_SECONDS) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(sign(`${expires}.${nonce}`, password, secret)));
}

function clearLegacyCookie(url) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${url.protocol === 'https:' ? '; Secure' : ''}`;
}

// null means the request is authenticated and may reach the static files.
export async function authenticate(request, env = process.env, now = Math.floor(Date.now() / 1000)) {
  const password = env.SITE_PASSWORD;
  const secret = env.SESSION_SECRET;
  if (!password || !secret || secret.length < 32) {
    return response('Accesso temporaneamente non disponibile.', 503, { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];

  // Every navigation starts at login; cookies never unlock another document.
  if (path === '/' || path === '/index.html') return redirect('/login');
  if (path === '/access.js' && ['GET', 'HEAD'].includes(request.method)) return null;

  if (path === '/login' || path === '/logout') {
    if (request.method === 'POST') {
      // Browser forms send Origin; reject requests submitted by another site.
      if (request.headers.get('origin') !== url.origin) return response('Richiesta non consentita.', 403);
      if (path === '/logout') return redirect('/login', { 'Set-Cookie': clearLegacyCookie(url) });
      const wantsJSON = request.headers.get('accept') === 'application/json';
      const incorrect = () => wantsJSON ? json({ error: 'La password non è corretta. Riprova.' }, 401) : page(true);

      if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
        return response('Formato non supportato.', 415);
      }
      if (Number(request.headers.get('content-length')) > 4096) return response('Richiesta troppo grande.', 413);
      // Also bound chunked bodies that do not have a Content-Length header.
      const reader = request.body?.getReader();
      if (!reader) return incorrect();
      const chunks = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return response('Richiesta troppo grande.', 413);
        }
        chunks.push(Buffer.from(value));
      }
      const supplied = new URLSearchParams(Buffer.concat(chunks).toString('utf8')).get('password') || '';
      const digest = value => createHash('sha256').update(value).digest();
      if (supplied.length > 256 || !timingSafeEqual(digest(supplied), digest(password))) return incorrect();
      // JavaScript keeps the grant exclusively in the current page's memory.
      if (!wantsJSON) return page();

      const payload = `${now + SESSION_SECONDS}.${randomBytes(16).toString('hex')}`;
      return json({ token: `${payload}.${sign(payload, password, secret)}` });
    }
    if (path === '/logout' || !['GET', 'HEAD'].includes(request.method)) {
      return response('Metodo non consentito.', 405, { Allow: path === '/logout' ? 'POST' : 'GET, HEAD, POST' });
    }
    return page(false, { 'Set-Cookie': clearLegacyCookie(url) });
  }

  if (!['GET', 'HEAD'].includes(request.method)) return response('Metodo non consentito.', 405, { Allow: 'GET, HEAD' });
  return validSession(token, password, secret, now) ? null : response('Accesso richiesto.', 401);
}
