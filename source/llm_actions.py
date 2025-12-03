"""LLM-backed helpers for translation, flashcard distractors, and example generation."""
import json
import os
import re
from pathlib import Path

from google.cloud import translate_v2 as translate
from google.oauth2 import service_account
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
_translate_client = None
GOOGLE_PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "inlaid-antler-478921-f3")


def _chat(messages):
    response = client.chat.completions.create(
        model="gpt-4o",
        temperature=0.4,
        messages=messages,
    )
    return response.choices[0].message.content or ""


def _translate(content: str, instruction: str) -> str:
    return _chat(
        [
            {"role": "system", "content": instruction},
            {"role": "user", "content": content},
        ]
    )


def get_translation(content):
    return translate_google(content, "da")


def get_translation_to_english(content):
    return translate_google(content, "en")


def _load_google_credentials():
    """
    Load Google credentials from either JSON text, a file path, or a bundled key file.

    Priority:
    1) GOOGLE_APPLICATION_CREDENTIALS_JSON (service account JSON string)
    2) GOOGLE_APPLICATION_CREDENTIALS (path to JSON file)
    3) project-local my-key.json (for Render deployments without env configuration)
    """
    json_blob = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if json_blob:
        try:
            info = json.loads(json_blob)
            return service_account.Credentials.from_service_account_info(info)
        except Exception as exc:
            raise RuntimeError("Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON value.") from exc

    path_str = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if path_str:
        cred_path = Path(path_str)
        if not cred_path.exists():
            raise RuntimeError(f"Google credentials file not found at {cred_path}.")
        try:
            return service_account.Credentials.from_service_account_file(str(cred_path))
        except Exception as exc:
            raise RuntimeError(f"Failed to load Google credentials from {cred_path}.") from exc

    bundled_path = Path(__file__).resolve().parent.parent / "my-key.json"
    if bundled_path.exists():
        try:
            return service_account.Credentials.from_service_account_file(str(bundled_path))
        except Exception:
            return None

    return None


def _get_translate_client():
    global _translate_client
    if _translate_client is None:
        credentials = _load_google_credentials()
        if credentials is None:
            return None
        _translate_client = translate.Client(credentials=credentials)
    return _translate_client


def _llm_translation_instruction(target_language: str) -> str:
    target = (target_language or "").lower()
    if target == "da":
        return (
            "Translate the following English text into natural Danish. "
            "Respond with Danish only and keep punctuation consistent."
        )
    if target == "en":
        return (
            "Translate the following Danish text into natural English. "
            "Respond with English only and keep punctuation consistent."
        )
    return f"Translate the following text into {target or 'the target language'}. Respond with the translation only."


def translate_google(content: str, target_language: str) -> str:
    trimmed = (content or "").strip()
    if not trimmed:
        return ""

    client = _get_translate_client()
    translate_error = None

    if client is not None:
        try:
            result = client.translate(
                trimmed, target_language=target_language, format_="text"
            )
            translated = (result.get("translatedText") or "").strip()
            if translated:
                return translated
            raise RuntimeError("Translation service returned an empty result.")
        except Exception as exc:  # pragma: no cover - external API failure
            translate_error = exc

    # Fall back to the LLM if Google Translate is unavailable or misconfigured.
    try:
        translated_llm = _translate(trimmed, _llm_translation_instruction(target_language)).strip()
        if not translated_llm:
            raise RuntimeError("Translation service returned an empty result.")
        return translated_llm
    except Exception as exc:  # pragma: no cover - external API failure
        raise RuntimeError("Translation service unavailable.") from translate_error or exc


def _extract_json_object(raw_text: str):
    """Extract the first JSON object from a model response."""
    if not raw_text:
        raise ValueError("The language model returned an empty response.")

    trimmed = raw_text.strip()
    if trimmed.startswith("```"):
        trimmed = re.sub(r"^```(?:json)?", "", trimmed, count=1, flags=re.IGNORECASE).rsplit(
            "```", 1
        )[0]

    try:
        return json.loads(trimmed)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", trimmed, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


