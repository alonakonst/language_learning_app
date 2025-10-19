from flask import Flask, render_template, request, jsonify
from source import llm_actions
from source import DictionaryEntry

app = Flask(__name__)

@app.route("/")
def home():
    return render_template("index.html")



@app.route("/translate", methods=["POST"])
def translate():
    data = request.get_json()
    content = data.get("text", "")
    if not content.strip():
        return jsonify({"translation": "No text provided"})
    
    translation = llm_actions.get_translation(content)
    return jsonify({"translation": translation})

@app.route("/save", methods=["POST"])
def add_entry():
    print("Incoming JSON:", request.get_json())
    data = request.get_json()
    text = data.get('text')
    translation = data.get('translation')
    notes = ''

    # Example: save to database
    dictionary_entry = DictionaryEntry(text=text, translation=translation, notes=notes)
    dictionary_entry.save()
    print(dictionary_entry.text)
    print(dictionary_entry.translation)

    return jsonify({'status': 'success', 'message': 'Entry saved successfully'})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8050, debug=True)

