# =========================
# main.py - FastAPI Backend
# =========================

import os
from pathlib import Path

import fitz  # PyMuPDF
import psycopg2
import psycopg2.extras

from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceInferenceAPIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_groq import ChatGroq
from langchain_classic.chains import RetrievalQA

load_dotenv()

# =========================
# POSTGRESQL CONFIGURATION
# =========================

database_url = os.environ.get("DATABASE_URL")

try:
    if database_url:
        conn = psycopg2.connect(
            database_url,
            cursor_factory=psycopg2.extras.RealDictCursor
        )
        cursor = conn.cursor()
    else:
        print("DATABASE_URL environment variable is missing.")
        conn = None
        cursor = None
except Exception as e:
    print(f"Error connecting to PostgreSQL database: {e}")
    conn = None
    cursor = None

# =========================
# FASTAPI
# =========================

app = FastAPI(title="PDF AI Assistant Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).parent
VECTORSTORE_DIR = BASE_DIR / "vectorstores"
VECTORSTORE_DIR.mkdir(exist_ok=True)

# =========================
# GLOBALS
# =========================

current_vectorstore = None
current_chain = None
current_chat_id = None
current_pdf_name = None

# =========================
# REQUEST MODEL
# =========================

class QuestionRequest(BaseModel):
    question: str

# =========================
# EMBEDDINGS
# =========================

embedder = HuggingFaceInferenceAPIEmbeddings(
    api_key=os.environ.get("HUGGINGFACEHUB_API_TOKEN"),
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

# =========================
# PDF FUNCTIONS
# =========================

def extract_text_from_pdf(pdf_bytes: bytes):
    doc = fitz.open(
        stream=pdf_bytes,
        filetype="pdf"
    )
    return "".join(
        page.get_text()
        for page in doc
    )

def split_text(text):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=100
    )
    return splitter.split_text(text)

def build_vectorstore(chunks):
    return FAISS.from_texts(
        chunks,
        embedding=embedder
    )

def save_vectorstore(vstore, chat_id):
    path = VECTORSTORE_DIR / f"chat_{chat_id}"
    vstore.save_local(str(path))

def load_vectorstore(chat_id):
    path = VECTORSTORE_DIR / f"chat_{chat_id}"
    if not path.exists():
        return None
    return FAISS.load_local(
        str(path),
        embedder,
        allow_dangerous_deserialization=True
    )

def get_llm():
    groq_api_key = os.environ.get("GROQ_API_KEY")
    if not groq_api_key:
        raise ValueError("GROQ_API_KEY environment variable is missing")
    return ChatGroq(
        model_name="llama-3.1-8b-instant",
        temperature=0.3,
        max_tokens=300
    )

def get_answer(vstore, query, llm):
    retriever = vstore.as_retriever(
        search_kwargs={"k": 3}
    )
    qa = RetrievalQA.from_chain_type(
        llm=llm,
        retriever=retriever,
        chain_type="stuff"
    )
    result = qa.invoke({
        "query": query
    })
    return result["result"]

# =========================
# HELPER FOR DB CONN CHECKS
# =========================

def verify_db_connection():
    global conn, cursor
    if conn is None or conn.closed != 0:
        try:
            conn = psycopg2.connect(
                database_url,
                cursor_factory=psycopg2.extras.RealDictCursor
            )
            cursor = conn.cursor()
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Database connection error: {str(e)}"
            )

# =========================
# CREATE CHAT
# =========================

@app.post("/api/new-chat")
def new_chat():
    global current_chat_id
    verify_db_connection()

    cursor.execute(
        """
        INSERT INTO chats(title)
        VALUES(%s)
        RETURNING id
        """,
        ("New Chat",)
    )
    current_chat_id = cursor.fetchone()["id"]
    conn.commit()

    return {
        "chat_id": current_chat_id
    }

# =========================
# PROCESS PDF
# =========================

