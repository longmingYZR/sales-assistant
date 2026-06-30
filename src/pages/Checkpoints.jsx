import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllReviewSessions, getAllCustomers, deleteReviewSession } from '../db';

export default function Checkpoints() {
  const [sessions, setSessions] = useState([]);
  const [customerMap, setCustomerMap] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [s, c] = await Promise.all([
      getAllReviewSessions(),
      getAllCustomers(),
    ]);
    setSessions(s);
    const map = {};
    c.forEach((cust) => { map[cust.id] = cust; });
    setCustomerMap(map);
    setLoading(false);
  }

  function toggleExpand(id) {
    setExpandedId(expandedId === id ? null : id);
  }

  async function handleDelete(id) {
    if (!window.confirm('确定删除此点检记录？（不会影响客户数据）')) return;
    await deleteReviewSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  if (loading) return <div className="page"><p className="loading">加载中...</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn btn-back" onClick={() => navigate(-1)}>
          ← 返回
        </button>
        <h2 className="page-title" style={{ margin: 0, fontSize: 18 }}>点检历史</h2>
        <span />
      </div>

      {sessions.length === 0 ? (
        <p className="empty" style={{ marginTop: 32 }}>暂无点检记录</p>
      ) : (
        <div className="checkpoint-list">
          {sessions.map((s) => {
            const isExpanded = expandedId === s.id;
            const dateStr = new Date(s.createdAt).toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <div key={s.id} className="checkpoint-session-card">
                <div
                  className="checkpoint-session-header"
                  onClick={() => toggleExpand(s.id)}
                >
                  <div className="checkpoint-session-info">
                    <strong>{s.title}</strong>
                    <span className="checkpoint-date">{dateStr}</span>
                  </div>
                  <span className="checkpoint-count">{s.customerIds.length} 个</span>
                  <span className={`section-arrow ${isExpanded ? 'open' : ''}`}>
                    {isExpanded ? '▼' : '▶'}
                  </span>
                </div>
                {isExpanded && (
                  <div className="checkpoint-session-body">
                    {s.customerIds.map((cid) => {
                      const cust = customerMap[cid];
                      const note = s.notes?.[cid];
                      return (
                        <div
                          key={cid}
                          className="checkpoint-customer-row"
                          onClick={() => navigate(`/customers/${cid}`)}
                        >
                          <span className="checkpoint-customer-name">
                            {cust ? cust.companyName : `客户 #${cid}`}
                          </span>
                          {note ? (
                            <span className="checkpoint-customer-note">{note}</span>
                          ) : (
                            <span className="checkpoint-customer-note" style={{ fontStyle: 'italic', opacity: 0.5 }}>无备注</span>
                          )}
                        </div>
                      );
                    })}
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                      style={{ marginTop: 10 }}
                    >
                      删除此记录
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
