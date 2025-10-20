import os
from peewee import SqliteDatabase
from playhouse.db_url import connect

# Get DB URL from environment (Render sets this automatically)
DATABASE_URL = os.getenv("DATABASE_URL")

try:
    if DATABASE_URL:
        # Use Postgres (Render / Production)
        print(" Connecting to PostgreSQL...")
        database = connect(DATABASE_URL, autorollback=True)
    else:
        # Default to local SQLite
        print(" Using local SQLite database...")
        sqlite_path = os.getenv("SQLITE_DB_PATH", "database.db")
        database = SqliteDatabase(sqlite_path, pragmas={"journal_mode": "wal"})
except Exception as e:
    print("Database connection failed:", e)
    # Fallback to in-memory DB (or crash gracefully)
    database = SqliteDatabase(':memory:')
