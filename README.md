# PDF AI Assistant (RAG-Based PDF Bot)

An intelligent Retrieval-Augmented Generation (RAG) based PDF chatbot. This project is organized into a **React (Vite) Frontend** and a **FastAPI Python Backend**. It uses Aiven PostgreSQL for storing chat history and Hugging Face Inference API with FAISS for fast, light vector storage and retrieval.

---

## Tech Stack
* **Frontend:** React, Vite, Lucide-React
* **Backend:** FastAPI, Python, Uvicorn, LangChain, PyMuPDF
* **Large Language Model:** Llama 3 (via Groq API)
* **Embeddings Model:** `sentence-transformers/all-MiniLM-L6-v2` (via Hugging Face Inference API)
* **Relational Database:** Aiven PostgreSQL (hosted)
* **Vector Store:** FAISS (local file-based vector storage)

---

## Project Structure

```text
├── backend/                  # FastAPI Python backend
│   ├── vectorstores/         # Stored FAISS local indices (auto-generated)
│   ├── main.py               # Main API script
│   └── requirements.txt      # Python dependencies
│
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── App.jsx           # React app interface and logic
│   │   ├── App.css           # Glassmorphic layout and styling
│   │   └── main.jsx          # React app entrypoint
│   ├── package.json          # Node dependencies
│   └── vite.config.js        # Vite configurations
│
├── .gitignore                # Global git ignore configurations
├── .env                      # Global environment variables (secrets)
└── README.md                 # Project documentation
```

---

## Getting Started

### 1. Database Setup (PostgreSQL)
Ensure you have created the following tables in your PostgreSQL database (like Aiven):
```sql
-- Create chats table
CREATE TABLE IF NOT EXISTS chats (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) DEFAULT 'New Chat',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    chat_id INT NOT NULL,
    role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);
```

### 2. Environment Configuration
Create a `.env` file in the root directory (or in the `backend/` folder) with the following variables:
```env
# Groq API Key
GROQ_API_KEY=your_groq_api_key_here

# PostgreSQL database URI (Aiven connection string)
DATABASE_URL=postgres://user:password@host:port/dbname?sslmode=require

# Hugging Face Access Token (for hosted embeddings API)
HUGGINGFACEHUB_API_TOKEN=your_huggingface_access_token_here
```

### 3. Backend Setup
1. Navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Create a virtual environment and activate it:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\Activate.ps1
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### 4. Frontend Setup
1. Navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Start the React Vite development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to `http://localhost:5173`.

---

## Deployment Guide

### Frontend Deployment (Vercel)
1. Import your project repository on Vercel.
2. In the setup, set the **Root Directory** to `frontend`.
3. Add the following **Environment Variable**:
   * `VITE_API_BASE_URL` = `https://your-backend-app.onrender.com/api` (your deployed backend URL followed by `/api`).
4. Trigger a deployment.

### Backend Deployment (Render / Railway)
1. Deploy your repository on Render or Railway as a **Web Service**.
2. Set the runtime to `Python` and the build command to `pip install -r requirements.txt`.
3. Set the start command to `uvicorn main:app --host 0.0.0.0 --port $PORT`.
4. Configure the environment variables (`GROQ_API_KEY`, `DATABASE_URL`, and `HUGGINGFACEHUB_API_TOKEN`).
5. (Optional) For Render, you can attach a persistent volume disk at `/app/vectorstores` so your processed PDFs are kept permanently between server sleeps.
