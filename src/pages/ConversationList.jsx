import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllConversations, addConversation, deleteConversation } from '../db';

export default function ConversationList() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const all = await getAllConversations();
      setConversations(all);
    } catch (err) {
      console.error('加载对话列表失败', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNew = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const id = await addConversation({ title: '新需求分析', messages: [] });
      navigate(`/assistant/${id}`, { replace: true });
    } catch (err) {
      console.error('创建对话失败', err);
      setCreating(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('确定删除此对话？')) return;
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  };

  const formatDate = (ts) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 24 * 60 * 60 * 1000) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  if (loading) return <div className="page"><p className="loading">加载中...</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title" style={{ margin: 0 }}>需求分析助手</h2>
        <button className="btn btn-primary btn-sm" onClick={handleNew} disabled={creating}>
          {creating ? '创建中...' : '+ 新建'}
        </button>
      </div>

      <p className="hint" style={{ marginBottom: 16 }}>
        输入模糊的项目需求，AI 会通过多轮提问帮你理清客户需求，并给出报价和型号建议。
      </p>

      {conversations.length === 0 ? (
        <div className="analysis-card" onClick={handleNew} style={{ cursor: 'pointer', textAlign: 'center', padding: 32 }}>
          <p className="hint" style={{ marginBottom: 12 }}>暂无对话记录</p>
          <button className="btn btn-primary">开始第一次需求分析</button>
        </div>
      ) : (
        <div className="doc-list">
          {conversations.map((c) => (
            <div
              key={c.id}
              className="doc-item"
              onClick={() => navigate(`/assistant/${c.id}`)}
            >
              <div className="doc-info">
                <span className="doc-name">{c.title}</span>
                <span className="doc-size">
                  {formatDate(c.updatedAt)} · {c.messages?.length || 0} 条消息
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={(e) => { e.stopPropagation(); navigate(`/assistant/${c.id}`); }}
                >
                  继续
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={(e) => handleDelete(e, c.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