@app.post("/api/process")
async def process_pdf(file: UploadFile = File(...)):
    global current_vectorstore
    global current_chain
    global current_chat_id
    global current_pdf_name

    verify_db_connection()

    if current_chat_id is None:
        raise HTTPException(
            status_code=400,
            detail="Create chat first"
        )

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDFs allowed"
        )

    pdf_bytes = await file.read()
    text = extract_text_from_pdf(pdf_bytes)

    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="No readable text"
        )

    chunks = split_text(text)
    current_vectorstore = build_vectorstore(chunks)
    save_vectorstore(
        current_vectorstore,
        current_chat_id
    )

    current_chain = get_llm()
    current_pdf_name = file.filename

    cursor.execute(
        """
        UPDATE chats
        SET title=%s
        WHERE id=%s
        """,
        (
            current_pdf_name,
            current_chat_id
        )
    )
    conn.commit()

    return {
        "success": True,
        "pdf_name": current_pdf_name,
        "chunks": len(chunks)
    }

# =========================
# LOAD CHAT VECTORSTORE
# =========================

@app.get("/api/load-chat/{chat_id}")
def load_chat(chat_id: int):
    global current_chat_id
    global current_vectorstore
    global current_chain

    verify_db_connection()

    current_chat_id = chat_id
    current_vectorstore = load_vectorstore(chat_id)

    if current_vectorstore:
        try:
            current_chain = get_llm()
        except ValueError:
            current_chain = None

    cursor.execute(
        """
        SELECT *
        FROM chats
        WHERE id=%s
        """,
        (chat_id,)
    )
    chat = cursor.fetchone()
    if chat:
        chat = dict(chat)

    return {
        "success": True,
        "chat": chat,
        "has_vectorstore": current_vectorstore is not None
    }

# =========================
# ASK QUESTION
# =========================

@app.post("/api/ask")
async def ask_question(payload: QuestionRequest):
    global current_chat_id
    global current_vectorstore
    global current_chain

    verify_db_connection()

    if current_chat_id is None:
        raise HTTPException(
            status_code=400,
            detail="No active chat"
        )

    if current_vectorstore is None:
        current_vectorstore = load_vectorstore(
            current_chat_id
        )

    if current_chain is None:
        try:
            current_chain = get_llm()
        except ValueError as e:
            raise HTTPException(
                status_code=500,
                detail=str(e)
            )

    if current_vectorstore is None:
        raise HTTPException(
            status_code=400,
            detail="Please upload PDF first"
        )

    # SAVE USER MESSAGE
    cursor.execute(
        """
        INSERT INTO messages(chat_id, role, content)
        VALUES(%s, %s, %s)
        """,
        (
            current_chat_id,
            "user",
            payload.question
        )
    )
    conn.commit()

    try:
        answer = get_answer(
            current_vectorstore,
            payload.question,
            current_chain
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating answer: {str(e)}"
        )

    if not answer.strip():
        answer = "Sorry, I could not find the answer."

    # SAVE BOT MESSAGE
    cursor.execute(
        """
        INSERT INTO messages(chat_id, role, content)
        VALUES(%s, %s, %s)
        """,
        (
            current_chat_id,
            "bot",
            answer
        )
    )
    conn.commit()

    return {
        "answer": answer
    }

# =========================
# GET CHATS
# =========================

@app.get("/api/chats")
def get_chats():
    verify_db_connection()

    cursor.execute(
        """
        SELECT *
        FROM chats
        ORDER BY created_at DESC
        """
    )
    return [dict(row) for row in cursor.fetchall()]

# =========================
# GET CHAT MESSAGES
# =========================

@app.get("/api/chat/{chat_id}")
def get_chat(chat_id: int):
    verify_db_connection()

    cursor.execute(
        """
        SELECT *
        FROM messages
        WHERE chat_id=%s
        ORDER BY created_at
        """,
        (chat_id,)
    )
    return [dict(row) for row in cursor.fetchall()]

# =========================
# DELETE CHAT
# =========================

@app.delete("/api/chat/{chat_id}")
def delete_chat(chat_id: int):
    global current_chat_id
    verify_db_connection()

    cursor.execute(
        """
        DELETE FROM chats
        WHERE id=%s
        """,
        (chat_id,)
    )
    conn.commit()

    vector_path = VECTORSTORE_DIR / f"chat_{chat_id}"
    if vector_path.exists():
        for file in vector_path.iterdir():
            file.unlink()
        vector_path.rmdir()

    if current_chat_id == chat_id:
        current_chat_id = None

    return {
        "success": True
    }

# =========================
# ROOT
# =========================

@app.get("/")
def read_root():
    return {
        "message": "Welcome to the PDF AI Assistant API. The backend is running!"
    }

# =========================
# HEALTH
# =========================

@app.get("/health")
def health():
    return {
        "status": "ok"
    }
