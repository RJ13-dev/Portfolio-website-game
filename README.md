# Rijul Sobti — Portfolio + Stimulus Game Backend

A full-stack Django app that serves my portfolio site and acts as the backend
for saving progress in my Stimulus puzzle game. It ties together Django, Django
REST Framework, PostgreSQL, Redis, Docker, JWT auth, a Gemini-powered chatbot,
GitHub Actions for CI, and Railway for hosting.

## What's here now

- **Portfolio site** — the single-page site, served by Django
  (`templates/portfolio.html`). The "Contact" chatbot calls a real
  Gemini-backed endpoint instead of hardcoded answers.
- **Stimulus game** — the full browser client lives in
  `templates/game_full.html`, served at `/play/game/`. The game engine and the
  auth/progress module are written in **TypeScript** (`static/ts/`) and
  transpiled in the browser by Babel standalone (see below).
- **Game-progress backend** — models, API, auth, and a leaderboard (coins,
  lives, the logic / sequence puzzle types), so coins, attempts, and used
  letters persist for signed-in players.

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Django 5 + Django REST Framework |
| Game client | TypeScript (`static/ts/`), transpiled in-browser by Babel |
| Database | PostgreSQL (SQLite fallback for quick local runs) |
| Cache | Redis (leaderboard) |
| Auth | JWT via `djangorestframework-simplejwt` |
| AI | Google Gemini (chatbot proxy, key stays server-side) |
| Containers | Docker + docker-compose (web, db, redis, nginx) |
| CI | GitHub Actions (lint + tests + image build) |
| Hosting | Railway (builds the Dockerfile, auto-deploys on push) |
| Docs | OpenAPI / Swagger at `/api/docs/` |

## Project structure

```
rijul-portfolio/
├── config/          Django project (settings, urls, wsgi)
├── core/            Pages (portfolio, game shell) + chatbot API
├── accounts/        Player accounts + JWT auth
├── games/           Game sessions, puzzle attempts, progress, leaderboard
├── templates/       portfolio.html (site) + game_full.html (Stimulus client)
├── static/
│   ├── ts/          Game in TypeScript (stimulus.ts, stimulus-auth.ts, globals.d.ts)
│   └── assets/      Game backgrounds + media
├── nginx/           Reverse-proxy config
├── .github/workflows/  CI (lint + tests + image build)
├── tsconfig.json
├── Dockerfile
└── docker-compose.yml
```

## The game is TypeScript

The game logic is authored in TypeScript under `static/ts/`:

- `stimulus.ts` — the game engine (start / lobby / letter / cards / puzzles / shop / ending).
- `stimulus-auth.ts` — guest / sign-in / sign-up flow + progress sync.
- `globals.d.ts` — shared types and `window` declarations (not emitted).

`game_full.html` loads these `.ts` files through **Babel standalone**, which
transpiles them in the browser — so the page ships no precompiled JavaScript.

If you prefer a build step over in-browser transpilation, compile with the
provided `tsconfig.json`:

```bash
npx tsc          # emits static/js/stimulus.js + stimulus-auth.js
```

Then, in `templates/game_full.html`, replace the two `text/babel` script tags
(and the Babel CDN `<script>`) with normal tags:

```html
<script src="{% static 'js/stimulus-auth.js' %}"></script>
<script src="{% static 'js/stimulus.js' %}"></script>
```

## Quick start (local, no Docker)

```bash
bash scripts/setup.sh
source .venv/bin/activate
python manage.py runserver
```

Visit http://127.0.0.1:8000 for the portfolio, and
http://127.0.0.1:8000/api/docs/ for the API docs.

## Quick start (Docker)

```bash
cp .env.example .env          # then fill in values
docker-compose up --build
```

The site is served through Nginx at http://localhost:8080.

## The Gemini chatbot

The chatbot endpoint (`POST /api/chat/`) reads `GEMINI_API_KEY` from the
environment — **the key never touches the browser**. Without a key the endpoint
returns a friendly fallback, so the site still runs in development. Add your key
to `.env`:

```
GEMINI_API_KEY=...
```

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register/` | Create a player account |
| POST | `/api/auth/login/` | Get JWT access + refresh tokens |
| GET | `/api/auth/me/` | Current player's profile |
| POST | `/api/games/sessions/` | Start a game session |
| POST | `/api/games/sessions/<id>/finish/` | Close session, award coins |
| POST | `/api/games/attempts/` | Record one puzzle attempt |
| GET | `/api/games/progress/` | Current progress snapshot |
| GET | `/api/games/leaderboard/` | Top players (cached) |
| POST | `/api/chat/` | Gemini-backed portfolio chatbot |

## Tests

```bash
pytest --cov=.
```

## Deploying to Railway

Hosting runs on Railway, which builds the `Dockerfile` and redeploys on every
push to `main` through its GitHub integration. Full step-by-step notes (adding
Postgres, setting the environment variables, running migrations) live in
[`DEPLOY_RAILWAY.md`](DEPLOY_RAILWAY.md).

At a minimum the web service needs `SECRET_KEY`, `DATABASE_URL` (referenced from
the Postgres service), and `GEMINI_API_KEY`. Redis is optional — without a
`REDIS_URL` the app falls back to in-memory caching.
