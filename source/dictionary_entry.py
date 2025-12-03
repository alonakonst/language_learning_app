"""Dictionary entries saved by users with translations and examples metadata."""
from datetime import datetime

from .base import Base
from .user import User

from peewee import BooleanField, DateTimeField, ForeignKeyField, TextField


class DictionaryEntry(Base):
    user = ForeignKeyField(User, backref="entries", on_delete="CASCADE")
    text = TextField(null=False)
    translation = TextField(null=True)
    notes = TextField(null=True)
    is_external_input = BooleanField(default=True, null=False)
    created_at = DateTimeField(default=datetime.utcnow, null=True)

    def __str__(self) -> str:
        return (
            f"{{id={self.id} user_id={self.user_id} text={self.text!r} "
            f"translation={self.translation!r} notes={self.notes!r} "
            f"created_at={self.created_at}}}"
        )
