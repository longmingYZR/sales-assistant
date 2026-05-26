import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDocument } from '../db';
import { askAI } from '../utils/ai';

export default function ProductChat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const chatEndRef = useRef(null);

  useEffect(() => {
    (async () => {
      const d = await getDocument(Number(id));
      if (!d) { navigate('/products'); return; }
      setDoc(d);
      setMessages([{
        role: 'assistant',
        text: `已加载文档：${d.fileName}\n\n你可以针对此文档提问，支持中文和西班牙语。`,
      }]);
      setPageLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;

    const apiKey = localStorage.getItem('aiApiKey');
    if (!apiKey) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', text: q },
        { role: 'assistant', text: '请先在设置页配置 AI API Key' },
      ]);
      setInput('');
      return;
    }

    const userMsg = { role: 'user', text: q };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const providerId = localStorage.getItem('aiProvider') || 'claude';
      const chunks = doc.chunks.map((c) => ({
        ...c,
        fileName: doc.fileName,
      }));
      const answer = await askAI(q, chunks, apiKey, providerId);
      setMessages((prev) => [...prev, { role: 'assistant', text: answer }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `错误：${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (pageLoading) return <div className="page"><p className="loading">加载中...</p></div>;

  return (
    <div className="page chat-page">
      <div className="page-header">
        <button className="btn btn-back" onClick={() => navigate('/products')}>
          ← 返回
        </button>
        <span className="chat-title">{doc?.fileName}</span>
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble ${msg.role}`}>
            <div className="bubble-role">
              {msg.role === 'user' ? '你' : 'AI'}
            </div>
            <div className="bubble-text">{msg.text}</div>
          </div>
        ))}
        {loading && (
          <div className="chat-bubble assistant">
            <div className="bubble-role">AI</div>
            <div className="bubble-text typing">思考中...</div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="chat-input-bar">
        <textarea
          className="input chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入问题，按 Enter 发送..."
          rows={1}
          disabled={loading}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          发送
        </button>
      </div>
    </div>
  );
}
