from functools import wraps

import os
import random
import json
import re

from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, session, g, make_response
from werkzeug.security import check_password_hash, generate_password_hash
from google.cloud import texttospeech

load_dotenv()

from source import DictionaryEntry, User, database, llm_actions

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-key")

tts_client = None


def _get_tts_client():
    global tts_client
    if tts_client is None:
        tts_client = texttospeech.TextToSpeechClient()
    return tts_client


def init_database():
    if database.is_closed():
        database.connect()
    database.create_tables([User], safe=True)

    table_name = DictionaryEntry._meta.table_name
    if database.table_exists(table_name):
        existing_columns = {column.name for column in database.get_columns(table_name)}
        if "user_id" not in existing_columns:
            database.drop_tables([DictionaryEntry], safe=True)
        if "is_external_input" not in existing_columns:
            try:
                if database.__class__.__name__ == "SqliteDatabase":
                    database.execute_sql(
                        f'ALTER TABLE "{table_name}" ADD COLUMN "is_external_input" INTEGER NOT NULL DEFAULT 1'
                    )
                else:
                    database.execute_sql(
                        f'ALTER TABLE "{table_name}" ADD COLUMN "is_external_input" BOOLEAN NOT NULL DEFAULT TRUE'
                    )
            except Exception:
                app.logger.exception("Unable to add is_external_input column automatically.")

    database.create_tables([DictionaryEntry], safe=True)


@app.teardown_appcontext
def close_database(_exc):
    if not database.is_closed():
        database.close()

init_database()


def _load_example_from_notes(entry: DictionaryEntry):
    examples = _load_examples_from_notes(entry.notes)
    return examples[0] if examples else None


def _load_examples_from_notes(notes: str):
    try:
        data = json.loads(notes or "")
        if isinstance(data, dict):
            if isinstance(data.get("examples"), list):
                examples = []
                for item in data["examples"]:
                    if not isinstance(item, dict):
                        continue
                    danish = (item.get("danish") or item.get("example_da") or "").strip()
                    english = (item.get("english") or item.get("example_en") or "").strip()
                    if danish or english:
                        examples.append({"danish": danish, "english": english})
                if examples:
                    return _dedup_examples(examples)
            danish = (data.get("example_da") or data.get("danish") or "").strip()
            english = (data.get("example_en") or data.get("english") or "").strip()
            if danish or english:
                return _dedup_examples([{"danish": danish, "english": english}])
    except Exception:
        return []
    return []


def _save_example_to_notes(entry: DictionaryEntry, danish: str, english: str, append: bool = False, max_examples: int | None = None):
    current = [] if not append else _load_examples_from_notes(entry.notes)
    example = {"danish": danish or "", "english": english or ""}
    current.append(example)

    # Deduplicate to keep examples distinct
    unique_examples = _dedup_examples(current)

    if isinstance(max_examples, int) and max_examples > 0:
        unique_examples = unique_examples[-max_examples:]

    entry.notes = json.dumps({"examples": unique_examples})
    entry.save()


def _dedup_examples(examples):
    seen = set()
    unique = []
    for item in examples:
        danish_key = (item.get("danish") or "").strip().lower()
        english_key = (item.get("english") or "").strip().lower()
        key = (danish_key, english_key)
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def _normalize_example_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _is_duplicate_example(existing_examples, candidate) -> bool:
    if not candidate:
        return False
    cand_da = _normalize_example_text(candidate.get("danish") or "")
    cand_en = _normalize_example_text(candidate.get("english") or "")
    for ex in existing_examples or []:
        if (
            cand_da
            and cand_da == _normalize_example_text(ex.get("danish") or "")
        ) or (
            cand_en
            and cand_en == _normalize_example_text(ex.get("english") or "")
        ):
            return True
    return False


