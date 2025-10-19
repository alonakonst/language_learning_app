from functools import wraps

import os

from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, session, g
from werkzeug.security import check_password_hash, generate_password_hash

from source import DictionaryEntry, User, database, llm_actions

load_dotenv()

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
    data = request.get_json()
    content = data.get("text", "")
    if not content.strip():
        return jsonify({"translation": "No text provided"})
    
    translation = llm_actions.get_translation(content)
    return jsonify({"translation": translation})

@app.route("/save", methods=["POST"])
@login_required
def add_entry():
    data = request.get_json()
    text = data.get('text')
    translation = data.get('translation')
    notes = ''

    # Example: save to database
    dictionary_entry = DictionaryEntry.create(
        user=g.user,
        text=text,
        translation=translation,
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


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
