# Language Learning App

A Flask-based single-page app for collecting English/Danish vocabulary, practising with AI-generated exercises, and tracking progress over time.

## Features
- User authentication with a pre-seeded demo login (`tester` / `1234`) startup.
- Save bilingual dictionary entries, view saved words, and hear Danish pronunciation.
- AI-powered practice modes (flashcards, contextual sentences) plus usage examples for entries.
- Progress page showing recent word additions and completed exercises.
- Postgres via `DATABASE_URL`.

## Setup
1. Install dependencies: `pip install -r requirements.txt` (use a virtualenv).
2. Create `.env` file and set required env vars:
   - `OPENAI_API_KEY` for AI prompts.
   - `GOOGLE_APPLICATION_CREDENTIALS` pointing to a service-account JSON for Translate/Text-to-Speech.
   - Optional: `DATABASE_URL` for Postgres (otherwise uses `database.db`).
3. Run the app locally: `python3 server.py`.

## Data and demo seeding
- Export the database to JSON: `python scripts/export_data.py -o export.json`.

## Project layout
- `server.py`: Flask routes, auth, progress, seeding.
- `source/`: ORM models and LLM helper functions.
- `templates/index.html`: Single-page UI shell.
- `static/`: Frontend JS and styles.
- `scripts/export_data.py`: Export data to JSON.

## App is available on
https://language-learning-app-13k2.onrender.com/