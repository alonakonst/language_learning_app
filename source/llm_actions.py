import json
import os
import re

from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])


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
    return _translate(content, "Translate to Danish. Give only the translation")


def get_translation_to_english(content):
    return _translate(content, "Translate to English. Give only the translation")


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
