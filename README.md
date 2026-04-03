# Budget Planner Application

Budget Planner is a Flask app to track monthly income, expenses, EMI payments, and category budgets.

## Features

- Multi-user login and registration
- Monthly expense tracking with categories and payment methods
- Monthly income and EMI tracking
- Budget vs spent dashboard
- Copy previous month income/budget/EMI

## Local Development

### 1) Prerequisites

- Python 3.9+

### 2) Create virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3) Install dependencies

```bash
pip install -r requirements.txt
```

### 4) Run the app

```bash
python app.py
```

By default, app runs on `http://127.0.0.1:5001`.

## Production (Railway + Turso)

This project is configured for Railway deployment and Turso as the persistent database.

Set these Railway **service variables**:

```bash
TURSO_DATABASE_URL=libsql://<your-db>.turso.io
TURSO_AUTH_TOKEN=<your-token>
FLASK_SECRET_KEY=<strong-random-secret>
```

Notes:

- On Railway, app will fail fast if Turso vars are missing (to avoid accidental local SQLite data loss).
- `build.sh` runs `init_db()` during deploy to ensure schema exists.

## Database Safety

- Do not use container-local SQLite for production data.
- Keep Turso token secret; rotate immediately if exposed.
- Optional: add periodic export backups for disaster recovery.

## Project Structure

```
/
|-- app.py
|-- build.sh
|-- requirements.txt
|-- templates/
|-- static/
|-- README.md
```
