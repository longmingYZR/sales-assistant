import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getConversation, updateConversation, deleteConversation } from '../db';
import { chatAI, ASSISTANT_SYSTEM_PROMPT, buildBusinessContext } from '../utils/ai';

const WELCOME_MESSAGE = '你好！我是需求分析助手。请告诉我你的项目需求，比如客户信息、需要的设备类型、项目背景等。我会通过几个问题帮你理清需求，然后给出具体的报价和型号建议。';

function generateTitle(text) {
  return text.slice(0, 30) + (text.length > 30 ? '...' : '');
}

export default function RequirementChat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [businessContext, setBusinessContext] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => {
    (async () => {
      const c = await getConversation(Number(id));
      if (!c) { navigate('/assistant', { replace: true }); return; }
      setConv(c);
      if (c.messages.length === 0) {
        // 新对话：显示问候语（不存入 DB）
        setMessages([{ role: 'assistant', content: WELCOME_MESSAGE, timestamp: Date.now() }]);
      } else {
        setMessages(c.messages);
      }
      // 预加载业务上下文
      buildBusinessContext().then(setBusinessContext);
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
        { role: 'user', content: q, timestamp: Date.now() },
        { role: 'assistant', content: '请先在设置页配置 AI API Key', timestamp: Date.now() },
      ]);
      setInput('');
      return;
    }

    const userMsg = { role: 'user', content: q, timestamp: Date.now() };
    const allMessages = [...messages.filter(m => m.role !== 'assistant' || m.content !== WELCOME_MESSAGE), userMsg];
    setMessages([...allMessages]);
    setInput('');
    setLoading(true);

    try {
      const providerId = localStorage.getItem('aiProvider') || 'claude';
      // 构建完整系统提示词（基础提示词 + 业务数据上下文）
      const ctx = businessContext || await buildBusinessContext();
      setBusinessContext(ctx);
      const fullSystemPrompt = ctx
        ? ASSISTANT_SYSTEM_PROMPT + '\n\n## 当前可用的业务数据\n' + ctx
        : ASSISTANT_SYSTEM_PROMPT;

      // 发送完整消息历史（不含问候语）
      const dbMessages = allMessages.filter(m => m.content !== WELCOME_MESSAGE);
      const answer = await chatAI(dbMessages, fullSystemPrompt, apiKey, providerId);

      const aiMsg = { role: 'assistant', content: answer, timestamp: Date.now() };
      const updated = [...allMessages, aiMsg];
      setMessages(updated);

      // 首次对话后更新标题
      const title = conv.title === '新需求分析' ? generateTitle(q) : conv.title;
      // 持久化到 DB（不含问候语）
      const toSave = updated.filter(m => m.content !== WELCOME_MESSAGE);
      await updateConversation(conv.id, { title, messages: toSave });
      setConv((prev) => ({ ...prev, title }));
    } catch (err) {
      const errMsg = { role: 'assistant', content: `错误：${err.message}`, timestamp: Date.now() };
      const updated = [...allMessages, errMsg];
      setMessages(updated);
      const toSave = updated.filter(m => m.content !== WELCOME_MESSAGE);
      await updateConversation(conv.id, { messages: toSave }).catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('确定删除此对话？')) return;
    await deleteConversation(conv.id);
    navigate('/assistant', { replace: true });
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
        <button className="btn btn-back" onClick={() => navigate('/assistant')}>
          ← 返回
        </button>
        <span className="chat-title">{conv?.title}</span>
        <button className="btn btn-danger btn-sm" onClick={handleDelete}>
          删除
        </button>
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble ${msg.role}`}>
            <div className="bubble-role">
              {msg.role === 'user' ? '你' : 'AI'}
            </div>
            <div className="bubble-text">{msg.content}</div>
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
          placeholder="描述你的项目需求，按 Enter 发送..."
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
