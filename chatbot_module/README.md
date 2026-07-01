# AI Chatbot Module

A standalone, lightweight AI Chatbot feature module for AstraOS, built with Flask and a simple HTML/JS frontend, integrating Parcle API for conversational memory.

## 📁 Structure

This module is completely isolated inside the `chatbot_module/` directory:
```text
chatbot_module/
├── app.py              # Flask Backend
├── requirements.txt    # Python Dependencies
├── README.md           # Module Documentation
└── templates/
    └── index.html      # Simple Frontend UI
```

## 🚀 Features

- **Isolated Backend**: Independent Flask application (`app.py`) running on Python.
- **Interactive UI**: Simple web chat interface (`index.html`) using raw HTML and vanilla JavaScript.
- **Conversational Memory**: Powered by Parcle API, which ingests dialog history and searches context to retrieve responses.
- **Zero Impact on AstraOS Core**: Runs completely standalone without altering root files, routing, or existing configurations.

## 🛠️ Setup & Running

### 1. Install Dependencies
Make sure you have Python 3 installed. Navigate to the module directory and install the requirements:
```bash
pip install -r requirements.txt
```

### 2. Configure API Key
Open `app.py` and replace `"pk_live_your_key_here"` with your actual Parcle API Key:
```python
client = Parcle(api_key="your_actual_api_key")
```

### 3. Run the Flask App
Start the development server:
```bash
python app.py
```
By default, the server will start at `http://127.0.0.1:5000/`. Open this address in your browser to start chatting!
