"""Per-exercise completion log with attempt quality scoring."""
from datetime import datetime

from peewee import CharField, DateTimeField, ForeignKeyField, IntegerField

from .base import Base
from .dictionary_entry import DictionaryEntry
from .user import User


class ExerciseLog(Base):
    user = ForeignKeyField(User, backref="exercise_logs", on_delete="CASCADE")
    entry = ForeignKeyField(DictionaryEntry, backref="exercise_logs", null=True, on_delete="SET NULL")
    kind = CharField(null=False)
    created_at = DateTimeField(default=datetime.utcnow, null=True)
    # 1: correct first attempt, 2: second, 3: third-or-later, 4: never correct
    attempt_score = IntegerField(default=1, null=False)
