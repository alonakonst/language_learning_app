import os
from peewee import PostgresqlDatabase, SqliteDatabase

DATABASE_URL = os.getenv("DATABASE_URL")

    # Parse the connection string manually
import urllib.parse as urlparse
urlparse.uses_netloc.append("postgres")
url = urlparse.urlparse(DATABASE_URL)

database = PostgresqlDatabase(
    url.path[1:],  # Database name (remove leading '/')
    user=url.username,
    password=url.password,
    host=url.hostname,
    port=url.port or 5432,  # Default Postgres port
)

