import os
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def get_translation(content):
    response = client.chat.completions.create(
        model="gpt-4o",  # or gpt-4.1, gpt-3.5-turbo, etc.
        messages=[
            {"role": "system", "content": "Translate to Danish. Give only the translation"},
            {"role": "user", "content": content}
        ]
    )
    return response.choices[0].message.content
