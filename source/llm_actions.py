import os
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def _translate(content: str, instruction: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o",  # or gpt-4.1, gpt-3.5-turbo, etc.
        messages=[
            {"role": "system", "content": instruction},
            {"role": "user", "content": content},
        ],
    )
    return response.choices[0].message.content


def get_translation(content):
    return _translate(content, "Translate to Danish. Give only the translation")


def get_translation_to_english(content):
    return _translate(content, "Translate to English. Give only the translation")
