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
from source.database import database  # noqa: E402


def export() -> dict:
    if database.is_closed():
        database.connect()

    return {
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
            }
            for entry in DictionaryEntry.select().order_by(DictionaryEntry.id)
        ],
    }


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
