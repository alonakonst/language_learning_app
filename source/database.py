"""Database configuration for SQLite (default) or Postgres via DATABASE_URL."""
import os
import urllib.parse as urlparse

from peewee import PostgresqlDatabase, SqliteDatabase

DATABASE_URL = os.getenv("DATABASE_URL")


def _postgres_database(url: str) -> PostgresqlDatabase:
    urlparse.uses_netloc.append("postgres")
    parsed = urlparse.urlparse(url)
    query_params = {key: values[0] for key, values in urlparse.parse_qs(parsed.query).items()}

    # Render-hosted Postgres instances expect SSL. Default to require unless
    # explicitly overridden in the URL query.
    query_params.setdefault("sslmode", "require")

    return PostgresqlDatabase(
        parsed.path.lstrip("/"),  # Database name (remove leading '/')
        user=parsed.username,
        password=parsed.password,
        host=parsed.hostname,
        port=parsed.port or 5432,
        **query_params,
    )


if DATABASE_URL:
    database = _postgres_database(DATABASE_URL)
else:
    database_path = os.getenv("SQLITE_PATH", "database.db")
    database = SqliteDatabase(database_path)
