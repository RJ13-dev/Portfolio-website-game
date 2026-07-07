# Security Audit & Penetration Test Plan — rijul-sobti-portfolio

**Target:** Django 5 + DRF portfolio site with a Gemini chatbot, JWT-authenticated puzzle game, WhiteNoise/nginx static serving, deployed to AWS Elastic Beanstalk.
**Author of plan:** internal security review (authorized — you own this asset).

> ⚠️ **Ground rules.** Only test infrastructure you own. Run active/automated scans (ZAP, sqlmap, ffuf, hydra) against a **local or staging** instance, not the live production URL, or you may trip AWS abuse detection and cause a real outage. Take a DB backup before fuzzing write endpoints.

---

## 0. Priority findings (discovered during code review)

These are real issues in the current code, ranked. Fix these before spending time on exotic tests.

| # | Severity | Finding | Where | Fix summary |
|---|----------|---------|-------|-------------|
| F1 | **High** | `/api/chat/` is `AllowAny` with **no rate limiting and no length cap** — anyone can hammer it, running up your Gemini bill (financial DoS) and using your key as a free LLM proxy. | `core/api/views.py` | Add DRF throttling + max message length. |
| F2 | **High** | `DEBUG` defaults to `True` (`env_bool("DEBUG", True)`). If the Elastic Beanstalk env var isn't set, prod runs with `DEBUG=True` → full stack traces, settings, and SQL leaked. The deploy workflow never sets it. | `config/settings.py:25`, `deploy.yml` | Force `DEBUG=False` in the EB environment; fail closed. |
| F2b | **High** | `SECRET_KEY` falls back to `"insecure-dev-key-change-me"` if the env var is missing. A predictable key lets attackers forge sessions/signed tokens. | `config/settings.py:24` | Require it in prod (no default), rotate it. |
| F3 | **Med** | No global DRF throttling → `/api/auth/login/` and `/register/` are open to credential brute force and bot mass-registration. | `settings.py` REST_FRAMEWORK | Add `DEFAULT_THROTTLE_CLASSES/RATES`. |
| F4 | **Med** | Outdated dependencies with published advisories: **Django 5.0.6** (later 5.0.x fix a potential SQLi, CVE-2024-42005, plus several ReDoS) and **gunicorn 22.0.0** (request smuggling, CVE-2024-6827, fixed in 23.0.0). | `requirements.txt` | Upgrade; see §3. |
| F5 | **Med** | Swagger UI + OpenAPI schema (`/api/docs/`, `/api/schema/`) are publicly exposed, enumerating every endpoint and parameter. | `config/urls.py` | Gate behind auth or disable in prod. |
| F6 | **Med** | Game state is client-authoritative: `PUT /api/games/progress/` accepts `coins` straight from the client (`int(data["coins"])`). Any player can set themselves to top of the leaderboard. | `games/views.py` | Server-side validation / derive coins from attempts. |
| F7 | **Low** | JWT access token stored in `localStorage` (`stimulus-auth.ts`) → readable by any XSS. HSTS not configured; no CSP. | frontend + settings | See §1, §5. |
| F8 | **Low** | No HSTS header (`SECURE_HSTS_SECONDS` unset) and no Content-Security-Policy. | `settings.py` | See §5. |

A ready-to-paste hardened settings block is in **§7**.

---

## 1. Input Validation & Injection (XSS, SQLi, HTML injection)

### 1.1 Your real input surfaces
- `POST /api/chat/` — `message` field → forwarded to Gemini, reply rendered in the chat panel.
- `POST /api/auth/register/` — `username`, `password`, `display_name`.
- `POST /api/auth/login/` — `username`, `password`.
- `PUT /api/games/progress/` — `coins`, `purchased_items`, `used_letters`, `settings`.
- Django admin at `/admin/`.

There is **no raw SQL** in the codebase — everything goes through the Django ORM and DRF serializers, which parameterize queries. So classic SQLi is unlikely, but you still verify (ORM misuse, `.extra()`, `raw()`, and the Django 5.0.6 CVE-2024-42005 make it worth a scan).

### 1.2 SQL Injection — how to test
1. **Static check** — confirm no raw query building:
   ```bash
   grep -rnE "\.raw\(|\.extra\(|cursor\.execute|RawSQL|f\".*SELECT|%.*SELECT" --include=*.py .
   ```
   (Should return nothing meaningful.)
