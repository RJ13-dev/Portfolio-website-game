# Security notes

Quick notes to myself on how this app is locked down, so I remember why things
are set the way they are. Nothing here is exotic — just the basics done
properly.

## What's in place

- **DEBUG is off by default.** It only turns on if I explicitly set `DEBUG=True`
  in my local `.env`, so a missing env var on Railway can never leave prod
  running with stack traces. See `config/settings.py`.
- **No placeholder secret in prod.** If `SECRET_KEY` is missing or still the dev
  placeholder while `DEBUG=False`, the app refuses to boot.
- **HTTPS is forced in prod.** SSL redirect, secure + httponly cookies, HSTS
  (1 year, preload), and the proxy SSL header for Railway's load balancer all
  switch on when `DEBUG` is off.
- **The Gemini key stays server-side.** The browser never sees it — the chatbot
  only ever calls my own `/api/chat/` endpoint.
- **Rate limiting.** DRF throttles cover the chat endpoint (30/hour), login
  (10/min), and register (20/hour) so nobody can drain the Gemini quota or
  brute-force logins.
- **Chat message length is capped** (2000 chars) before anything hits Gemini.
- **Game state is clamped.** The progress endpoint bounds coins and caps the
  size of the saved lists, so the leaderboard can't be trivially gamed.
- **Display names / usernames are validated** on registration to keep markup out
  of anything later rendered (e.g. the leaderboard).
- **API docs are dev-only.** Swagger and the schema are behind `DEBUG`, so they
  aren't exposed in production.
- **nginx** hides its version (`server_tokens off`) and caps request bodies
  (`client_max_body_size 1M`).

## Things to keep an eye on

- The game stores its JWT in `localStorage`, which is fine for this project but
  means any XSS could read it. Keep rendering user text with `textContent`, not
  `innerHTML`.
- No Content-Security-Policy yet — the page leans on inline styles/scripts, so
  adding a strict CSP would need a bit of refactoring first.
- Run `pip-audit` now and then to catch new dependency CVEs, and rebuild the
  Docker image so it picks up base-image security updates.
