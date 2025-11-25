import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

from peewee import PostgresqlDatabase, fn

PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv  # noqa: E402

env_path = PROJECT_ROOT / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()

from source.user import User  # noqa: E402
from source.dictionary_entry import DictionaryEntry  # noqa: E402
from source.daily_exercise_total import DailyExerciseTotal  # noqa: E402
from source.database import database  # noqa: E402


def reset_sequence(model) -> None:
    """Ensure Postgres sequences are aligned after manual ID inserts."""
    if not isinstance(database, PostgresqlDatabase):
        return

    table_name = model._meta.table_name
    pk_field = model._meta.primary_key
    max_id = model.select(fn.MAX(pk_field)).scalar() or 0
    sequence_name = f"{table_name}_{pk_field.name}_seq"
    database.execute_sql(
        "SELECT setval(%s, %s, %s)",
        (sequence_name, max_id + 1, bool(max_id)),
    )


def import_data(payload: Dict[str, Any]) -> Dict[str, int]:
    users: List[Dict[str, Any]] = payload.get("users", [])
    entries: List[Dict[str, Any]] = payload.get("entries", [])
    daily_exercise_totals: List[Dict[str, Any]] = payload.get("daily_exercise_totals", [])

    # Backwards compatibility: derive daily totals from legacy keys when needed.
    if not daily_exercise_totals:
        exercise_logs_daily: List[Dict[str, Any]] = payload.get("exercise_logs_daily", [])
        exercise_logs: List[Dict[str, Any]] = payload.get("exercise_logs", [])

        if exercise_logs_daily:
            daily_exercise_totals = [
                {
                    "user_id": item.get("user_id"),
                    "day": (item.get("date") or "").strip(),
                    "count": int(item.get("count") or 0),
                }
                for item in exercise_logs_daily
                if item.get("user_id") is not None and (item.get("date") or "").strip()
            ]
        elif exercise_logs:
            aggregates: Dict[tuple, int] = {}
            for log in exercise_logs:
                date_str = (log.get("created_at") or "")[:10]
                user_id = log.get("user_id")
                if not date_str or user_id is None:
                    continue
                key = (user_id, date_str)
                aggregates[key] = aggregates.get(key, 0) + 1
            daily_exercise_totals = [
                {"user_id": user_id, "day": date_str, "count": count}
                for (user_id, date_str), count in aggregates.items()
            ]

    if database.is_closed():
        database.connect()

    with database.atomic():
        DailyExerciseTotal.delete().execute()
        DictionaryEntry.delete().execute()
        User.delete().execute()

        if users:
            User.insert_many(users).execute()
        if entries:
            DictionaryEntry.insert_many(entries).execute()
        if daily_exercise_totals:
            DailyExerciseTotal.insert_many(daily_exercise_totals).execute()

        reset_sequence(User)
        reset_sequence(DictionaryEntry)
        reset_sequence(DailyExerciseTotal)

    return {
        "users": len(users),
        "entries": len(entries),
        "daily_exercise_totals": len(daily_exercise_totals),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Replace all users and entries with data from a JSON export."
    )
    parser.add_argument(
        "json_path",
        type=Path,
        help="Path to export JSON (e.g. export.json).",
    )
    args = parser.parse_args()

    payload = json.loads(args.json_path.read_text(encoding="utf-8"))
    result = import_data(payload)

    sys.stdout.write(
        f"Imported {result['users']} users and {result['entries']} entries from "
        f"{args.json_path}\n"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
