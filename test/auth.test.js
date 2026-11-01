import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';
import { authenticate } from '../server/auth.js';
import { IMPORT_MAP } from '../server/login-page.js';
import middleware from '../middleware.js';

const env = { SITE_PASSWORD: 'test-password', SESSION_SECRET: 'test-only-secret-that-is-at-least-32-characters' };
const now = 1800000000;
const request = (path, options = {}) => new Request('https://hibiscus.example' + path, options);
const login = (password = env.SITE_PASSWORD, options = {}) => authenticate(request('/login', {
  method: 'POST', headers: { origin: 'https://hibiscus.example', accept: 'application/json' },
  body: new URLSearchParams({ password }), ...options,
}), env, now);
const session = async () => (await (await login()).json()).token;
const authorized = token => ({ headers: { authorization: 'Bearer ' + token } });

test('new navigations always lead to login, even with a valid grant', async () => {
  const token = await session();
  for (const path of ['/', '/index.html']) {
    for (const options of [{}, authorized(token), { headers: { cookie: 'hibiscus_session=' + token } }]) {
      const result = await authenticate(request(path, options), env, now);
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), '/login');
    }
  }
  const page = await authenticate(request('/login', authorized(token)), env, now);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /type="password"/);
});

test('protected files require an explicit grant, not a shared cookie', async () => {
  const token = await session();
  for (const path of ['/hibiscus.js', '/assets/ibisco.jpg', '/server/auth.js']) {
    for (const method of ['GET', 'HEAD']) {
      const result = await authenticate(request(path, { method, headers: { cookie: 'hibiscus_session=' + token } }), env, now);
      assert.equal(result.status, 401);
      assert.equal(result.headers.get('cache-control'), 'private, no-store');
    }
  }
});

test('legacy 12-hour cookies cannot restore login or authorize assets', async () => {
  const payload = (now + 43200) + '.' + 'a'.repeat(32);
  const signature = createHmac('sha256', env.SESSION_SECRET).update(JSON.stringify([env.SITE_PASSWORD, payload])).digest('base64url');
  const token = payload + '.' + signature;
  const page = await authenticate(request('/login', { headers: { cookie: 'hibiscus_session=' + token } }), env, now);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('set-cookie'), /hibiscus_session=;.*Max-Age=0; Secure/);
  assert.equal((await authenticate(request('/assets/ibisco.jpg', authorized(token)), env, now)).status, 401);
});

test('login bootstrap is public but discloses no password or flower image', async () => {
  const result = await authenticate(request('/login'), env, now);
  const html = await result.text();
  assert.match(html, /type="password"/);
  assert.doesNotMatch(html, /test-password|ibisco\.jpg/);
  assert.match(html, /id="experience" hidden/);
  assert.equal(await authenticate(request('/access.js'), env, now), null);
});

test('CSP allows the exact import map without permitting arbitrary inline scripts', async () => {
  const result = await authenticate(request('/login'), env, now);
  const policy = result.headers.get('content-security-policy');
  const hash = createHash('sha256').update(IMPORT_MAP).digest('base64');
  assert.ok(policy.includes("'sha256-" + hash + "'"));
  assert.match(policy, /connect-src 'self'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
});

test('incorrect, empty and differently cased passwords never yield a grant', async () => {
  for (const password of ['wrong', '', 'Test-password', 'test-password ', 'x'.repeat(257), '<script>']) {
    const result = await login(password);
    assert.equal(result.status, 401);
    assert.equal(result.headers.get('set-cookie'), null);
    assert.deepEqual(await result.json(), { error: 'La password non è corretta. Riprova.' });
  }
});

test('correct password yields a unique five-minute token and no authentication cookie', async () => {
  const result = await login();
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('set-cookie'), null);
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  const { token } = await result.json();
  assert.equal(Number(token.split('.')[0]), now + 300);
  assert.doesNotMatch(token, /test-password/);
  assert.notEqual(token, await session());
  for (const path of ['/hibiscus.js', '/assets/ibisco.jpg']) {
    assert.equal(await authenticate(request(path, authorized(token)), env, now), null);
  }
});

