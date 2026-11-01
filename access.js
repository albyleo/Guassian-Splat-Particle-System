// Access lives only in this document: no cookies, web storage or URL tokens.
const login = document.getElementById('login');
const form = document.getElementById('login-form');
const password = document.getElementById('password');
const submit = form.querySelector('button');
const error = document.getElementById('error');
const experience = document.getElementById('experience');
const stage = document.getElementById('stage');
const status = document.getElementById('status');
let controller;
let generation = 0;
let effect;
const objectURLs = new Set();

function objectURL(blob) {
  const url = URL.createObjectURL(blob);
  objectURLs.add(url);
  return url;
}

function lock() {
  generation++;
  controller?.abort();
  effect?.destroy();
  effect = undefined;
  delete window.hibiscus;
  stage.replaceChildren();
  for (const url of objectURLs) URL.revokeObjectURL(url);
  objectURLs.clear();
  experience.hidden = true;
  login.hidden = false;
  form.reset();
  submit.disabled = false;
  form.removeAttribute('aria-busy');
  password.removeAttribute('aria-invalid');
  password.removeAttribute('aria-describedby');
  error.hidden = true;
  error.textContent = '';
  document.title = 'Hibiscus · Accedi';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  const current = ++generation;
  controller = new AbortController();
  const signal = controller.signal;
  const body = new URLSearchParams({ password: password.value });
  password.value = '';
  error.hidden = true;
  password.removeAttribute('aria-invalid');
  submit.disabled = true;
  form.setAttribute('aria-busy', 'true');
  try {
    const result = await fetch('/login', {
      method: 'POST', headers: { Accept: 'application/json' }, body,
      credentials: 'omit', cache: 'no-store', signal,
    });
    if (!result.ok) throw new Error(result.status === 401
      ? 'La password non è corretta. Riprova.'
      : 'Accesso temporaneamente non disponibile. Riprova.');
    const { token } = await result.json();
    if (current !== generation) return;
    // The bearer grant is never persisted, shared with a tab, or put in a URL.
    const resources = await Promise.all(['/hibiscus.js', '/assets/ibisco.jpg'].map(async path => {
      const resource = await fetch(path, {
        headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', cache: 'no-store', signal,
      });
      if (!resource.ok) throw new Error('Non riesco a caricare il fiore. Riprova.');
      return resource.blob();
    }));
    if (current !== generation) return;
    const moduleURL = objectURL(new Blob([resources[0]], { type: 'text/javascript' }));
    const imageURL = objectURL(resources[1]);
    const { createHibiscus } = await import(moduleURL);
    if (current !== generation) return;
    login.hidden = true;
    experience.hidden = false;
    status.hidden = false;
    const created = await createHibiscus(stage, { image: imageURL });
    if (current !== generation) {
      created.destroy();
      return;
    }
    effect = created;
    window.hibiscus = effect;
    status.hidden = true;
    document.title = 'Hibiscus';
    history.replaceState(null, '', '/');
  } catch (failure) {
    if (current !== generation) return;
    lock();
    error.textContent = failure.message || 'Non riesco a caricare il fiore. Riprova.';
    error.hidden = false;
    password.setAttribute('aria-invalid', 'true');
    password.setAttribute('aria-describedby', 'error');
    password.focus();
  } finally {
    if (current === generation) {
      submit.disabled = false;
      form.removeAttribute('aria-busy');
    }
  }
});

document.getElementById('logout-form').addEventListener('submit', event => {
  event.preventDefault();
  lock();
  history.replaceState(null, '', '/login');
});
// Also discard the rendered flower when leaving via browser history.
window.addEventListener('pagehide', lock);
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    lock();
    history.replaceState(null, '', '/login');
  }
});
