import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { loginPage } from './login-page.js';

const COOKIE = 'hibiscus_session';
const SESSION_SECONDS = 12 * 60 * 60;
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

function page(error = false) {
  return response(loginPage(error), error ? 401 : 200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
}

function sign(payload, password, secret) {
  // Binding sessions to the password invalidates them after a password change.
  return createHmac('sha256', secret).update(JSON.stringify([password, payload])).digest('base64url');
}

function validSession(cookieHeader, password, secret, now) {
  const token = cookieHeader.split(';').map(part => part.trim())
    .find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token || token.length > 256) return false;
  const [expires, nonce, signature, extra] = token.split('.');
  if (extra !== undefined || !/^\d{10,12}$/.test(expires) || !/^[a-f0-9]{32}$/.test(nonce) || !/^[\w-]{43}$/.test(signature)) return false;
  const expiry = Number(expires);
  if (expiry <= now || expiry > now + SESSION_SECONDS) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(sign(`${expires}.${nonce}`, password, secret)));
}

function cookie(value, url, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${url.protocol === 'https:' ? '; Secure' : ''}`;
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
  const loggedIn = validSession(request.headers.get('cookie') || '', password, secret, now);

  if (path === '/login' || path === '/logout') {
    if (request.method === 'POST') {
      // Browser forms send Origin; reject requests submitted by another site.
      if (request.headers.get('origin') !== url.origin) return response('Richiesta non consentita.', 403);
      if (path === '/logout') return redirect('/login', { 'Set-Cookie': cookie('', url, 0) });

      if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
        return response('Formato non supportato.', 415);
      }
      if (Number(request.headers.get('content-length')) > 4096) return response('Richiesta troppo grande.', 413);
      // Also bound chunked bodies that do not have a Content-Length header.
      const reader = request.body?.getReader();
      if (!reader) return page(true);
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
      if (supplied.length > 256 || !timingSafeEqual(digest(supplied), digest(password))) return page(true);

      const payload = `${now + SESSION_SECONDS}.${randomBytes(16).toString('hex')}`;
      return redirect('/', { 'Set-Cookie': cookie(`${payload}.${sign(payload, password, secret)}`, url, SESSION_SECONDS) });
    }
    if (path === '/logout' || !['GET', 'HEAD'].includes(request.method)) {
      return response('Metodo non consentito.', 405, { Allow: path === '/logout' ? 'POST' : 'GET, HEAD, POST' });
    }
    return loggedIn ? redirect('/') : page();
  }

  return loggedIn ? null : redirect('/login');
}