2. **Dynamic check with sqlmap** against a staging instance. Capture a real authenticated request first (Burp/ZAP → "Copy as curl" or save the raw request to `req.txt`), then:
   ```bash
   sqlmap -r req.txt --batch --level=2 --risk=2 --dbms=postgresql
   # e.g. target the display_name / username fields and the progress JSON body
   ```
3. **Manual payloads** to drop into `username`, `display_name`, `message`:
   ```
   ' OR '1'='1
   ") OR ("1"="1
   '; SELECT pg_sleep(5)-- -
   1' AND 1=CAST((SELECT version()) AS int)-- -
   ```
   A correct result: identical, boringly-handled responses and **no** 500s or time delays. A `pg_sleep` that actually delays the response = real finding.

### 1.3 Cross-Site Scripting (XSS) — how to test
The highest-value target is the **chatbot reply rendering**. Check whether the frontend inserts the reply with `textContent` (safe) or `innerHTML` (dangerous):
```bash
grep -rnE "innerHTML|insertAdjacentHTML|outerHTML|document.write" templates/ static/
```
- If the reply is written with `innerHTML`, it is **stored/reflected XSS** because you can make Gemini echo markup, or a network MITM can. Switch to `textContent` or sanitize with DOMPurify.

**Test payloads** — submit these as the chat `message`, as `display_name` at registration, and anywhere text is later shown (leaderboard shows `display_name`!):
```
<script>alert(document.domain)</script>
<img src=x onerror=alert(1)>
"><svg onload=alert(1)>
<a href="javascript:alert(1)">x</a>
{{7*7}}                     ← template-injection probe (should render literally, not 49)
${7*7}
javascript:alert(1)
```
Steps:
1. Register a user with `display_name` = `<img src=x onerror=alert(1)>`.
2. Get onto the leaderboard (`GET /api/games/leaderboard/`) and load any page that renders it.
3. If the alert fires → stored XSS via display name. Expected safe behavior: the markup shows as literal text.
4. Repeat for the chat panel and the game's welcome banner (`"Welcome, " + name`).

**Note:** the leaderboard serializer returns `display_name` as JSON; risk depends on how the client renders it. Confirm client-side rendering uses `textContent`.

### 1.4 HTML injection / content spoofing
Same payloads minus the script — e.g. `<h1>hi</h1>`, `<iframe src=//evil.tld>`. If they render as real elements anywhere, that's HTML injection (phishing/defacement vector).

### 1.5 Tools
- **OWASP ZAP** (free) — Automated Scan against the staging URL; then "Manual Explore" with the AJAX spider for the SPA routes. Use the "DOM XSS" active scan rules.
- **Burp Suite Community** — Repeater for hand-crafting the payloads above.
- **Browser DevTools** — Network tab to watch the raw `/api/chat/` response; Console for CSP violations once CSP is on.
- **sqlmap** — DB-layer testing (staging only).

---

## 2. Form Security, Spam & DoS

Your "forms" are JSON API endpoints. Bots don't need your UI — they'll hit the API directly.

### 2.1 Bot / automated submission testing
Simulate a bot flood against **staging**:
```bash
# 200 rapid chat requests — watch for throttling (HTTP 429) vs all 200s
for i in $(seq 1 200); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/api/chat/ \
    -H "Content-Type: application/json" -d '{"message":"spam '$i'"}'
done | sort | uniq -c
```
- All `200` = **no rate limiting** (confirms F1). After hardening you want to see `429`s kick in.
- Do the same for `/api/auth/register/` (mass account creation) and `/api/auth/login/` (brute force).

For heavier, structured testing:
- **ffuf** — `ffuf -w passwords.txt -X POST -d '{"username":"admin","password":"FUZZ"}' -H 'Content-Type: application/json' -u http://localhost:8000/api/auth/login/ -mc all` and watch status codes.
- **hydra** — classic credential brute force (staging only).

