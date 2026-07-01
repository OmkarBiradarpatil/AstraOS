from flask import Flask, request, jsonify, render_template
from parcle import Parcle

app = Flask(__name__)

client = Parcle(api_key="pk_live_your_key_here")

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    user_id = data.get("user_id", "default_user")
    message = data.get("message")

    client.ingest_dialog(
        user_id=user_id,
        messages=[{"role": "user", "content": message}]
    )

    result = client.search(
        user_id=user_id,
        query=message
    )

    reply = result.answer

    client.ingest_dialog(
        user_id=user_id,
        messages=[{"role": "assistant", "content": reply}]
    )

    return jsonify({
        "reply": reply,
        "confidence": result.confidence
    })

if __name__ == "__main__":
    app.run(debug=True)
