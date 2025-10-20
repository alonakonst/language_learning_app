import os

from peewee import SqliteDatabase
from playhouse.db_url import connect

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    database = connect(DATABASE_URL)
else:
    sqlite_path = os.getenv("SQLITE_DB_PATH", "database.db")
    database = SqliteDatabase(sqlite_path, pragmas={"journal_mode": "wal"})
