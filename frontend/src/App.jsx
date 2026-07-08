import React, { useState, useEffect, useRef } from 'react';
import { Plus, Send, X, FileText, Loader2, Bot, User } from 'lucide-react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

function App() {
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [pdfName, setPdfName] = useState('No PDF Uploaded');
  const [pdfStatus, setPdfStatus] = useState('Waiting for file...');
  const [statusBadge, setStatusBadge] = useState('Not Ready');
  const [questionInput, setQuestionInput] = useState('');
  const [ready, setReady] = useState(false);
  
  // Loading states
  const [loadingChats, setLoadingChats] = useState(false);
  const [processingPdf, setProcessingPdf] = useState(false);
  const [sendingQuestion, setSendingQuestion] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-scroll to the bottom of the chat area
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sendingQuestion]);

  // Load chat histories on mount
  useEffect(() => {
    fetchChats();
  }, []);

  // Fetch all chats
  const fetchChats = async () => {
    setLoadingChats(true);
    try {
      const res = await fetch(`${API_BASE}/chats`);
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } catch (err) {
      console.error('Error fetching chats:', err);
    } finally {
      setLoadingChats(false);
    }
  };

  // Create a new chat session
  const createChat = async () => {
    try {
      const res = await fetch(`${API_BASE}/new-chat`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCurrentChatId(data.chat_id);
        
        // Reset states for new chat
        setMessages([]);
        setReady(false);
        setSelectedFile(null);
        setPdfName('No PDF Uploaded');
        setPdfStatus('Waiting for file...');
        setStatusBadge('Not Ready');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        
        await fetchChats();
      }
    } catch (err) {
      console.error('Error creating chat:', err);
      alert('Failed to create new chat. Make sure the backend is running.');
    }
  };

  // Load a chat and its messages
  const loadChat = async (chatId) => {
    setCurrentChatId(chatId);
    setLoadingMessages(true);
    setStatusBadge('Loading...');
    try {
      // 1. Tell backend to load vectorstore for this chat
      const loadRes = await fetch(`${API_BASE}/load-chat/${chatId}`);
      let hasVector = false;
      let chatTitle = 'Chat';

      if (loadRes.ok) {
        const loadData = await loadRes.json();
        hasVector = loadData.has_vectorstore;
        chatTitle = loadData.chat?.title || 'Chat';
        
        setReady(hasVector);
        setStatusBadge(hasVector ? 'Ready' : 'Not Ready');
        
        if (hasVector) {
          setPdfName(chatTitle);
          setPdfStatus('Vectorstore Loaded');
        } else {
          setPdfName('No PDF Uploaded');
          setPdfStatus('Waiting for file...');
        }
      }

      // 2. Fetch message history
      const msgRes = await fetch(`${API_BASE}/chat/${chatId}`);
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        setMessages(msgData);
      }
    } catch (err) {
      console.error('Error loading chat:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Delete a chat session
  const deleteChat = async (e, chatId) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat?')) return;

    try {
      const res = await fetch(`${API_BASE}/chat/${chatId}`, { method: 'DELETE' });
      if (res.ok) {
        if (currentChatId === chatId) {
          setCurrentChatId(null);
          setMessages([]);
          setReady(false);
          setSelectedFile(null);
          setPdfName('No PDF Uploaded');
          setPdfStatus('Waiting for file...');
          setStatusBadge('Not Ready');
        }
        await fetchChats();
      }
    } catch (err) {
      console.error('Error deleting chat:', err);
    }
  };

  // Handle PDF file selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        alert('Please select a PDF file only.');
        return;
      }
      setSelectedFile(file);
      setPdfName(file.name);
      setPdfStatus(`${(file.size / 1024 / 1024).toFixed(2)} MB`);
    }
  };

  // Upload and process selected PDF
  const processPdf = async () => {
    if (!selectedFile) {
      alert('Please select a PDF file first.');
      return;
    }

    let activeChatId = currentChatId;
    
    // If no active chat, automatically create one first
    if (!activeChatId) {
      try {
        const res = await fetch(`${API_BASE}/new-chat`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          activeChatId = data.chat_id;
          setCurrentChatId(activeChatId);
        } else {
          alert('Could not initialize chat session.');
          return;
        }
      } catch (err) {
        console.error('Error initializing chat:', err);
        alert('Could not connect to backend server.');
        return;
      }
    }

    setProcessingPdf(true);
    setStatusBadge('Processing PDF...');
    
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch(`${API_BASE}/process`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setReady(true);
        setStatusBadge('Ready');
        setPdfStatus('Processed successfully');
        
        // Add processing notification message locally
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setMessages(prev => [
          ...prev,
          {
            id: 'system-' + Date.now(),
            role: 'bot',
            content: `PDF processed successfully: ${data.pdf_name} (${data.chunks} text chunks generated).`,
            created_at: timestamp
          }
        ]);
        
        await fetchChats();
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.detail || 'Failed to process PDF'}`);
        setStatusBadge('Not Ready');
      }
    } catch (err) {
      console.error('Error processing PDF:', err);
      alert('Error connecting to processing service.');
      setStatusBadge('Not Ready');
    } finally {
      setProcessingPdf(false);
    }
  };

  // Submit question to LLM
  const handleAskQuestion = async (e) => {
    e.preventDefault();
    const query = questionInput.trim();
    if (!query || !ready || sendingQuestion || !currentChatId) return;

    setQuestionInput('');
    setSendingQuestion(true);

    const userTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Optimistically add user message to list
    const tempUserMsg = {
      id: 'temp-user-' + Date.now(),
      role: 'user',
      content: query,
      created_at: userTime
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query })
      });

      if (res.ok) {
        const data = await res.json();
        const botTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        setMessages(prev => [
          ...prev,
          {
            id: 'bot-' + Date.now(),
            role: 'bot',
            content: data.answer,
            created_at: botTime
          }
        ]);
        
        await fetchChats();
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.detail || 'Could not get answer'}`);
      }
    } catch (err) {
      console.error('Error querying PDF:', err);
      alert('Failed to connect to AI answering service.');
    } finally {
      setSendingQuestion(false);
    }
  };

  // Helper format time
  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    try {
      // Check if it's already a formatted string like HH:MM AM/PM
      if (timeStr.includes(':')) {
        return timeStr.slice(0, 5) + (timeStr.toLowerCase().includes('m') ? timeStr.slice(-3) : '');
      }
      const date = new Date(timeStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return timeStr;
    }
  };

  return (
    <div className="app-container">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo-box">🤖</div>
          <div>
            <h1>PDF AI</h1>
            <p>Smart Document Assistant</p>
          </div>
        </div>

        <button className="new-chat-btn" onClick={createChat}>
          <Plus size={20} />
          New Chat
        </button>

        {/* PDF CARD */}
        <div className="pdf-card">
          <div className="pdf-top">
            <div className="pdf-icon">
              <FileText size={24} />
            </div>
            <div className="pdf-meta">
              <h3 title={pdfName}>{pdfName}</h3>
              <p>{pdfStatus}</p>
            </div>
          </div>

          <label htmlFor="pdfUpload" className="upload-btn">
            Choose PDF
          </label>
          <input
            type="file"
            id="pdfUpload"
            ref={fileInputRef}
            onChange={handleFileChange}
            hidden
            accept=".pdf"
          />

          <button
            onClick={processPdf}
            className="process-btn"
            disabled={processingPdf || !selectedFile}
          >
            {processingPdf ? (
              <span className="flex-center">
                <Loader2 size={16} className="spin animate-loader" /> Processing...
              </span>
            ) : (
              'Process PDF'
            )}
          </button>
        </div>

        {/* HISTORY SECTION */}
        <div className="history-section">
          <div className="history-header">
            <div className="history-title">Recent Chats</div>
          </div>

          <div className="history-list">
            {loadingChats && chats.length === 0 ? (
              <div className="loading-state">
                <Loader2 size={20} className="spin" />
              </div>
            ) : chats.length === 0 ? (
              <div className="empty-state">No recent chats</div>
            ) : (
              chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`history-item ${currentChatId === chat.id ? 'active' : ''}`}
                  onClick={() => loadChat(chat.id)}
                >
                  <div className="history-chat-info">
                    <span className="chat-name" title={chat.title}>
                      {chat.title || 'Untitled Chat'}
                    </span>
                  </div>
                  <button
                    className="delete-chat-btn"
                    onClick={(e) => deleteChat(e, chat.id)}
                    title="Delete Chat"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-footer">Powered by LangChain + Groq</div>
      </aside>

      {/* MAIN CHAT AREA */}
      <main className="main-chat">
        <header className="topbar">
          <div>
            <h2>AI PDF Assistant</h2>
            <p>Upload a document and start chatting intelligently</p>
          </div>
          <div className={`status-badge ${ready ? 'ready' : ''}`}>{statusBadge}</div>
        </header>

        <section className="chat-area">
          {loadingMessages ? (
            <div className="chat-loading-state">
              <Loader2 size={36} className="spin text-accent" />
              <p>Loading messages...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="welcome-container">
              <div className="welcome-box">
                <h2>Welcome to PDF AI</h2>
                <p>
                  Upload a PDF using the sidebar control and ask questions naturally.
                  Your AI assistant will analyze the document instantly.
                </p>
              </div>
            </div>
          ) : (
            <div className="messages-container">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`message-wrapper ${isUser ? 'user-wrapper' : 'bot-wrapper'}`}
                  >
                    {!isUser && (
                      <div className="avatar bot-avatar">
                        <Bot size={20} />
                      </div>
                    )}
                    <div className={`message ${isUser ? 'user-message' : 'bot-message'}`}>
                      <div className="message-content">{msg.content}</div>
                      <div className="timestamp">{formatTime(msg.created_at)}</div>
                    </div>
                    {isUser && (
                      <div className="avatar user-avatar">
                        <User size={20} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Typing Indicator */}
          {sendingQuestion && (
            <div className="message-wrapper bot-wrapper">
              <div className="avatar bot-avatar">
                <Bot size={20} />
              </div>
              <div className="message bot-message">
                <div className="typing">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </section>

        {/* INPUT FORM */}
        <form className="chat-input-wrapper" onSubmit={handleAskQuestion}>
          <input
            type="text"
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            placeholder={ready ? "Ask anything from your PDF..." : "Please upload a PDF first to ask questions"}
            autoComplete="off"
            disabled={!ready || sendingQuestion}
          />
          <button type="submit" disabled={!ready || sendingQuestion || !questionInput.trim()}>
            <Send size={18} />
          </button>
        </form>
      </main>
    </div>
  );
}

export default App;
