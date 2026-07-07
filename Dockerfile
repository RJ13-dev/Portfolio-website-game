FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System deps for psycopg2
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Collect + hash static at build time. A throwaway SECRET_KEY is supplied only
# for this command (the real one is injected at runtime); DEBUG=False so the
# hashed/manifest storage is used for production.
RUN SECRET_KEY="build-time-placeholder-not-used-at-runtime" DEBUG="False" \
    python manage.py collectstatic --noinput

EXPOSE 8000

# Run migrations, then serve with gunicorn. Binds $PORT when the platform sets
# it (Railway), falling back to 8000 locally / on Elastic Beanstalk.
# (docker-compose overrides this command with its own for the prod/dev stacks.)
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 2 --timeout 60"]
