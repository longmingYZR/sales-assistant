import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getAllCustomers, getAllFollowUps, getLastFollowUp } from '../db';
import { detectZombieCustomers } from '../utils/analysis';
import { getIntervalDays, FOLLOWUP_TYPES } from '../utils/followupTypes';
import { hasProductPricing } from '../utils/countryPricing';

const STAGES = ['全部', '初接触', '需求确认', '报价中', '谈判中', '成交', '搁置', '商机关闭', '低活跃'];
const COUNTRIES = [
  '全部', '墨西哥', '巴西', '阿根廷', '哥伦比亚', '智利', '秘鲁',
  '厄瓜多尔', '多米尼加', '危地马拉', '巴拿马', '哥斯达黎加',
  '乌拉圭', '巴拉圭', '玻利维亚', '洪都拉斯', '萨尔瓦多', '尼加拉瓜',
  '美国', '加拿大', '巴巴多斯',
];

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [stageFilter, setStageFilter] = useState('全部');
  const [countryFilter, setCountryFilter] = useState('全部');
  const [overdueIds, setOverdueIds] = useState(new Set());
  const [overdueInfo, setOverdueInfo] = useState({});
  const [zombieIds, setZombieIds] = useState(new Set());
  const [zombieMap, setZombieMap] = useState({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const stageFromUrl = searchParams.get('stage');
    if (stageFromUrl) setStageFilter(stageFromUrl);
    loadData();
  }, []);

  const loadData = async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    const list = await getAllCustomers();
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    setCustomers(list);

    const fuList = await getAllFollowUps();
    setFollowUps(fuList);

    const overdue = new Set();
    const oInfo = {};
    for (const c of list) {
      const lastFU = await getLastFollowUp(c.id);
      const lastDate = lastFU ? lastFU.date : 0;
      const lastType = lastFU ? lastFU.type : 'visit';
      const intervalDays = getIntervalDays(lastType);
      const threshold = intervalDays * DAY;
      const ref = lastDate || c.createdAt;
      if (now - ref > threshold) {
        overdue.add(c.id);
        oInfo[c.id] = {
          type: lastType,
          label: FOLLOWUP_TYPES[lastType]?.label || '其他',
          daysOverdue: Math.floor((now - ref) / DAY),
        };
      }
    }
    setOverdueIds(overdue);
    setOverdueInfo(oInfo);

    const zombies = detectZombieCustomers(list, fuList);
    const zIds = new Set(zombies.map((z) => z.id));
    const zMap = {};
    zombies.forEach((z) => { zMap[z.id] = z; });
    setZombieIds(zIds);
    setZombieMap(zMap);

    setLoading(false);
  };

  useEffect(() => {
    let result = customers;

    if (stageFilter === '低活跃') {
      result = result.filter((c) => zombieIds.has(c.id));
    } else if (stageFilter !== '全部') {
      result = result.filter((c) => c.stage === stageFilter);
    }

    if (countryFilter !== '全部') {
      result = result.filter((c) => c.country === countryFilter);
    }
    setFiltered(result);
  }, [customers, stageFilter, countryFilter, zombieIds]);

  if (loading) return <div className="page"><p className="loading">加载中...</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">客户管理</h2>
        <button className="btn btn-primary" onClick={() => navigate('/customers/new')}>
          + 新增
        </button>
      </div>

      <div className="filters">
        <select
          className="select"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s === '全部' ? '全部阶段' : s === '低活跃' ? `低活跃 (${zombieIds.size})` : s}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
        >
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c === '全部' ? '全部国家' : `${c}${hasProductPricing(c) ? ' *' : ''}`}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="empty">暂无客户，点击右上角新增</p>
      ) : (
        <ul className="customer-list">
          {filtered.map((c) => {
            const isZombie = zombieIds.has(c.id);
            const zInfo = zombieMap[c.id];
            return (
              <li
                key={c.id}
                className={`customer-card ${overdueIds.has(c.id) ? 'overdue' : ''} ${isZombie ? 'zombie' : ''}`}
                onClick={() => navigate(`/customers/${c.id}`)}
              >
                <div className="card-top">
                  <strong>{c.companyName}</strong>
                  <span className={`stage-badge ${isZombie ? 'stage-zombie' : ''}`}>
                    {c.stage}
                  </span>
                </div>
                <div className="card-mid">
                  <span>{c.contactName}</span>
                  <span>{c.country}</span>
                  {c.opportunityId && <span className="card-opp-id">{c.opportunityId}</span>}
                </div>
                {c.needs && <p className="card-needs">{c.needs}</p>}
                {c.amount > 0 && <p className="card-amount">$ {c.amount.toLocaleString()}</p>}
                {overdueIds.has(c.id) && (
                  <span className="overdue-tag">
                    {overdueInfo[c.id]?.label}超{overdueInfo[c.id]?.daysOverdue}天
                  </span>
                )}
                {isZombie && zInfo && (
                  <div className="zombie-info">
                    <span className="zombie-tag">低活跃</span>
                    <span className="zombie-reason">{zInfo.zombieReasons.join(' · ')}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
