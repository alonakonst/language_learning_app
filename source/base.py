"""Shared Peewee base model bound to the configured database."""
from .database import database

from peewee import Model


class Base(Model):
    class Meta:
        database = database