### 2.2 The fixes you're testing for
1. **DRF throttling** (see §7): per-IP `AnonRateThrottle` + a tight custom scope on `/api/chat/`.
2. **A honeypot field or CAPTCHA** on registration (hCaptcha/Cloudflare Turnstile are free) — bots fill hidden fields; reject those.
3. **Message length cap** on chat (e.g. 1–2 KB) so nobody sends 9 MB blobs to Gemini. nginx's `client_max_body_size 10M` is a coarse backstop — tighten it and validate in the view.
4. **Account lockout / exponential backoff** on repeated failed logins.

### 2.3 Email spoofing
You currently email nothing server-side (contact is a Gemini chat + a `mailto:`), so classic form-to-email spoofing isn't in scope. **But** if you add real email later, configure **SPF, DKIM, and DMARC** DNS records for your sending domain and test them:
- Send a test to a Gmail account → "Show original" → confirm `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.
- Verify with `https://www.mail-tester.com` or `dig TXT _dmarc.yourdomain`.

### 2.4 Application-layer DoS
- Test the unauthenticated, expensive endpoints: `/api/chat/` (calls Gemini, 20 s timeout) and `/api/games/leaderboard/` (DB query, though it's cached 30 s — good).
- Confirm nginx `client_max_body_size` and add a request timeout. Consider AWS WAF rate-based rules in front of Elastic Beanstalk.

---

## 3. Dependency & Package Audit (CVEs)

### 3.1 Python / backend
```bash
pip install pip-audit
pip-audit -r requirements.txt            # authoritative CVE scan against PyPI advisory DB
# or
pip install safety && safety check -r requirements.txt
```
Known items to expect (confirm with the tool):
- **Django 5.0.6** → upgrade to the latest 5.0.x/5.1.x. Later 5.0 releases fix CVE-2024-42005 (potential SQLi via `QuerySet.values()`/`values_list()` on JSONField) and several ReDoS CVEs.
- **gunicorn 22.0.0** → upgrade to **23.0.0+** (CVE-2024-6827 HTTP request smuggling).
- `psycopg2-binary` is unpinned — pin it.
- `anthropic==0.31.0` appears unused (you migrated to Gemini) — **remove it** to shrink attack surface.

### 3.2 Frontend / JS
You have no npm build, but you load third-party JS from a CDN:
- `@babel/standalone` and any CDN scripts in `templates/` — **pin to an exact version and add Subresource Integrity (SRI)** hashes:
  ```html
  <script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.24.7/babel.min.js"
          integrity="sha384-..." crossorigin="anonymous"></script>
  ```
  Generate the hash at https://www.srihash.org. Without SRI, a CDN compromise = full XSS.
- Shipping in-browser Babel transpilation is itself a risk/perf issue; consider precompiling `static/ts` to JS for production.

### 3.3 Container image
```bash
# Scan the built Docker image for OS + Python CVEs
trivy image rijul-portfolio:latest
# or
docker scout cves rijul-portfolio:latest
```
- Your base is `python:3.12-slim` — rebuild regularly to pick up Debian security updates.

### 3.4 Automate it
- Turn on **GitHub Dependabot** (`.github/dependabot.yml`) for `pip` and `docker` ecosystems + Dependabot security alerts.
- Add `pip-audit` as a step in `deploy.yml` so builds fail on new criticals.

---

## 4. Information Disclosure & Metadata

### 4.1 Secrets in the repo / on disk
- ✅ `.env` **is** gitignored (`.gitignore:13`) and `staticfiles/`, `db.sqlite3` too. Good.
- ⚠️ Your local `.env` contains a **live `GEMINI_API_KEY`**. Verify it was never committed historically and rotate it if in doubt:
  ```bash
  git log --all -p -- .env | grep -i "GEMINI\|API_KEY\|SECRET"   # should be empty
  git log --all --oneline -- .env                                  # should show no commits
  ```
- Scan the whole history for leaked secrets:
  ```bash
  pipx run trufflehog git file://. --only-verified
  # or
  docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect -s /repo
  ```
- If a secret was ever committed, rotating the key is mandatory — deleting the file doesn't remove it from history.

### 4.2 Exposed files / directories on the live host
Check these URLs return **404/403**, not content:
```bash
for p in .env .git/config .git/HEAD requirements.txt docker-compose.yml \
         Dockerfile db.sqlite3 .env.example manage.py config/settings.py \
         static/ts/stimulus.ts api/schema/ api/docs/ admin/ ; do
  echo -n "$p -> "; curl -s -o /dev/null -w "%{http_code}\n" "https://YOURSITE/$p"
done
```
- `.git/` exposure is critical — it lets anyone reconstruct your whole source. nginx should never serve it. (Your nginx only aliases `/static/`, which is good, but confirm the EB/host config too.)
- `.env` must be 404. `/api/docs/` and `/api/schema/` currently return **200** → decide whether that's acceptable (F5).
- Note `static/ts/stimulus.ts` **is** served (your game needs it) — make sure it contains no secrets (it doesn't today; keep it that way).

### 4.3 Verbose errors & debug leakage
- With `DEBUG=True`, Django's yellow error page leaks settings, installed apps, and local variables. **Force `DEBUG=False` in prod** and confirm:
  ```bash
  curl -s https://YOURSITE/this-path-does-not-exist | grep -i "traceback\|djangoproject\|settings"
  ```
  Should show a plain 404, not a stack trace.
- Your chat view has `if settings.DEBUG:` branches that echo raw Gemini HTTP error bodies and exception details (`core/api/views.py:84,97,101`). That's fine **only** while `DEBUG=False` in prod. Double-check.

### 4.4 Response headers that leak stack details
```bash
curl -sI https://YOURSITE/ | grep -iE "server|x-powered-by|via"
```
- Hide/normalize the `Server` header at nginx (`server_tokens off;`) and don't advertise Django/gunicorn versions.

### 4.5 Client-side leakage
- Open DevTools → **Console** on every route; there should be no logged tokens, keys, or verbose errors.
- DevTools → **Application → Local Storage**: note `stim_access` / `stim_refresh` JWTs are stored here (F7). Confirm no API keys are in localStorage or in the JS bundle:
  ```bash
  grep -rniE "AIza|sk-ant|AKIA|secret|api_key|password" static/ templates/ | grep -v csrf
  ```
  (`AIza…` = Google keys, `AKIA…` = AWS, `sk-ant…` = Anthropic.)

---

## 5. Content-Security-Policy & HTTP Security Headers

### 5.1 What Django already sends (verify)
`SecurityMiddleware` + `XFrameOptionsMiddleware` are enabled, so by default you already get:
- `X-Content-Type-Options: nosniff` (default on)
- `X-Frame-Options: DENY` (clickjacking protection — good)
- `Referrer-Policy: same-origin` (default)
- `Cross-Origin-Opener-Policy: same-origin` (default)

### 5.2 What's missing / to add
| Header | Status | Action |
|--------|--------|--------|
| `Strict-Transport-Security` (HSTS) | ❌ missing | Set `SECURE_HSTS_SECONDS = 31536000`, `SECURE_HSTS_INCLUDE_SUBDOMAINS = True`, `SECURE_HSTS_PRELOAD = True` |
| `Content-Security-Policy` | ❌ missing | Add `django-csp` (see below) |
| `X-Content-Type-Options` | ✅ (default) | confirm present |
| `X-Frame-Options` | ✅ DENY | keep |
| `Referrer-Policy` | ✅ same-origin | keep |
| `Permissions-Policy` | ❌ | optional: lock down `geolocation=(), camera=(), microphone=()` |

### 5.3 CSP is the hard one for this site
Your pages use **lots of inline `<style>` and inline/`text/babel` scripts**, plus the jsDelivr CDN. A strict CSP would break them, so either:
- Start in **report-only** mode to measure violations without breaking anything:
  ```python
  # with django-csp
  CONTENT_SECURITY_POLICY_REPORT_ONLY = {
      "DIRECTIVES": {
          "default-src": ["'self'"],
          "script-src": ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:"],
          "connect-src": ["'self'"],
          "frame-ancestors": ["'none'"],
          "report-uri": ["/csp-report/"],
      }
  }
  ```
- Longer term, move inline scripts to files and add per-request **nonces** so you can drop `'unsafe-inline'` from `script-src`. Until then `'unsafe-inline'` on scripts significantly weakens XSS protection — which is exactly why §1.3 (using `textContent`) matters.

### 5.4 Verify headers
```bash
curl -sI https://YOURSITE/ | grep -iE "strict-transport|content-security|x-frame|x-content|referrer|permissions"
```
Free graders:
- **https://securityheaders.com** — one-click A–F grade.
- **Mozilla Observatory** (https://developer.mozilla.org/observatory) — deeper checks + remediation tips.

---

## 6. SSL/TLS & Connection Security

### 6.1 Verify the certificate & protocols
- **Qualys SSL Labs**: https://www.ssllabs.com/ssltest/analyze.html?d=YOURSITE — aim for **A/A+**. It flags weak ciphers, TLS 1.0/1.1, chain issues, expiry.
- **testssl.sh** (free, local, thorough):
  ```bash
  docker run --rm drwetter/testssl.sh https://YOURSITE
  ```
  Confirm: TLS 1.2 + 1.3 only (no SSLv3/TLS 1.0/1.1), strong ciphers, valid chain, cert not near expiry.
- Quick cert glance:
  ```bash
  echo | openssl s_client -connect YOURSITE:443 -servername YOURSITE 2>/dev/null | openssl x509 -noout -dates -issuer -subject
  ```
- On AWS: use an **ACM certificate on the load balancer** with auto-renewal so expiry never bites you.

### 6.2 Verify HTTP → HTTPS redirect
```bash
curl -sI http://YOURSITE/ | grep -iE "location|http/"
# expect: HTTP/1.1 301 ... Location: https://YOURSITE/
```
Your Django settings already do the right thing **when `DEBUG=False`** (`SECURE_SSL_REDIRECT=True`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SECURE_PROXY_SSL_HEADER`). Two things to verify:
1. `DEBUG` really is `False` in prod (ties back to F2) — otherwise none of that turns on.
2. Behind nginx/ALB, `SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO","https")` requires the proxy to actually set `X-Forwarded-Proto`. Your nginx sets it (`proxy_set_header X-Forwarded-Proto $scheme;` ✅). On EB, confirm the load balancer forwards it too, or the redirect can loop.

### 6.3 Cookies & HSTS
- Confirm `Set-Cookie` for session/CSRF has `Secure`, `HttpOnly`, `SameSite`:
  ```bash
  curl -sI https://YOURSITE/admin/login/ | grep -i set-cookie
  ```
- Once HTTPS is stable, enable HSTS (§5.2) and consider submitting to the preload list.

---

## 7. Quick-win hardening block (paste into `config/settings.py`)

```python
# --- Fail closed on the two dangerous defaults ---
DEBUG = env_bool("DEBUG", False)                     # default OFF, not ON
if not DEBUG and SECRET_KEY == "insecure-dev-key-change-me":
    raise RuntimeError("SECRET_KEY must be set in production.")

# --- Security headers (in the `if not DEBUG:` block) ---
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"

# --- DRF throttling (fixes F1/F3) ---
REST_FRAMEWORK.update({
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/hour",
        "user": "1000/hour",
        "chat": "15/hour",     # tight cap on the paid Gemini endpoint
        "login": "10/min",
    },
})
```
```python
# core/api/views.py — cap message size and throttle the chat scope
class ChatView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "chat"

    def post(self, request):
        user_message = (request.data.get("message") or "").strip()
        if not user_message:
            return Response({"detail": "A 'message' field is required."}, status=400)
        if len(user_message) > 2000:
            return Response({"detail": "Message too long."}, status=400)
        ...
```
Also: gate the API docs (`if settings.DEBUG:` around the `api/docs/` + `api/schema/` routes, or require auth), add a `login` throttle scope to the JWT login view, and validate `coins` server-side in `ProgressView.put`.

---

## 8. Suggested run order
1. Fix F1–F2b (throttle chat, force `DEBUG=False`, real `SECRET_KEY`) — highest risk, lowest effort.
2. `pip-audit` + `trivy` → patch Django/gunicorn (§3).
3. `gitleaks`/`trufflehog` history scan + rotate the Gemini key (§4.1).
4. Confirm `textContent` rendering for chat + display name (§1.3), then layer CSP report-only (§5.3).
5. SSL Labs + securityheaders.com for an external grade (§5–6).
6. Only after staging is clean, do a light authenticated ZAP baseline scan.

---
*Generated as an internal, authorized security review. Keep this file out of production artifacts (add `SECURITY_AUDIT.md` to your deploy `-x` excludes).*
