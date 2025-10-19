from peewee import CharField

from .base import Base


class User(Base):
    username = CharField(unique=True)
    password_hash = CharField()


__all__ = ["User"]
