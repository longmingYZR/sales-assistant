import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllCustomers, getAllFollowUps, getLastFollowUp, getAllConversations } from '../db';
import { analyzePriority, analyzeDealPatterns, askAboutCustomers } from '../utils/analysis';
import { FOLLOWUP_TYPES, getCategoryForType, getIntervalDays, CATEGORY_CONFIG } from '../utils/followupTypes';

const STAGES = ['初接触', '需求确认', '报价中', '谈判中', '成交', '搁置'];

export default function Dashboard() {
  const [categorized, setCategorized] = useState({ urgent: [], waiting: [], progressing: [], routine: [] });
  const [totalOverdue, setTotalOverdue] = useState(0);
  const [stageCounts, setStageCounts] = useState({});
  const [allCustomers, setAllCustomers] = useState([]);
  const [allFollowUps, setAllFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);

  const [priorityResult, setPriorityResult] = useState('');
  const [priorityLoading, setPriorityLoading] = useState(false);

  const [dealPatterns, setDealPatterns] = useState('');
  const [dealLoading, setDealLoading] = useState(false);

  const [askInput, setAskInput] = useState('');
  const [askResult, setAskResult] = useState('');
  const [askLoading, setAskLoading] = useState(false);

  const [recentConversations, setRecentConversations] = useState([]);

  const askEndRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    const customers = await getAllCustomers();
    const fu = await getAllFollowUps();
    const groups = { urgent: [], waiting: [], progressing: [], routine: [] };
    const counts = {};
    STAGES.forEach((s) => (counts[s] = 0));

    for (const c of customers) {
      counts[c.stage] = (counts[c.stage] || 0) + 1;
      const lastFU = await getLastFollowUp(c.id);
      const lastDate = lastFU ? lastFU.date : 0;
      const lastType = lastFU ? lastFU.type : 'visit';
      const intervalDays = getIntervalDays(lastType);
      const threshold = intervalDays * DAY;
      const referenceDate = lastDate || c.createdAt;

      if (now - referenceDate > threshold) {
        const daysOverdue = Math.floor((now - referenceDate) / DAY);
        const category = getCategoryForType(lastType);
        groups[category].push({
          ...c,
          lastFollowUp: lastDate,
          lastType,
          daysOverdue,
        });
      }
    }

    // Sort each category by most overdue first
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => {
        const refA = a.lastFollowUp || a.createdAt;
        const refB = b.lastFollowUp || b.createdAt;
        return refA - refB;
      });
    }

    const total = Object.values(groups).reduce((s, arr) => s + arr.length, 0);

    setAllCustomers(customers);
    setAllFollowUps(fu);
    setCategorized(groups);
    setTotalOverdue(total);
    setStageCounts(counts);

    getAllConversations().then((all) => setRecentConversations(all.slice(0, 3))).catch(() => {});

    setLoading(false);
  };

  const handlePriorityAnalysis = async () => {
    const apiKey = localStorage.getItem('aiApiKey');
    const providerId = localStorage.getItem('aiProvider') || 'claude';
    if (!apiKey) { alert('请先在设置页配置 AI API Key'); return; }

    setPriorityLoading(true);
    setPriorityResult('');
    try {
      const result = await analyzePriority(allCustomers, allFollowUps, apiKey, providerId);
      setPriorityResult(result);
    } catch (err) {
      setPriorityResult(`分析失败：${err.message}`);
    } finally {
      setPriorityLoading(false);
    }
  };

  const handleDealAnalysis = async () => {
    const apiKey = localStorage.getItem('aiApiKey');
    const providerId = localStorage.getItem('aiProvider') || 'claude';
    if (!apiKey) { alert('请先在设置页配置 AI API Key'); return; }

    setDealLoading(true);
    setDealPatterns('');
    try {
      const result = await analyzeDealPatterns(allCustomers, allFollowUps, apiKey, providerId);
      setDealPatterns(result);
    } catch (err) {
      setDealPatterns(`分析失败：${err.message}`);
    } finally {
      setDealLoading(false);
    }
  };

  const handleAsk = async () => {
    const q = askInput.trim();
    if (!q) return;
    const apiKey = localStorage.getItem('aiApiKey');
    const providerId = localStorage.getItem('aiProvider') || 'claude';
    if (!apiKey) { alert('请先在设置页配置 AI API Key'); return; }

    setAskLoading(true);
    setAskResult('');
    try {
      const result = await askAboutCustomers(q, allCustomers, allFollowUps, apiKey, providerId);
      setAskResult(result);
    } catch (err) {
      setAskResult(`查询失败：${err.message}`);
    } finally {
      setAskLoading(false);
      setTimeout(() => askEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const wonCount = stageCounts['成交'] || 0;

  if (loading) return <div className="page"><p className="loading">加载中...</p></div>;

  return (
    <div className="page">
      <h2 className="page-title">销售看板</h2>

      {/* 需跟进客户 - 分类展示 */}
      <section className="dashboard-section">
        <h3 className="section-title">
          需跟进客户 ({totalOverdue})
        </h3>
        {totalOverdue === 0 ? (
          <p className="empty">暂无超时客户</p>
        ) : (
          ['urgent', 'waiting', 'progressing', 'routine'].map((cat) => {
            const items = categorized[cat];
            if (items.length === 0) return null;
            const cfg = CATEGORY_CONFIG[cat];
            return (
              <div key={cat} className={`followup-category category-${cfg.color}`}>
                <h4 className="category-title">{cfg.label} ({items.length})</h4>
                <ul className="overdue-list">
                  {items.map((c) => (
                    <li
                      key={c.id}
                      className="overdue-item"
                      onClick={() => navigate(`/customers/${c.id}`)}
                    >
                      <div className="overdue-info">
                        <strong>{c.companyName}</strong>
                        <span>{c.contactName}</span>
                        <span className="overdue-type-info">
                          <span className={`followup-type-badge type-${c.lastType}`}>
                            {FOLLOWUP_TYPES[c.lastType]?.label}
                          </span>
                          超{c.daysOverdue}天
                        </span>
                      </div>
                      <span className="stage-badge">{c.stage}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>

      {/* 阶段统计 */}
      <section className="dashboard-section">
        <h3 className="section-title">各阶段统计</h3>
        <div className="stage-stats">
          {STAGES.map((stage) => (
            <div
              key={stage}
              className="stat-card"
              onClick={() => navigate(`/customers?stage=${encodeURIComponent(stage)}`)}
            >
              <span className="stat-num">{stageCounts[stage] || 0}</span>
              <span className="stat-label">{stage}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 智能分析区 ===== */}
      <section className="dashboard-section">
        <h3 className="section-title">智能分析</h3>

        {/* 需求分析助手 */}
        <div className="analysis-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/assistant')}>
          <div className="analysis-card-header">
            <span>AI 需求梳理</span>
            <button
              className="btn btn-primary btn-sm"
              onClick={(e) => { e.stopPropagation(); navigate('/assistant'); }}
            >
              开始分析
            </button>
          </div>
          <p className="hint">
            输入模糊的项目需求，AI 会通过多轮提问帮你理清客户需求，
            并生成具体的报价、型号推荐和技术方案。
          </p>
          {recentConversations.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="hint">最近对话</span>
                <button
                  className="btn btn-back btn-sm"
                  onClick={(e) => { e.stopPropagation(); navigate('/assistant'); }}
                >
                  查看全部 →
                </button>
              </div>
              {recentConversations.map((c) => (
                <div
                  key={c.id}
                  className="doc-item"
                  onClick={(e) => { e.stopPropagation(); navigate(`/assistant/${c.id}`); }}
                  style={{ marginBottom: 4 }}
                >
                  <div className="doc-info">
                    <span className="doc-name">{c.title}</span>
                    <span className="doc-size">
                      {new Date(c.updatedAt).toLocaleDateString('zh-CN')} · {c.messages?.length || 0} 条消息
                    </span>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={(e) => { e.stopPropagation(); navigate(`/assistant/${c.id}`); }}
                  >
                    继续
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3.1 周优先级排序 */}
        <div className="analysis-card">
          <div className="analysis-card-header">
            <span>本周重点客户</span>
            <button
              className="btn btn-primary btn-sm"
              onClick={handlePriorityAnalysis}
              disabled={priorityLoading}
            >
              {priorityLoading ? 'AI 分析中...' : '生成分析'}
            </button>
          </div>
          {priorityResult && (
            <div className="analysis-result">{priorityResult}</div>
          )}
          <p className="hint">
            首次使用提示：分析准确度取决于跟进记录的质量。建议每次沟通后记录客户表述、需求、下一步计划。
          </p>
        </div>

        {/* 3.3 成单规律 */}
        <div className="analysis-card" style={{ marginTop: 12 }}>
          <div className="analysis-card-header">
            <span>成单规律总结</span>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleDealAnalysis}
              disabled={dealLoading || wonCount < 3}
            >
              {dealLoading ? 'AI 分析中...' : '生成分析'}
            </button>
          </div>
          {wonCount < 3 && (
            <p className="hint">需至少3个成交客户才能分析（当前{wonCount}个）</p>
          )}
          {dealPatterns && (
            <div className="analysis-result">{dealPatterns}</div>
          )}
        </div>

        {/* 3.4 自由提问 */}
        <div className="analysis-card" style={{ marginTop: 12 }}>
          <div className="analysis-card-header">
            <span>自由提问</span>
            <span className="hint">基于全量客户数据回答</span>
          </div>
          {askResult && (
            <div className="analysis-result">{askResult}</div>
          )}
          <div className="ask-input-row">
            <input
              className="input"
              value={askInput}
              onChange={(e) => setAskInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAsk(); }}
              placeholder="例如：我现在最可能成交的客户是谁？"
              disabled={askLoading}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleAsk}
              disabled={askLoading || !askInput.trim()}
            >
              {askLoading ? '...' : '提问'}
            </button>
          </div>
          <div ref={askEndRef} />
        </div>
      </section>
    </div>
  );
}