test('a second page cannot use the first page access through a cookie or URL', async () => {
  const token = await session();
  for (const req of [
    request('/assets/ibisco.jpg'),
    request('/assets/ibisco.jpg', { headers: { cookie: 'hibiscus_session=' + token } }),
    request('/assets/ibisco.jpg?token=' + token),
  ]) assert.equal((await authenticate(req, env, now)).status, 401);
  assert.equal(await authenticate(request('/assets/ibisco.jpg', authorized(token)), env, now), null);
});

test('malformed, tampered and expired tokens are rejected', async () => {
  const token = await session();
  const pieces = token.split('.');
  for (const invalid of [token + 'x', '9' + token.slice(1), pieces[0] + '.' + pieces[1] + '.' + 'a'.repeat(43), 'true', '%', '1.a.b', token + '.extra']) {
    assert.equal((await authenticate(request('/hibiscus.js', authorized(invalid)), env, now)).status, 401);
  }
  assert.equal((await authenticate(request('/hibiscus.js', authorized(token)), env, now + 300)).status, 401);
});

test('changing password or signing secret invalidates grants', async () => {
  const token = await session();
  for (const config of [{ ...env, SITE_PASSWORD: 'changed' }, { ...env, SESSION_SECRET: env.SESSION_SECRET + 'changed' }]) {
    assert.equal((await authenticate(request('/hibiscus.js', authorized(token)), config, now)).status, 401);
  }
});

test('missing configuration fails closed', async () => {
  for (const config of [{}, { SITE_PASSWORD: 'test-password' }, { ...env, SESSION_SECRET: 'short' }]) {
    for (const path of ['/', '/login', '/assets/ibisco.jpg']) assert.equal((await authenticate(request(path), config, now)).status, 503);
  }
});

test('cross-origin and originless submissions are rejected', async () => {
  for (const origin of ['https://other.example', 'null', '']) {
    assert.equal((await login(env.SITE_PASSWORD, { headers: { origin, accept: 'application/json' } })).status, 403);
  }
});

test('legacy logout clears the cookie and only accepts same-origin POST', async () => {
  const result = await authenticate(request('/logout', { method: 'POST', headers: { origin: 'https://hibiscus.example' } }), env, now);
  assert.equal(result.headers.get('location'), '/login');
  assert.match(result.headers.get('set-cookie'), /Max-Age=0; Secure/);
  assert.equal((await authenticate(request('/logout'), env, now)).status, 405);
  assert.equal((await authenticate(request('/logout', { method: 'POST', headers: { origin: 'https://other.example' } }), env, now)).status, 403);
});

test('oversized bodies are bounded with and without Content-Length', async () => {
  for (const headers of [{}, { 'content-length': '5000' }]) {
    const result = await login('ignored', {
      headers: { origin: 'https://hibiscus.example', 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: 'password=' + 'x'.repeat(5000),
    });
    assert.equal(result.status, 413);
  }
});

test('unsupported methods and content types are rejected', async () => {
  assert.equal((await authenticate(request('/login', { method: 'PUT' }), env, now)).status, 405);
  assert.equal((await login(env.SITE_PASSWORD, { body: env.SITE_PASSWORD })).status, 415);
  assert.equal((await authenticate(request('/hibiscus.js', { method: 'POST', ...authorized(await session()) }), env, now)).status, 405);
});

test('Vercel forwards the public bootstrap and authenticated asset fetches only', async () => {
  const previous = { SITE_PASSWORD: process.env.SITE_PASSWORD, SESSION_SECRET: process.env.SESSION_SECRET };
  Object.assign(process.env, env);
  try {
    assert.equal((await middleware(request('/assets/ibisco.jpg'))).status, 401);
    const result = await middleware(request('/login', {
      method: 'POST', headers: { origin: 'https://hibiscus.example', accept: 'application/json' },
      body: new URLSearchParams({ password: env.SITE_PASSWORD }),
    }));
    const { token } = await result.json();
    const allowed = await middleware(request('/assets/ibisco.jpg', authorized(token)));
    assert.equal(allowed.headers.get('x-middleware-next'), '1');
    assert.equal(allowed.headers.get('cache-control'), 'private, no-store');
    assert.equal((await middleware(request('/access.js'))).headers.get('x-middleware-next'), '1');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
