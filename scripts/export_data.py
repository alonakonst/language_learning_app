import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

#python scripts/export_data.py -o export.json 

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv

env_path = PROJECT_ROOT / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()

from source.user import User  # noqa: E402
from source.dictionary_entry import DictionaryEntry  # noqa: E402
from source.exercise_log import ExerciseLog  # noqa: E402
from source.database import database  # noqa: E402


def export() -> dict:
    if database.is_closed():
        database.connect()

    data = {
        "users": [
            {
                "id": user.id,
                "username": user.username,
                "password_hash": user.password_hash,
            }
            for user in User.select().order_by(User.id)
        ],
        "entries": [
            {
                "id": entry.id,
                "user_id": entry.user_id,
                "text": entry.text,
                "translation": entry.translation,
                "notes": entry.notes,
                "is_external_input": bool(getattr(entry, "is_external_input", True)),
                "created_at": (
                    entry.created_at.isoformat() if getattr(entry, "created_at", None) else None
                ),
            }
            for entry in DictionaryEntry.select().order_by(DictionaryEntry.id)
        ],
        "exercise_logs": [
            {
                "id": log.id,
                "user_id": log.user_id,
                "created_at": (
                    log.created_at.isoformat() if getattr(log, "created_at", None) else None
                ),
            }
            for log in ExerciseLog.select().order_by(ExerciseLog.id)
        ],
    }

    # Add daily aggregates for convenience if exercise logs exist.
    if data["exercise_logs"]:
        aggregates = {}
        for log in data["exercise_logs"]:
            date_str = (log.get("created_at") or "")[:10]
            user_id = log.get("user_id")
            if not date_str or user_id is None:
                continue
            key = (user_id, date_str)
            aggregates[key] = aggregates.get(key, 0) + 1
        data["exercise_logs_daily"] = [
            {"user_id": user_id, "date": date_str, "count": count}
            for (user_id, date_str), count in sorted(aggregates.items())
        ]

    return data


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export users and dictionary entries as JSON."
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Optional output file path. Prints to stdout when omitted.",
    )
    parser.add_argument(
        "--indent",
        type=int,
        default=2,
        help="Pretty-print JSON with this indentation (default: 2).",
    )
    args = parser.parse_args()

    data = export()
    payload = json.dumps(data, indent=args.indent)

    if args.output:
        args.output.write_text(payload, encoding="utf-8")
    else:
        sys.stdout.write(payload + "\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
