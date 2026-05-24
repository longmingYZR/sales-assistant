import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllCustomers, getAllFollowUps, getLastFollowUpDate } from '../db';
import { analyzePriority, analyzeDealPatterns, askAboutCustomers } from '../utils/analysis';

const STAGES = ['初接触', '需求确认', '报价中', '谈判中', '成交', '搁置'];

export default function Dashboard() {
  const [overdueCustomers, setOverdueCustomers] = useState([]);
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

  const askEndRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const remindDays = Number(localStorage.getItem('remindDays')) || 5;
    const now = Date.now();
    const threshold = remindDays * 24 * 60 * 60 * 1000;

    const customers = await getAllCustomers();
    const fu = await getAllFollowUps();
    const overdue = [];
    const counts = {};
    STAGES.forEach((s) => (counts[s] = 0));

    for (const c of customers) {
      counts[c.stage] = (counts[c.stage] || 0) + 1;
      const lastDate = await getLastFollowUpDate(c.id);
      const referenceDate = lastDate || c.createdAt;
      if (now - referenceDate > threshold) {
        overdue.push({ ...c, lastFollowUp: lastDate });
      }
    }

    overdue.sort((a, b) => {
      const refA = a.lastFollowUp || a.createdAt;
      const refB = b.lastFollowUp || b.createdAt;
      return refA - refB;
    });

    setAllCustomers(customers);
    setAllFollowUps(fu);
    setOverdueCustomers(overdue);
    setStageCounts(counts);
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

      {/* 超时提醒 */}
      <section className="dashboard-section">
        <h3 className="section-title danger">
          需跟进客户 ({overdueCustomers.length})
        </h3>
        {overdueCustomers.length === 0 ? (
          <p className="empty">暂无超时客户</p>
        ) : (
          <ul className="overdue-list">
            {overdueCustomers.map((c) => (
              <li
                key={c.id}
                className="overdue-item"
                onClick={() => navigate(`/customers/${c.id}`)}
              >
                <div className="overdue-info">
                  <strong>{c.companyName}</strong>
                  <span>{c.contactName}</span>
                </div>
                <span className="stage-badge">{c.stage}</span>
              </li>
            ))}
          </ul>
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
