from functools import wraps

import os

from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, session, g
from werkzeug.security import check_password_hash, generate_password_hash

load_dotenv()

from source import DictionaryEntry, User, database, llm_actions

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-key")


def init_database():
    if database.is_closed():
        database.connect()
    database.create_tables([User], safe=True)

    table_name = DictionaryEntry._meta.table_name
    if database.table_exists(table_name):
        existing_columns = {column.name for column in database.get_columns(table_name)}
        if "user_id" not in existing_columns:
            database.drop_tables([DictionaryEntry], safe=True)

    database.create_tables([DictionaryEntry], safe=True)


@app.teardown_appcontext
def close_database(_exc):
    if not database.is_closed():
        database.close()

init_database()


@app.before_request
def load_logged_in_user():
    user_id = session.get("user_id")
    if user_id is None:
        g.user = None
        return
    g.user = User.get_or_none(User.id == user_id)


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if g.user is None:
            return jsonify({"error": "Authentication required."}), 401
        return view(*args, **kwargs)

    return wrapped_view


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/auth/status", methods=["GET"])
def auth_status():
    if g.user is None:
        return jsonify({"authenticated": False})
    return jsonify({"authenticated": True, "username": g.user.username})


@app.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400

    if User.select().where(User.username == username).exists():
        return jsonify({"error": "Username already taken."}), 409

    password_hash = generate_password_hash(password)
    user = User.create(username=username, password_hash=password_hash)
    session["user_id"] = user.id
    return jsonify({"status": "success", "username": user.username})


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400

    user = User.get_or_none(User.username == username)
    if user is None or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid credentials."}), 401

    session["user_id"] = user.id
    return jsonify({"status": "success", "username": user.username})


@app.route("/logout", methods=["POST"])
@login_required
def logout():
    session.pop("user_id", None)
    return jsonify({"status": "success"})


@app.route("/translate", methods=["POST"])
def translate():
    data = request.get_json() or {}
    content = (data.get("text") or "").strip()
    direction = (data.get("direction") or "en-da").lower()

    if not content:
        return jsonify({"translation": "No text provided"})

    if direction == "da-en":
        translation = llm_actions.get_translation_to_english(content)
    elif direction == "en-da":
        translation = llm_actions.get_translation(content)
    else:
        return jsonify({"error": "Unsupported translation direction."}), 400

    return jsonify({"translation": translation})

@app.route("/save", methods=["POST"])
@login_required
def add_entry():
    data = request.get_json() or {}
    english_text = (data.get("english") or data.get("text") or "").strip()
    danish_text = (data.get("danish") or data.get("translation") or "").strip()
    notes = ''

    if not english_text or not danish_text:
        return jsonify({"error": "English and Danish texts are required."}), 400

    # Example: save to database
    dictionary_entry = DictionaryEntry.create(
        user=g.user,
        text=english_text,
        translation=danish_text,
        notes=notes,
    )

    return jsonify({'status': 'success', 'message': 'Entry saved successfully'})


@app.route("/entries", methods=["GET"])
@login_required
def list_entries():
    entries = [
        {
            "id": entry.id,
            "text": entry.text,
            "translation": entry.translation,
            "notes": entry.notes,
        }
        for entry in (
            DictionaryEntry.select()
            .where(DictionaryEntry.user == g.user)
            .order_by(DictionaryEntry.id.desc())
        )
    ]
    return jsonify({"entries": entries})


@app.route("/entries/<int:entry_id>", methods=["DELETE"])
@login_required
def delete_entry(entry_id: int):
    entry = DictionaryEntry.get_or_none(
        (DictionaryEntry.id == entry_id) & (DictionaryEntry.user == g.user)
    )
    if entry is None:
        return jsonify({"error": "Entry not found."}), 404

    entry.delete_instance()
    return jsonify({"status": "success"})


@app.route("/practise/ai", methods=["POST"])
@login_required
def ai_practise():
    data = request.get_json() or {}
    entry_id = data.get("entry_id")
    if not entry_id:
        return jsonify({"error": "entry_id is required."}), 400

    entry = DictionaryEntry.get_or_none(
        (DictionaryEntry.id == entry_id) & (DictionaryEntry.user == g.user)
    )
    if entry is None:
        return jsonify({"error": "Entry not found."}), 404

    target_text = (entry.text or "").strip()
    target_translation = (entry.translation or "").strip()
    if not target_text or not target_translation:
        return jsonify({"error": "The selected entry is missing a translation."}), 400

    try:
        ai_set = llm_actions.generate_ai_practise_cards(target_text, target_translation)
    except ValueError as exc:
        return jsonify({"error": str(exc) or "Unable to prepare AI practise."}), 502
    except Exception:
        app.logger.exception("Failed to generate AI practise for entry %s", entry_id)
        return jsonify({"error": "Unable to prepare AI practise."}), 500

    options = [
        {
            "id": f"entry-{entry.id}",
            "label": target_text,
            "is_correct": True,
            "metadata": {
                "translation": target_translation,
                "note": "",
                "source": "saved",
            },
        }
    ]

    for index, distractor in enumerate(ai_set["distractors"]):
        label = (distractor.get("text") or "").strip()
        if not label:
            continue
        options.append(
            {
                "id": f"distractor-{index}",
                "label": label,
                "is_correct": False,
                "metadata": {
                    "translation": (distractor.get("translation") or "").strip(),
                    "note": (distractor.get("note") or "").strip(),
                    "source": "ai",
                },
            }
        )

    if len(options) < 4:
        return jsonify({"error": "Unable to prepare enough flashcards."}), 502

    return jsonify(
        {
            "prompt": target_translation,
            "part_of_speech": ai_set["part_of_speech"],
            "target_text": target_text,
            "options": options,
        }
    )


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
