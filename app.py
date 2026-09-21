import os
import base64
import mimetypes
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
import pypdf
from groq import Groq

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max upload
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'}
DOC_EXTENSIONS = {'.pdf', '.txt', '.md', '.py', '.js', '.html', '.css', '.json', '.csv', '.xml', '.yaml', '.yml', '.sql', '.log'}

# Prioritized list of active models on Groq
CANDIDATE_TEXT_MODELS = [
    "qwen/qwen3.8-27b",
    "groq/compound-mini",
    "allam-2-7b",
    "openai/gpt-oss-20b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant"
]

def get_groq_client():
    load_dotenv(override=True)
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key or api_key == "your_groq_api_key_here":
        return None
    return Groq(api_key=api_key)

def extract_file_content(file_path, filename):
    ext = os.path.splitext(filename)[1].lower()
    
    if ext == '.pdf':
        try:
            reader = pypdf.PdfReader(file_path)
            extracted_text = []
            for i, page in enumerate(reader.pages[:20]):
                text = page.extract_text()
                if text:
                    extracted_text.append(f"--- Page {i+1} ---\n{text}")
            full_text = "\n".join(extracted_text).strip()
            if not full_text:
                return "[PDF uploaded, but no extractable text found. It may contain scanned images.]"
            return full_text[:15000]
        except Exception as e:
            return f"[Error extracting PDF: {str(e)}]"
            
    elif ext in DOC_EXTENSIONS:
        try:
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read(15000)
            return content
        except Exception as e:
            return f"[Error reading file: {str(e)}]"
            
    return None

def encode_image_base64(file_path, filename):
    mime_type, _ = mimetypes.guess_type(filename)
    if not mime_type:
        mime_type = "image/jpeg"
    with open(file_path, "rb") as image_file:
        encoded = base64.b64encode(image_file.read()).decode('utf-8')
    return f"data:{mime_type};base64,{encoded}"

AMA_SYSTEM_PROMPT = """You are AskMeAnything (AMA), a friendly, helpful, and concise AI companion.

Guidelines:
1. Provide simple, easy-to-understand, and direct answers to the user's questions. Avoid excessive jargon, unnecessarily complex theories, or overwhelming walls of text. Keep it crisp, friendly, and practical.
2. If the user provides an image or document, analyze it clearly and give direct, simple insights tailored to their uploaded content.
3. SKILL BOOSTER (MANDATORY): At the very end of EVERY answer, you MUST provide a distinct section formatted exactly as:

### 💡 Skill Booster Tips
Provide 2-3 specific, actionable suggestions to help the user sharpen their skills, enhance their thinking, or practice further regarding the topic they asked about.
"""

def execute_completion_with_fallback(client, messages, initial_model=None):
    """
    Attempts completion with initial_model, and falls back to other candidate models
    if model_not_found or invalid_request_error occurs.
    """
    models_to_try = []
    if initial_model and initial_model not in CANDIDATE_TEXT_MODELS:
        models_to_try.append(initial_model)
    models_to_try.extend(CANDIDATE_TEXT_MODELS)

    last_error = None
    for model_name in models_to_try:
        try:
            completion = client.chat.completions.create(
                messages=messages,
                model=model_name,
                temperature=0.7,
                max_tokens=1024
            )
            content = completion.choices[0].message.content
            if content and content.strip():
                return content, model_name
        except Exception as err:
            last_error = err
            err_str = str(err).lower()
            # If rate limit or model not found, try next candidate
            if "not_found" in err_str or "does not exist" in err_str or "rate_limit" in err_str or "too large" in err_str:
                continue
            else:
                # If specific vision payload issue, propagate so caller can handle
                if "messages[" in err_str or "image" in err_str:
                    raise err
                continue

    if last_error:
        raise last_error
    raise RuntimeError("No available Groq models responded.")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/status', methods=['GET'])
def api_status():
    load_dotenv(override=True)
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    is_configured = bool(api_key and api_key != "your_groq_api_key_here")
    masked_key = ""
    if is_configured:
        masked_key = api_key[:4] + "..." + api_key[-4:] if len(api_key) > 8 else "***"
    return jsonify({
        "configured": is_configured,
        "masked_key": masked_key
    })

