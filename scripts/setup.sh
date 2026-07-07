#!/usr/bin/env bash
# Quick local setup (without Docker).
set -e

echo "→ Creating virtual environment"
python -m venv .venv
source .venv/bin/activate

echo "→ Installing dependencies"
pip install -r requirements.txt

echo "→ Copying environment file"
[ -f .env ] || cp .env.example .env

echo "→ Running migrations"
python manage.py migrate

echo "→ Collecting static files"
python manage.py collectstatic --noinput

echo ""
echo "Done. Start the server with:"
echo "    source .venv/bin/activate && python manage.py runserver"
echo ""
echo "Then visit http://127.0.0.1:8000  (portfolio)"
echo "API docs at  http://127.0.0.1:8000/api/docs/"
