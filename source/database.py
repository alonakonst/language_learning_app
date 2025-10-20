import os
from peewee import SqliteDatabase
from playhouse.db_url import connect

DATABASE_URL = os.getenv("DATABASE_URL")

#  Fix old-style postgres:// to postgresql://
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

try:
    if DATABASE_URL:
        print(" Connecting to PostgreSQL...")
        database = connect(DATABASE_URL)
    else:
        print(" Using local SQLite database...")
        sqlite_path = os.getenv("SQLITE_DB_PATH", "database.db")
        database = SqliteDatabase(sqlite_path, pragmas={"journal_mode": "wal"})
except Exception as e:
    print(" Database connection failed:", e)
    database = SqliteDatabase(":memory:")