@app.route('/api/save_key', methods=['POST'])
def save_key():
    data = request.get_json() or {}
    new_key = data.get('groq_api_key', '').strip()
    if not new_key:
        return jsonify({"error": "API key cannot be empty"}), 400
    
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    lines = []
    found = False
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
    new_lines = []
    for line in lines:
        if line.startswith("GROQ_API_KEY="):
            new_lines.append(f"GROQ_API_KEY={new_key}\n")
            found = True
        else:
            new_lines.append(line)
            
    if not found:
        new_lines.append(f"GROQ_API_KEY={new_key}\n")
        
    with open(env_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
        
    os.environ["GROQ_API_KEY"] = new_key
    masked = new_key[:4] + "..." + new_key[-4:] if len(new_key) > 8 else "***"
    return jsonify({"success": True, "masked_key": masked})

@app.route('/api/chat', methods=['POST'])
def chat():
    client = get_groq_client()
    if not client:
        return jsonify({
            "error": "GROQ_API_KEY is not configured.",
            "guide": "Please set your Groq API Key in your `.env` file or use the Key Settings icon at the top of the screen to start chatting with AMA."
        }), 400

    user_query = request.form.get('message', '').strip()
    uploaded_file = request.files.get('file')

    if not user_query and not uploaded_file:
        return jsonify({"error": "Please provide a question or upload a file/image."}), 400

    file_info = None
    file_path = None
    is_image = False
    image_data_url = None
    doc_text = None

    if uploaded_file and uploaded_file.filename:
        filename = secure_filename(uploaded_file.filename)
        ext = os.path.splitext(filename)[1].lower()
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        uploaded_file.save(file_path)
        
        if ext in IMAGE_EXTENSIONS:
            is_image = True
            image_data_url = encode_image_base64(file_path, filename)
            file_info = {"type": "image", "filename": filename}
        elif ext in DOC_EXTENSIONS:
            doc_text = extract_file_content(file_path, filename)
            file_info = {"type": "document", "filename": filename}
        else:
            file_info = {"type": "other", "filename": filename}
            doc_text = extract_file_content(file_path, filename)

    try:
        reply_content = None
        used_model = None

        if is_image:
            text_prompt = user_query if user_query else "Please analyze this image and provide a clear, simple summary with key details."
            
            # Attempt multi-modal vision
            vision_messages = [
                {"role": "system", "content": AMA_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": text_prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": image_data_url
                            }
                        }
                    ]
                }
            ]
            
            try:
                reply_content, used_model = execute_completion_with_fallback(
                    client, vision_messages, initial_model="qwen/qwen3.8-27b"
                )
            except Exception as vision_err:
                # If image format or vision API is not supported by current tier, fallback to text context
                fallback_prompt = (
                    f"[User uploaded image: {file_info['filename']}]\n"
                    f"User question regarding the image: {text_prompt}\n\n"
                    "Note: The visual inspection service for this image format was unavailable, but please answer the user's question, offer helpful guidance on the topic or image subject, and provide your Skill Booster Tips."
                )
                text_messages = [
                    {"role": "system", "content": AMA_SYSTEM_PROMPT},
                    {"role": "user", "content": fallback_prompt}
                ]
                reply_content, used_model = execute_completion_with_fallback(
                    client, text_messages, initial_model="qwen/qwen3.8-27b"
                )

        else:
            # Standard Text or Document Analysis
            prompt_content = ""
            if doc_text:
                prompt_content += f"[Uploaded Document: {file_info['filename']}]\nFile Content:\n```\n{doc_text}\n```\n\n"
            
            if user_query:
                prompt_content += f"User Question: {user_query}"
            else:
                prompt_content += "Please provide a simple, helpful summary and key takeaways from this uploaded file."

            messages = [
                {"role": "system", "content": AMA_SYSTEM_PROMPT},
                {"role": "user", "content": prompt_content}
            ]

            reply_content, used_model = execute_completion_with_fallback(
                client, messages, initial_model="qwen/qwen3.8-27b"
            )

        return jsonify({
            "response": reply_content,
            "model": used_model,
            "file": file_info
        })

    except Exception as e:
        return jsonify({"error": f"Groq Error: {str(e)}"}), 500

    finally:
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() in ("true", "1")
    print(f"Starting AskMeAnything (AMA) server on http://127.0.0.1:{port}")
    app.run(host='0.0.0.0', port=port, debug=debug)
