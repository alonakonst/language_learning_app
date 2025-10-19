from .base import Base
from .user import User

from peewee import ForeignKeyField, TextField


class DictionaryEntry(Base):
    user = ForeignKeyField(User, backref="entries", on_delete="CASCADE")
    text = TextField(null=False)
    translation = TextField(null=True)
    notes = TextField(null=True)

    def __str__(self) -> str:
        return (
            f"{{id={self.id} user_id={self.user_id} text={self.text!r} "
            f"translation={self.translation!r} notes={self.notes!r}}}"
        )
