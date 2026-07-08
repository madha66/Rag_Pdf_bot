# PDF AI Assistant (RAG-Based PDF Bot)

An intelligent Retrieval-Augmented Generation (RAG) based PDF chatbot. This project is organized into a **React (Vite) Frontend** and a **FastAPI Python Backend**.

---

## Project Structure

```text
├── backend/                  # FastAPI Python backend
│   ├── vectorstores/         # Stored FAISS local indices (auto-generated)
│   ├── main.py               # Main API script
│   ├── requirements.txt      # Python dependencies
│   ├── schema.sql            # Database schema for MySQL
│   └── .env.example          # Environment variables template
│
└── frontend/                 # React frontend
    ├── src/
    │   ├── App.jsx           # React app interface and logic
    │   ├── App.css           # Glassmorphic layout and styling
    │   └── main.jsx          # React app entrypoint
    ├── package.json          # Node dependencies
    └── vite.config.js        # Vite configurations
```

---

## Getting Started

### 1. Database Setup (MySQL)
Make sure you have MySQL installed and running.
1. Run the script in `backend/schema.sql` to create the database and tables:
   ```sql
   source backend/schema.sql;
   ```

### 2. Backend Setup
1. Navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Create a virtual environment and activate it:
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy `.env.example` to `.env` and fill in your keys:
   * Set `GROQ_API_KEY` to your Groq Console API Key.
   * Customize the database variables (`DB_HOST`, `DB_USER`, `DB_PASSWORD`) if they differ from the default configurations.
5. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### 3. Frontend Setup
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
