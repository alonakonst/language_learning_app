from datetime import datetime

from peewee import CharField, DateTimeField, ForeignKeyField

from .base import Base
from .user import User


class ExerciseLog(Base):
    user = ForeignKeyField(User, backref="exercise_logs", on_delete="CASCADE")
    kind = CharField(max_length=32, default="practise", null=False)
    created_at = DateTimeField(default=datetime.utcnow, null=True)

    def __str__(self) -> str:
        return f"{{id={self.id} user_id={self.user_id} kind={self.kind!r} created_at={self.created_at}}}"
