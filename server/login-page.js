export function loginPage(error = false) {
  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#000000">
  <title>Hibiscus · Accedi</title>
  <style>
    :root { color-scheme: dark; --ink: #f3e9e6; --accent: #e0303a; --serif: "Baskerville", "Palatino Linotype", "Book Antiqua", Georgia, serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 32px 24px; background: #000; color: var(--ink); font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    main { width: min(100%, 260px); }
    .mark { display: block; width: 56px; height: 56px; color: var(--accent); margin: 0 auto 48px; }
    label { display: block; margin-bottom: 4px; color: #c9b9b7; font-family: var(--serif); font-size: 21px; font-style: italic; font-weight: 400; letter-spacing: .025em; text-align: center; }
    input, button { width: 100%; min-height: 48px; font: inherit; }
    input { height: 52px; padding: 12px 16px; border: 0; border-bottom: 1px solid #806467; border-radius: 0; background: transparent; color: var(--ink); caret-color: #d7b4ba; font-size: 18px; letter-spacing: .28em; text-align: center; transition: border-color .25s; }
    input:hover { border-bottom-color: #b58b91; }
    input:focus { border-bottom-color: #e8bfc5; outline: none; }
    input[aria-invalid="true"] { border-color: #ff7880; }
    .error { margin: 14px 0 0; color: #ff9197; font-size: 12px; line-height: 1.5; text-align: center; }
    button { position: relative; display: flex; align-items: center; justify-content: center; gap: 18px; width: 144px; min-height: 52px; margin: 34px auto 0; padding: 10px 16px; border: 0; border-radius: 2px; background: transparent; color: #dfccca; font-family: var(--serif); font-size: 21px; font-style: italic; font-weight: 400; letter-spacing: .025em; cursor: pointer; transition: color .25s; }
    button::after { content: ""; position: absolute; left: 16px; right: 16px; bottom: 0; height: 1px; background: #78575d; transform: scaleX(.7); transition: transform .25s, background .25s; }
    button svg { flex: none; color: #c39b9f; transition: transform .25s; }
    button:hover { color: var(--ink); }
    button:hover::after { background: #c39b9f; transform: scaleX(1); }
    button:hover svg { transform: translateX(4px); }
    button:focus-visible { outline: 1px solid var(--ink); outline-offset: 6px; }
    @media (prefers-reduced-motion: reduce) { input, button, button::after, button svg { transition: none; } }
  </style>
</head>
<body>
  <main>
    <svg class="mark" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M32 34C25 30 20 23 23 17C25 12 29 11 32 14C36 10 42 12 43 17C45 24 39 30 32 34Z"/>
      <path d="M32 34C25 30 20 23 23 17C25 12 29 11 32 14C36 10 42 12 43 17C45 24 39 30 32 34Z" transform="rotate(72 32 34)"/>
      <path d="M32 34C25 30 20 23 23 17C25 12 29 11 32 14C36 10 42 12 43 17C45 24 39 30 32 34Z" transform="rotate(144 32 34)"/>
      <path d="M32 34C25 30 20 23 23 17C25 12 29 11 32 14C36 10 42 12 43 17C45 24 39 30 32 34Z" transform="rotate(216 32 34)"/>
      <path d="M32 34C25 30 20 23 23 17C25 12 29 11 32 14C36 10 42 12 43 17C45 24 39 30 32 34Z" transform="rotate(288 32 34)"/>
      <path d="M32 34Q43 27 49 12" stroke="#000" stroke-width="4"/>
      <path d="M32 34Q43 27 49 12M45 20L49 18M47 16L45 13"/>
      <g fill="currentColor" stroke="none">
        <circle cx="49" cy="11" r="1.8"/>
        <circle cx="50" cy="18" r="1.3"/>
        <circle cx="45" cy="12" r="1.3"/>
      </g>
    </svg>
    <form method="post" action="/login">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" maxlength="256" required${error ? ' autofocus aria-invalid="true" aria-describedby="error"' : ''}>
      ${error ? '<p class="error" id="error" role="alert">La password non è corretta. Riprova.</p>' : ''}
      <button type="submit">
        <span>Entra</span>
        <svg width="20" height="16" viewBox="0 0 20 16" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8h15M12 3l5 5-5 5"/></svg>
      </button>
    </form>
  </main>
</body>
</html>`;
}
