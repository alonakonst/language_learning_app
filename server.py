from flask import Flask, render_template, request, jsonify
from source import llm_actions

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


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8050, debug=True)

