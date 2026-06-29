import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getConversation, updateConversation, deleteConversation, addCustomer } from '../db';
import { chatAI, ASSISTANT_SYSTEM_PROMPT, buildBusinessContext } from '../utils/ai';
import { extractCustomerInfo } from '../utils/analysis';

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
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
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

  const handleExtract = async () => {
    const apiKey = localStorage.getItem('aiApiKey');
    if (!apiKey) {
      alert('请先在设置页配置 AI API Key');
      return;
    }

    const dbMessages = messages.filter(
      (m) => m.content !== WELCOME_MESSAGE && m.role === 'user'
    );
    if (dbMessages.length < 2) {
      alert('对话消息太少，请先进行几轮需求沟通后再提取');
      return;
    }

    setExtracting(true);
    setExtractError('');
    try {
      const providerId = localStorage.getItem('aiProvider') || 'claude';
      const data = await extractCustomerInfo(
        messages.filter((m) => m.content !== WELCOME_MESSAGE),
        apiKey,
        providerId
      );
      setExtractedData(data);
      setShowExtractModal(true);
    } catch (err) {
      setExtractError(err.message || '提取失败，请重试');
    } finally {
      setExtracting(false);
    }
  };

  const handleCreateFromExtract = async () => {
    if (!extractedData) return;
    try {
      const newId = await addCustomer({
        companyName: extractedData.companyName || '未命名客户',
        contactName: extractedData.contactName,
        country: extractedData.country || '墨西哥',
        needs: extractedData.needs,
        stage: extractedData.stage,
        amount: extractedData.amount,
        priority: extractedData.priority,
        qualBudget: extractedData.qualBudget,
        qualAuthority: extractedData.qualAuthority,
        qualNeed: extractedData.qualNeed,
        qualTimeline: extractedData.qualTimeline,
        status: '有效',
        opportunityId: '',
      });

      // Backlink: associate conversation with customer
      await updateConversation(conv.id, { customerId: newId }).catch(() => {});

      setShowExtractModal(false);
      navigate(`/customers/${newId}`);
    } catch (err) {
      alert('创建客户失败：' + (err.message || '未知错误'));
    }
  };

  const updateExtractedField = (field, value) => {
    setExtractedData((prev) => ({ ...prev, [field]: value }));
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
        <button
          className="btn btn-primary btn-sm"
          onClick={handleExtract}
          disabled={extracting || messages.filter(m => m.role === 'user').length < 2}
          style={{ whiteSpace: 'nowrap' }}
        >
          {extracting ? '提取中...' : '📋 提取客户信息'}
        </button>
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

      {/* Extraction Modal */}
      {showExtractModal && extractedData && (
        <div className="modal-overlay" onClick={() => setShowExtractModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">提取的客户信息</span>
              <button
                className="btn btn-back"
                onClick={() => setShowExtractModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <p className="hint" style={{ marginBottom: 12 }}>
                AI 从对话中提取的客户信息，请审核并修改：
              </p>

              <div className="form">
                <label className="form-label">公司名</label>
                <input
                  className="input"
                  value={extractedData.companyName}
                  onChange={(e) => updateExtractedField('companyName', e.target.value)}
                  placeholder="公司名称"
                />

                <label className="form-label">联系人</label>
                <input
                  className="input"
                  value={extractedData.contactName}
                  onChange={(e) => updateExtractedField('contactName', e.target.value)}
                  placeholder="联系人姓名"
                />

                <label className="form-label">国家</label>
                <select
                  className="select"
                  value={extractedData.country || '墨西哥'}
                  onChange={(e) => updateExtractedField('country', e.target.value)}
                >
                  <option value="">未识别</option>
                  {['墨西哥', '巴西', '阿根廷', '哥伦比亚', '智利', '秘鲁',
                    '厄瓜多尔', '多米尼加', '危地马拉', '巴拿马', '哥斯达黎加',
                    '乌拉圭', '巴拉圭', '玻利维亚', '洪都拉斯', '萨尔瓦多', '尼加拉瓜',
                    '美国', '加拿大', '巴巴多斯',
                  ].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <label className="form-label">销售阶段</label>
                <select
                  className="select"
                  value={extractedData.stage}
                  onChange={(e) => updateExtractedField('stage', e.target.value)}
                >
                  {['初接触', '需求确认', '报价中', '谈判中'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <label className="form-label">商机金额 (USD)</label>
                <input
                  className="input"
                  type="number"
                  value={extractedData.amount || ''}
                  onChange={(e) => updateExtractedField('amount', parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  min="0"
                  step="any"
                />

                <label className="form-label">客户级别</label>
                <select
                  className="select"
                  value={extractedData.priority}
                  onChange={(e) => updateExtractedField('priority', e.target.value)}
                >
                  <option value="普通">普通</option>
                  <option value="重点">重点</option>
                </select>

                <label className="form-label">需求描述</label>
                <textarea
                  className="input textarea"
                  value={extractedData.needs}
                  onChange={(e) => updateExtractedField('needs', e.target.value)}
                  placeholder="客户需求..."
                  rows={3}
                />

                <label className="form-label" style={{ marginTop: 8 }}>资格评估 (BANT)</label>
                <div className="qual-list" style={{ marginTop: 4 }}>
                  {[
                    { key: 'qualBudget', label: '预算明确？' },
                    { key: 'qualAuthority', label: '决策人已接触？' },
                    { key: 'qualNeed', label: '需求真实？' },
                    { key: 'qualTimeline', label: '时间窗口 < 3个月？' },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="qual-item"
                      onClick={() => updateExtractedField(item.key, !extractedData[item.key])}
                    >
                      <span className={`qual-icon ${extractedData[item.key] ? 'qual-icon-checked' : ''}`}>
                        {extractedData[item.key] ? '☑' : '☐'}
                      </span>
                      <span className="qual-label">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-primary btn-full"
                onClick={handleCreateFromExtract}
                disabled={!extractedData.companyName.trim()}
              >
                创建新客户
              </button>
              <button
                className="btn btn-back btn-full"
                onClick={() => setShowExtractModal(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extraction error */}
      {extractError && (
        <div className="modal-overlay" onClick={() => setExtractError('')}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{extractError}</p>
            <button className="btn btn-primary" onClick={() => setExtractError('')}>
              确定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