def _generate_unique_example(entry: DictionaryEntry, max_attempts: int = 3, require_unique: bool = True):
    existing = _load_examples_from_notes(entry.notes)
    avoid = [ex.get("danish") or "" for ex in existing if ex.get("danish")]

    for attempt in range(max_attempts):
        example = None
        try:
            example = llm_actions.generate_usage_example_pair(
                entry.text or "",
                entry.translation or "",
                avoid_examples=avoid,
            )
        except Exception:
            example = None

        if not example:
            continue

        if not _is_duplicate_example(existing, example):
            return example

        avoid.append(example.get("danish") or "")

    return None if require_unique else (example if example else None)

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


@app.route("/entries/<int:entry_id>/pronunciation", methods=["GET"])
@login_required
def entry_pronunciation(entry_id: int):
    entry = DictionaryEntry.get_or_none(
        (DictionaryEntry.id == entry_id) & (DictionaryEntry.user == g.user)
    )
    if entry is None:
        return jsonify({"error": "Entry not found."}), 404

    kind = (request.args.get("kind") or "").strip().lower()

    if kind == "example":
        danish_text = ""
        index_raw = request.args.get("index")
        examples = _load_examples_from_notes(entry.notes)
        if examples:
            if index_raw is not None:
                try:
                    idx = int(index_raw)
                    if 0 <= idx < len(examples):
                        danish_text = (examples[idx].get("danish") or "").strip()
                except ValueError:
                    danish_text = (examples[0].get("danish") or "").strip()
            else:
                danish_text = (examples[0].get("danish") or "").strip()
        if not danish_text:
            return jsonify({"error": "No Danish example available for this entry."}), 404
    else:
        danish_text = (entry.translation or "").strip()

    if not danish_text:
        return jsonify({"error": "No Danish text available for this entry."}), 400

    try:
        synthesis_input = texttospeech.SynthesisInput(text=danish_text)
        voice = texttospeech.VoiceSelectionParams(
            language_code="da-DK",
            ssml_gender=texttospeech.SsmlVoiceGender.FEMALE,
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3
        )
        response = _get_tts_client().synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config,
        )
        audio_content = response.audio_content
        flask_response = make_response(audio_content)
        flask_response.headers["Content-Type"] = "audio/mpeg"
        flask_response.headers["Content-Length"] = str(len(audio_content))
        flask_response.headers["Cache-Control"] = "no-store"
        return flask_response
    except Exception:
        app.logger.exception("Failed to synthesize speech for entry %s", entry_id)
        return jsonify({"error": "Pronunciation is unavailable right now."}), 502


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

    try:
        if direction == "da-en":
            translation = llm_actions.get_translation_to_english(content)
        elif direction == "en-da":
            translation = llm_actions.get_translation(content)
        else:
            return jsonify({"error": "Unsupported translation direction."}), 400
    except Exception:
        app.logger.exception("Translation failed for direction %s", direction)
        return jsonify({"error": "Translation service unavailable."}), 502

    return jsonify({"translation": translation})

@app.route("/save", methods=["POST"])
@login_required
def add_entry():
    data = request.get_json() or {}
    english_text = (data.get("english") or data.get("text") or "").strip()
    danish_text = (data.get("danish") or data.get("translation") or "").strip()
    notes = ""
    is_external_input = not bool(data.get("internal")) and not bool(data.get("is_internal"))
    if "is_external_input" in data:
        try:
            is_external_input = bool(data.get("is_external_input"))
        except Exception:
            pass

    if not english_text or not danish_text:
        return jsonify({"error": "English and Danish texts are required."}), 400

    # Example: save to database
    dictionary_entry = DictionaryEntry.create(
        user=g.user,
        text=english_text,
        translation=danish_text,
        notes=notes,
        is_external_input=is_external_input,
    )

    return jsonify({"status": "success", "message": "Entry saved successfully"})


@app.route("/entries", methods=["GET"])
@login_required
def list_entries():
    entries = [
        {
            "id": entry.id,
            "text": entry.text,
            "translation": entry.translation,
            "notes": entry.notes,
            "is_external_input": bool(getattr(entry, "is_external_input", True)),
            "example": (_load_examples_from_notes(entry.notes) or [None])[0],
            "examples": _load_examples_from_notes(entry.notes),
        }
        for entry in (
            DictionaryEntry.select()
            .where(DictionaryEntry.user == g.user)
            .order_by(DictionaryEntry.id.desc())
        )
    ]
    return jsonify({"entries": entries})


