"""Per-user per-day counters for completed practice exercises."""
from datetime import date

from peewee import DateField, ForeignKeyField, IntegerField

from .base import Base
from .user import User


class DailyExerciseTotal(Base):
    user = ForeignKeyField(User, backref="daily_exercise_totals", on_delete="CASCADE")
    day = DateField(default=date.today, null=False)
    count = IntegerField(default=0, null=False)

    class Meta:
        indexes = ((("user", "day"), True),)

    def __str__(self) -> str:
        return f"{{id={self.id} user_id={self.user_id} day={self.day} count={self.count}}}"
