import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllCustomers, getLastFollowUpDate } from '../db';

const STAGES = ['初接触', '需求确认', '报价中', '谈判中', '成交', '搁置'];

export default function Dashboard() {
  const [overdueCustomers, setOverdueCustomers] = useState([]);
  const [stageCounts, setStageCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const remindDays = Number(localStorage.getItem('remindDays')) || 5;
    const now = Date.now();
    const threshold = remindDays * 24 * 60 * 60 * 1000;

    const customers = await getAllCustomers();
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

    setOverdueCustomers(overdue);
    setStageCounts(counts);
    setLoading(false);
  };

  if (loading) return <div className="page"><p className="loading">加载中...</p></div>;

  return (
    <div className="page">
      <h2 className="page-title">销售看板</h2>

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
    </div>
  );
}
