import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticate } from '../server/auth.js';
import middleware from '../middleware.js';

const env = { SITE_PASSWORD: 'test-password', SESSION_SECRET: 'test-only-secret-that-is-at-least-32-characters' };
const now = 1800000000;
const request = (path, options = {}) => new Request(`https://hibiscus.example${path}`, options);
const login = (password = 'test-password', options = {}, config = env) => authenticate(request('/login', {
  method: 'POST', headers: { origin: 'https://hibiscus.example' }, body: new URLSearchParams({ password }), ...options,
}), config, now);
const session = async () => (await login()).headers.get('set-cookie').split(';')[0];

test('all site paths require authentication, including direct assets and HEAD requests', async () => {
  for (const path of ['/', '/index.html', '/hibiscus.js', '/assets/ibisco.jpg', '/missing', '/server/auth.js']) {
    for (const method of ['GET', 'HEAD']) {
      const result = await authenticate(request(path, { method }), env, now);
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), '/login');
      assert.equal(result.headers.get('cache-control'), 'private, no-store');
    }
  }
});

test('login is accessible, works without JavaScript, and reveals no password', async () => {
  const result = await authenticate(request('/login'), env, now);
  assert.equal(result.status, 200);
  const html = await result.text();
  assert.match(html, /type="password"/);
  assert.match(html, /method="post" action="\/login"/);
  assert.doesNotMatch(html, /test-password|hibiscus\.js|ibisco\.jpg/);
  assert.match(result.headers.get('content-security-policy'), /form-action 'self'/);
});

test('incorrect, empty and differently cased passwords are rejected without a cookie', async () => {
  for (const value of ['wrong', '', 'Test-password', 'test-password ', 'x'.repeat(257), '<script>']) {
    const result = await login(value);
    assert.equal(result.status, 401);
    assert.equal(result.headers.get('set-cookie'), null);
    assert.match(await result.text(), /La password non è corretta/);
  }
});

test('correct password grants access through a signed, secure HttpOnly cookie', async () => {
  const result = await login();
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('location'), '/');
  const cookie = result.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; SameSite=Strict; Max-Age=43200; Secure/);
  assert.doesNotMatch(cookie, /test-password/);
  for (const path of ['/', '/index.html', '/hibiscus.js', '/assets/ibisco.jpg']) {
    assert.equal(await authenticate(request(path, { headers: { cookie: cookie.split(';')[0] } }), env, now), null);
  }
});

test('sessions are unique, survive a reload and redirect authenticated login visits', async () => {
  const cookie = await session();
  assert.notEqual(cookie, await session());
  assert.equal(await authenticate(request('/', { headers: { cookie } }), env, now + 60), null);
  const result = await authenticate(request('/login', { headers: { cookie } }), env, now);
  assert.equal(result.headers.get('location'), '/');
});

test('tampered, malformed and expired cookies cannot unlock the site', async () => {
  const cookie = await session();
  for (const invalid of [cookie + 'x', cookie.replace(/=\d/, '=9'), cookie.replace(/\.[\w-]{43}$/, `.${'a'.repeat(43)}`), 'hibiscus_session=true', 'hibiscus_session=%', 'hibiscus_session=1.a.b', cookie + '.extra']) {
    assert.equal((await authenticate(request('/', { headers: { cookie: invalid } }), env, now)).status, 303);
  }
  assert.equal((await authenticate(request('/', { headers: { cookie } }), env, now + 43200)).status, 303);
});

test('changing the password or signing secret revokes existing sessions', async () => {
  const cookie = await session();
  for (const config of [{ ...env, SITE_PASSWORD: 'new-password' }, { ...env, SESSION_SECRET: env.SESSION_SECRET + 'changed' }]) {
    assert.equal((await authenticate(request('/', { headers: { cookie } }), config, now)).status, 303);
  }
});

test('missing configuration fails closed for pages, assets and login', async () => {
  for (const config of [{}, { SITE_PASSWORD: 'test-password' }, { ...env, SESSION_SECRET: 'short' }]) {
    for (const path of ['/', '/login', '/assets/ibisco.jpg']) {
      assert.equal((await authenticate(request(path), config, now)).status, 503);
    }
  }
});

test('cross-origin and originless form submissions are rejected', async () => {
  for (const origin of ['https://other.example', 'null', '']) {
    assert.equal((await login('test-password', { headers: { origin } })).status, 403);
  }
});

test('logout clears the cookie and only accepts a same-origin POST', async () => {
  const cookie = await session();
  const result = await authenticate(request('/logout', { method: 'POST', headers: { cookie, origin: 'https://hibiscus.example' } }), env, now);
  assert.equal(result.headers.get('location'), '/login');
  assert.match(result.headers.get('set-cookie'), /hibiscus_session=;.*Max-Age=0; Secure/);
  assert.equal((await authenticate(request('/logout'), env, now)).status, 405);
  assert.equal((await authenticate(request('/logout', { method: 'POST', headers: { origin: 'https://other.example' } }), env, now)).status, 403);
});

test('oversized bodies are rejected with and without a Content-Length', async () => {
  for (const headers of [{}, { 'content-length': '5000' }]) {
    const result = await login('ignored', {
      headers: { origin: 'https://hibiscus.example', 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: `password=${'x'.repeat(5000)}`,
    });
    assert.equal(result.status, 413);
  }
});

test('unsupported methods and content types are rejected', async () => {
  assert.equal((await authenticate(request('/login', { method: 'PUT' }), env, now)).status, 405);
  assert.equal((await login('test-password', { body: 'test-password' })).status, 415);
});

test('local HTTP development can set a cookie without weakening HTTPS cookies', async () => {
  const result = await authenticate(new Request('http://localhost:5173/login', {
    method: 'POST', headers: { origin: 'http://localhost:5173' }, body: new URLSearchParams({ password: 'test-password' }),
  }), env, now);
  assert.equal(result.status, 303);
  assert.doesNotMatch(result.headers.get('set-cookie'), /; Secure/);
});

test('Vercel middleware only forwards requests with a valid session', async () => {
  const previous = { SITE_PASSWORD: process.env.SITE_PASSWORD, SESSION_SECRET: process.env.SESSION_SECRET };
  Object.assign(process.env, env);
  try {
    assert.equal((await middleware(request('/assets/ibisco.jpg'))).status, 303);
    const result = await middleware(request('/login', {
      method: 'POST', headers: { origin: 'https://hibiscus.example' },
      body: new URLSearchParams({ password: env.SITE_PASSWORD }),
    }));
    const cookie = result.headers.get('set-cookie').split(';')[0];
    const allowed = await middleware(request('/assets/ibisco.jpg', { headers: { cookie } }));
    assert.equal(allowed.headers.get('x-middleware-next'), '1');
    assert.equal(allowed.headers.get('cache-control'), 'private, no-store');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