@app.route("/entries/<int:entry_id>/example", methods=["POST"])
@login_required
def entry_example(entry_id: int):
    entry = DictionaryEntry.get_or_none(
        (DictionaryEntry.id == entry_id) & (DictionaryEntry.user == g.user)
    )
    if entry is None:
        return jsonify({"error": "Entry not found."}), 404

    target_text = (entry.text or "").strip()
    target_translation = (entry.translation or "").strip()
    if not target_text or not target_translation:
        return jsonify({"error": "The entry is missing a word or translation."}), 400

    force_refresh = (request.args.get("force") or "").lower() in ("1", "true", "yes", "refresh")
    append = (request.args.get("append") or "").lower() in ("1", "true", "yes", "append")

    if not force_refresh and not append:
        cached = _load_example_from_notes(entry)
        if cached:
            return jsonify({"example": cached, "examples": _load_examples_from_notes(entry.notes)})

    try:
        example = _generate_unique_example(entry, require_unique=False)
    except ValueError as exc:
        return jsonify({"error": str(exc) or "Unable to generate an example."}), 400
    except Exception:
        app.logger.exception("Failed to generate usage example for entry %s", entry_id)
        return jsonify({"error": "Unable to generate an example right now."}), 502

    if not example or not (example.get("danish") or example.get("english")):
        return jsonify({"error": "No example was generated."}), 502

    _save_example_to_notes(
        entry,
        example.get("danish") or "",
        example.get("english") or "",
        append=append,
    )

    examples = _load_examples_from_notes(entry.notes)

    return jsonify({"example": example, "examples": examples})


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


@app.route("/entries/<int:entry_id>/examples/<int:example_index>", methods=["DELETE"])
@login_required
def delete_entry_example(entry_id: int, example_index: int):
    entry = DictionaryEntry.get_or_none(
        (DictionaryEntry.id == entry_id) & (DictionaryEntry.user == g.user)
    )
    if entry is None:
        return jsonify({"error": "Entry not found."}), 404

    examples = _load_examples_from_notes(entry.notes)
    if example_index < 0 or example_index >= len(examples):
        return jsonify({"error": "Example not found."}), 404

    del examples[example_index]
    entry.notes = json.dumps({"examples": examples})
    entry.save()

    return jsonify({"status": "success", "examples": examples})


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


def _mask_example_sentence(example: str, target: str) -> str:
    example = (example or "").strip()
    target = (target or "").strip()
    if not example:
        return ""
    if not target:
        return example
    pattern = re.compile(re.escape(target), re.IGNORECASE)
    if pattern.search(example):
        return pattern.sub("_____", example, count=1)
    return f"_____ {example}"


@app.route("/practise/cloze", methods=["POST"])
@login_required
def practise_cloze():
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

    examples = _load_examples_from_notes(entry.notes)

    # Always try to generate a fresh, non-repeating example
    example = None
    try:
        example = _generate_unique_example(entry, require_unique=True)
    except Exception:
        app.logger.exception("Failed to generate example for cloze practise %s", entry_id)
        example = None

    # If generation failed, fall back to any cached example just to keep flow alive
    if not example and examples:
        example = random.choice(examples)

    if example and not _is_duplicate_example(examples, example):
        examples.append(example)
        _save_example_to_notes(
            entry,
            example.get("danish") or "",
            example.get("english") or "",
            append=True,
            max_examples=5,
        )

    if not example:
        return jsonify({"error": "Unable to create a sentence right now."}), 502

    danish_example = (example.get("danish") or "").strip()
    cloze_prompt = _mask_example_sentence(danish_example, target_translation)
    if not cloze_prompt:
        return jsonify({"error": "Unable to prepare a sentence."}), 502

    return jsonify(
        {
            "prompt": cloze_prompt,
            "answer": target_translation,
            "hint_en": target_text,
        }
    )


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