def generate_ai_practise_cards(target_text: str, target_translation: str):
    """
    Ask the LLM for three new words or phrases that match the part-of-speech
    profile of the provided entry.
    """

    system_prompt = (
        "You are a careful language tutor helping English speakers learn Danish words. "
        "Given an English target word/phrase and its Danish translation, "
        "produce JSON describing the target's part of speech and three fresh distractor "
        "words in English that share the same part of speech. "
        "Each distractor must have a distinct meaning (not a synonym or semantically related term),"
        "be of similar language level and naturalness, and not share a clear thematic or emotional association with the target."
        "If the target is a multi-word phrase, each distractor should contain the same "
        "number of words (±1) and feel like a natural expression of similar length."
    )

    user_prompt = (
        "TARGET_ENGLISH: {target}\n"
        "TARGET_DANISH: {translation}\n\n"
        "Return JSON with the shape:\n"
        '{{"part_of_speech": "noun|verb|adjective|phrase|expression|other", '
        '"distractors": [{{"text": "...", "translation": "...", "note": "short description"}}] }}\n'
        "- Provide exactly three distractors.\n"
        "- Distractor texts must be different from the target and from each other.\n"
        "- Distractors must be natural English words/phrases a learner might encounter.\n"
        "- Keep the translation concise Danish and the note within 12 words.\n"
        "- Respond with JSON only."
    ).format(target=target_text.strip(), translation=target_translation.strip())

    response_text = _chat(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
    )

    try:
        data = _extract_json_object(response_text)
    except json.JSONDecodeError as exc:
        raise ValueError("The AI response could not be parsed.") from exc

    raw_distractors = data.get("distractors") or []
    distractors = []
    for item in raw_distractors:
        text = (item.get("text") or "").strip()
        if not text:
            continue
        distractors.append(
            {
                "text": text,
                "translation": (item.get("translation") or "").strip(),
                "note": (item.get("note") or "").strip(),
            }
        )

    if len(distractors) < 3:
        raise ValueError("The AI response did not include enough distractors.")

    return {
        "part_of_speech": (data.get("part_of_speech") or "word").strip().lower(),
        "distractors": distractors[:3],
    }


def generate_usage_example(target_text: str, target_translation: str, extra_instruction: str = "") -> str:
    """
    Return a medium-length Danish sentence or brief two-line dialogue that uses the
    target Danish word or phrase naturally with the same meaning as the provided English.
    """

    target_clean = (target_text or "").strip()
    translation_clean = (target_translation or "").strip()
    if not target_clean or not translation_clean:
        raise ValueError("The entry needs both English and Danish to build an example.")

    system_prompt = (
        "You are a concise Danish language tutor. Provide only one natural example in Danish "
        "that uses the target Danish word/phrase at least once exactly as provided and preserves "
        "the meaning of the supplied English translation (do not substitute a different sense; keep the same meaning). "
        "Keep it under 35 words. "
        "You may use a short two-line dialogue if it feels natural. "
        "Do not prepend explanations or quotes. Output Danish only."
    )
    if extra_instruction:
        system_prompt += " " + extra_instruction.strip()

    user_prompt = (
        "TARGET (EN): {target}\n"
        "TARGET (DA): {translation}\n\n"
        "Write a single Danish example (sentence or very short dialogue) that naturally includes "
        "the Danish target exactly as provided. Keep the tone everyday and concise."
    ).format(target=target_clean, translation=translation_clean)

    return _chat(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
    ).strip()


def translate_example_to_english(example_danish: str) -> str:
    """Translate a Danish example sentence/dialogue into English using ChatGPT."""
    clean = (example_danish or "").strip()
    if not clean:
        return ""

    translation_prompt = (
        "You are a precise translator. Convert the Danish example into natural English. "
        "Keep the meaning and tone, and avoid adding explanations."
    )

    return _chat(
        [
            {"role": "system", "content": translation_prompt},
            {"role": "user", "content": clean},
        ]
    ).strip()


def generate_usage_example_pair(target_text: str, target_translation: str, avoid_examples=None) -> dict:
    """Generate a Danish example and its English translation."""
    avoid_list = [ex for ex in avoid_examples or [] if ex]
    extra_instruction = ""
    if avoid_list:
        avoid_block = "; ".join(avoid_list[:10])
        extra_instruction = f"Do NOT repeat or paraphrase any of these prior Danish examples: {avoid_block}."

    example_da = generate_usage_example(
        target_text,
        target_translation,
        extra_instruction=extra_instruction,
    )
    example_en = translate_example_to_english(example_da)
    return {"danish": example_da, "english": example_en}
