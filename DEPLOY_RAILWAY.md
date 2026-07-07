# Deploying to Railway

Your repo is now Railway-ready. Railway will build from the `Dockerfile`, run
database migrations on every deploy, serve the app with gunicorn on Railway's
port, and automatically trust your `*.up.railway.app` domain. Redis is optional
and left off (the app falls back to in-memory caching), so you only pay for the
web service + Postgres.

Files that make this work: `railway.json`, `Dockerfile`, and the Railway/CSRF
logic in `config/settings.py`.

---

## 1. Push your code to GitHub
Railway deploys from a GitHub repo, so commit and push everything first:
```
git add .
git commit -m "Prepare for Railway deploy"
git push
```
> Make sure `.env` is NOT committed (it's already in `.gitignore`). Secrets go
> in Railway's dashboard, not the repo.

## 2. Create the Railway project
1. Go to https://railway.com and sign in with GitHub.
2. **New Project → Deploy from GitHub repo →** pick `rijul-sobti-portfolio`.
3. Railway detects the `Dockerfile` and starts the first build. It'll fail health
   checks until you add the database + env vars below — that's expected.

## 3. Add a PostgreSQL database
1. In your project, click **New → Database → Add PostgreSQL**.
2. Railway creates a `DATABASE_URL` variable. Attach it to the web service:
   open your **web service → Variables → New Variable → Add Reference →**
   select `DATABASE_URL` from the Postgres service.
   (On most Railway projects the reference is `${{Postgres.DATABASE_URL}}`.)

## 4. Set the environment variables
On the **web service → Variables**, add these:

| Variable | Value |
|----------|-------|
| `SECRET_KEY` | a long random string (generate it — see below) |
| `DEBUG` | `False` |
| `GEMINI_API_KEY` | your Google Gemini key (rotate the old one first) |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `DATABASE_URL` | reference to the Postgres service (step 3) |

Generate a strong `SECRET_KEY` locally and paste the output in:
```
python -c "from django.core.management.utils import get_random_secret_key as g; print(g())"
```
> Do **not** set `REDIS_URL` — leaving it unset keeps Redis off and free.
> `ALLOWED_HOSTS` and CSRF are handled automatically for the Railway domain, so
> you don't need to set them unless you add a custom domain (then add it to
> `ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS`, comma-separated).

## 5. Deploy
Railway redeploys automatically when you save variables (and on every `git push`).
Watch the **Deployments** tab. When it goes green, click the generated URL
(e.g. `https://rijul-sobti-portfolio-production.up.railway.app`).

## 6. Create your admin user (one-time)
To log into `/admin/`, open the web service's **⋮ menu → Terminal** (or use the
Railway CLI) and run:
```
python manage.py createsuperuser
```

---

## Notes & troubleshooting
- **Migrations** run automatically on each deploy (in the start command), so your
  tables are always up to date.
- **Static files** (CSS/JS/images) are collected during the Docker build and
  served by WhiteNoise — no separate static host needed.
- **HTTPS** is provided by Railway automatically; the app forces HTTPS and sends
  HSTS because `DEBUG=False`.
- **"Bad Request (400)"** on load usually means the host isn't trusted — confirm
  `DEBUG=False` and that Railway's `RAILWAY_PUBLIC_DOMAIN` is present (it is by
  default). For a custom domain, add it to the `ALLOWED_HOSTS` env var.
- **App crashes on boot** → check the Deploy logs. A missing/placeholder
  `SECRET_KEY` will intentionally stop startup (a security guard) — set a real one.
- **Cost:** Hobby plan (~$5/mo, $5 usage included) comfortably covers a
  low-traffic portfolio + Postgres with no cold starts.
