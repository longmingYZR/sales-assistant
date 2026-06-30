import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getAllCustomers, getAllFollowUps, getLastFollowUp, getDeletedCustomers, restoreCustomer, addReviewSession, updateCustomer, addFollowUp } from '../db';
import { detectZombieCustomers } from '../utils/analysis';
import { getIntervalDays, FOLLOWUP_TYPES } from '../utils/followupTypes';
import { hasProductPricing } from '../utils/countryPricing';

const STAGES = ['全部', '初接触', '需求确认', '报价中', '谈判中', '成交', '搁置', '商机关闭', '低活跃', '已删除'];
const COUNTRIES = [
  '全部', '墨西哥', '巴西', '阿根廷', '哥伦比亚', '智利', '秘鲁',
  '厄瓜多尔', '多米尼加', '危地马拉', '巴拿马', '哥斯达黎加',
  '乌拉圭', '巴拉圭', '玻利维亚', '洪都拉斯', '萨尔瓦多', '尼加拉瓜',
  '美国', '加拿大', '巴巴多斯',
];

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [filteredActive, setFilteredActive] = useState([]);
  const [filteredClosed, setFilteredClosed] = useState([]);
  const [stageFilter, setStageFilter] = useState('全部');
  const [countryFilter, setCountryFilter] = useState('全部');
  const [priorityFilter, setPriorityFilter] = useState('全部');
  const [checkpointFilter, setCheckpointFilter] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [overdueIds, setOverdueIds] = useState(new Set());
  const [overdueInfo, setOverdueInfo] = useState({});
  const [lastFollowUpMap, setLastFollowUpMap] = useState({});
  const [zombieIds, setZombieIds] = useState(new Set());
  const [zombieMap, setZombieMap] = useState({});
  const [deletedCustomers, setDeletedCustomers] = useState([]);
  const [restoringId, setRestoringId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [reviewNotes, setReviewNotes] = useState({});
  const [savingCheckpoint, setSavingCheckpoint] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const stageFromUrl = searchParams.get('stage');
    if (stageFromUrl) setStageFilter(stageFromUrl);
    const countryFromUrl = searchParams.get('country');
    if (countryFromUrl) setCountryFilter(countryFromUrl);
    const priorityFromUrl = searchParams.get('priority');
    if (priorityFromUrl) setPriorityFilter(priorityFromUrl);
    const checkpointFromUrl = searchParams.get('checkpoint');
    if (checkpointFromUrl) setCheckpointFilter(checkpointFromUrl);
    loadData();
  }, []);

  // 同步筛选状态到 URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (stageFilter !== '全部') params.set('stage', stageFilter);
    if (countryFilter !== '全部') params.set('country', countryFilter);
    if (priorityFilter !== '全部') params.set('priority', priorityFilter);
    if (checkpointFilter !== '全部') params.set('checkpoint', checkpointFilter);
    setSearchParams(params, { replace: true });
  }, [stageFilter, countryFilter, priorityFilter, checkpointFilter]);

  function getQualScore(c) {
    return (c.qualBudget ? 1 : 0) + (c.qualAuthority ? 1 : 0)
         + (c.qualNeed ? 1 : 0) + (c.qualTimeline ? 1 : 0);
  }

  const loadData = async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    const list = await getAllCustomers();
    list.sort((a, b) => {
      const pa = a.priority === '重点' ? 1 : 0;
      const pb = b.priority === '重点' ? 1 : 0;
      if (pa !== pb) return pb - pa;
      const qa = getQualScore(a);
      const qb = getQualScore(b);
      if (qa !== qb) return qb - qa;
      return b.updatedAt - a.updatedAt;
    });
    setCustomers(list);

    const fuList = await getAllFollowUps();
    setFollowUps(fuList);

    const overdue = new Set();
    const oInfo = {};
    const lastFUMap = {};
    for (const c of list) {
      const lastFU = await getLastFollowUp(c.id);
      if (lastFU) {
        lastFUMap[c.id] = {
          content: lastFU.content,
          date: lastFU.date,
          type: lastFU.type,
        };
      }
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
    setLastFollowUpMap(lastFUMap);

    const zombies = detectZombieCustomers(list, fuList);
    const zIds = new Set(zombies.map((z) => z.id));
    const zMap = {};
    zombies.forEach((z) => { zMap[z.id] = z; });
    setZombieIds(zIds);
    setZombieMap(zMap);

    // 预加载已删除客户（回收站数量）
    getDeletedCustomers().then((d) => setDeletedCustomers(d)).catch(() => {});

    setLoading(false);
  };

  // ── 点检模式 ──
  function toggleReviewMode() {
    if (reviewMode) {
      setSelectedIds(new Set());
      setReviewNotes({});
    }
    setReviewMode((v) => !v);
  }

  function toggleSelectCustomer(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setReviewNotes((n) => { const c = { ...n }; delete c[id]; return c; });
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAllFiltered() {
    const allIds = filteredActive.map((c) => c.id);
    if (showClosed) {
      allIds.push(...filteredClosed.map((c) => c.id));
    }
    setSelectedIds(new Set(allIds));
  }

  function updateReviewNote(id, note) {
    setReviewNotes((prev) => ({ ...prev, [id]: note }));
  }

  function generateCheckpointTitle() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const count = selectedIds.size;
    const parts = [`${month}月${day}日点检`];
    if (countryFilter !== '全部') {
      parts.push(countryFilter);
    }
    if (stageFilter !== '全部' && stageFilter !== '已删除' && stageFilter !== '低活跃') {
      parts.push(stageFilter);
    }
    parts.push(`(${count}个)`);
    return parts.join(' - ');
  }

  async function saveCheckpoint() {
    if (selectedIds.size === 0) return;
    setSavingCheckpoint(true);
    const title = generateCheckpointTitle();
    const now = Date.now();
    const customerIds = Array.from(selectedIds);

    await addReviewSession({
      title,
      customerIds,
      notes: reviewNotes,
    });

    for (const customerId of customerIds) {
      await updateCustomer(customerId, {
        lastCheckpointAt: now,
        lastCheckpointNote: reviewNotes[customerId] || '',
      });
      // 写一条跟进记录，让点检出现在跟进时间线里
      const note = reviewNotes[customerId] || '';
      await addFollowUp({
        customerId,
        date: now,
        type: 'checkpoint',
        content: note ? `${title}\n${note}` : title,
      });
    }

    setSelectedIds(new Set());
    setReviewNotes({});
    setReviewMode(false);
    setSavingCheckpoint(false);
    await loadData();
  }

  const handleRestore = async (id, e) => {
    e.stopPropagation();
    setRestoringId(id);
    await restoreCustomer(id);
    // 刷新列表
    const [live, del] = await Promise.all([getAllCustomers(), getDeletedCustomers()]);
    setCustomers(live.sort((a, b) => b.updatedAt - a.updatedAt));
    setDeletedCustomers(del);
    setRestoringId(null);
  };

  useEffect(() => {
    let result = stageFilter === '已删除' ? deletedCustomers : customers;

    // 搜索：匹配客户名称、商机编号、联系人
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((c) =>
        c.companyName?.toLowerCase().includes(q) ||
        c.opportunityId?.toLowerCase().includes(q) ||
        c.contactName?.toLowerCase().includes(q) ||
        (c.priority || '普通').includes(q)
      );
    }

    if (stageFilter === '已删除') {
      // 已删除模式：不做阶段/国家筛选，直接显示
    } else if (stageFilter === '低活跃') {
      result = result.filter((c) => zombieIds.has(c.id));
    } else if (stageFilter !== '全部') {
      result = result.filter((c) => c.stage === stageFilter);
    }

    if (stageFilter !== '已删除' && countryFilter !== '全部') {
      result = result.filter((c) => c.country === countryFilter);
    }

    if (priorityFilter !== '全部') {
      result = result.filter((c) => (c.priority || '普通') === priorityFilter);
    }

    // 点检筛选
    const now_ = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    if (checkpointFilter === 'reviewed') {
      result = result.filter((c) => c.lastCheckpointAt);
    } else if (checkpointFilter === 'unreviewed') {
      result = result.filter((c) => !c.lastCheckpointAt);
    } else if (checkpointFilter === 'over7') {
      result = result.filter((c) => !c.lastCheckpointAt || (now_ - c.lastCheckpointAt > 7 * DAY));
    } else if (checkpointFilter === 'over30') {
      result = result.filter((c) => !c.lastCheckpointAt || (now_ - c.lastCheckpointAt > 30 * DAY));
    }

    // 分离已关闭商机：仅在「全部」阶段时独立收纳
    if (stageFilter === '全部') {
      setFilteredActive(result.filter((c) => c.stage !== '商机关闭' && c.status !== '结束'));
      setFilteredClosed(result.filter((c) => c.stage === '商机关闭' || c.status === '结束'));
    } else {
      setFilteredActive(result);
      setFilteredClosed([]);
    }
  }, [customers, deletedCustomers, stageFilter, countryFilter, zombieIds, searchQuery, priorityFilter, checkpointFilter]);

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
        <input
          className="input"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索客户名称 / 商机编号 / 联系人..."
          style={{ flex: 1, minWidth: 0 }}
        />
        <select
          className="select"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s === '全部' ? '全部阶段' : s === '低活跃' ? `低活跃 (${zombieIds.size})` : s === '已删除' ? `已删除 (${deletedCustomers.length})` : s}
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
        <select
          className="select"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
        >
          <option value="全部">全部级别</option>
          <option value="重点">重点</option>
          <option value="普通">普通</option>
        </select>
        <select
          className="select"
          value={checkpointFilter}
          onChange={(e) => setCheckpointFilter(e.target.value)}
        >
          <option value="全部">全部点检</option>
          <option value="reviewed">已点检</option>
          <option value="unreviewed">未点检</option>
          <option value="over7">超7天未点检</option>
          <option value="over30">超30天未点检</option>
        </select>
      </div>

      {/* 点检模式工具栏 */}
      <div className="review-toolbar">
        <button
          className={`btn btn-sm ${reviewMode ? 'btn-danger' : 'btn-primary'}`}
          onClick={toggleReviewMode}
        >
          {reviewMode ? '退出点检' : '📋 点检模式'}
        </button>
        {reviewMode && (
          <button className="btn btn-back btn-sm" onClick={selectAllFiltered}>
            全选当前筛选
          </button>
        )}
      </div>

      {filteredActive.length === 0 && filteredClosed.length === 0 ? (
        <p className="empty">暂无客户，点击右上角新增</p>
      ) : (
        <>
          <ul className="customer-list">
            {filteredActive.map((c) => {
              const isDeleted = c._deleted === true;
              const isZombie = !isDeleted && zombieIds.has(c.id);
              const zInfo = zombieMap[c.id];
              return (
                <li
                  key={c.id}
                  className={`customer-card ${reviewMode ? 'review-mode' : ''} ${overdueIds.has(c.id) ? 'overdue' : ''} ${isZombie ? 'zombie' : ''} ${isDeleted ? 'deleted' : ''} ${c.priority === '重点' ? 'priority-high' : ''}`}
                  onClick={reviewMode ? () => {
                    toggleSelectCustomer(c.id);
                  } : () => {
                    if (window.getSelection()?.toString()) return;
                    navigate(`/customers/${c.id}`);
                  }}
                >
                  {reviewMode && (
                    <input
                      type="checkbox"
                      className="review-checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelectCustomer(c.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <div className="card-top">
                    <strong>{c.companyName}</strong>
                    {c.priority === '重点' && (
                      <span className="priority-badge">重点</span>
                    )}
                    <span className={`stage-badge ${isZombie ? 'stage-zombie' : ''}`}>
                      {c.stage}
                    </span>
                  </div>
                  <div className="card-mid">
                    <span>{c.contactName}</span>
                    <span>{c.country}</span>
                    {c.opportunityId && <span className="card-opp-id">{c.opportunityId}</span>}
                    {(() => {
                      const qs = getQualScore(c);
                      const label = qs === 4 ? 'BANT✓' : qs > 0 ? `BANT ${qs}/4` : 'BANT✗';
                      const color = qs === 4 ? 'var(--success)' : qs > 0 ? 'var(--warning)' : 'var(--danger)';
                      return <span style={{ fontSize: 10, color, fontWeight: 600 }}>{label}</span>;
                    })()}
                  </div>
                  {c.needs && <p className="card-needs">{c.needs}</p>}
                  {c.amount > 0 && <p className="card-amount">$ {c.amount.toLocaleString()}</p>}
                  {lastFollowUpMap[c.id] && (
                    <p className="card-last-fu">
                      <span className="fu-label">{FOLLOWUP_TYPES[lastFollowUpMap[c.id].type]?.label || '跟进'}</span>
                      {lastFollowUpMap[c.id].content.slice(0, 80)}
                      {lastFollowUpMap[c.id].content.length > 80 ? '...' : ''}
                    </p>
                  )}
                  {c.lastCheckpointAt ? (
                    <p className="card-checkpoint">📋 {Math.floor((Date.now() - c.lastCheckpointAt) / 86400000)}天前点检</p>
                  ) : (
                    <p className="card-checkpoint" style={{ color: 'var(--warning)' }}>📋 未点检</p>
                  )}
                  {isDeleted && (
                    <div className="deleted-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={(e) => handleRestore(c.id, e)}
                        disabled={restoringId === c.id}
                      >
                        {restoringId === c.id ? '恢复中...' : '恢复'}
                      </button>
                    </div>
                  )}
                  {!isDeleted && overdueIds.has(c.id) && (
                    <span className="overdue-tag">
                      {overdueInfo[c.id]?.label}超{overdueInfo[c.id]?.daysOverdue}天
                    </span>
                  )}
                  {!isDeleted && isZombie && zInfo && (
                    <div className="zombie-info">
                      <span className="zombie-tag">低活跃</span>
                      <span className="zombie-reason">{zInfo.zombieReasons.join(' · ')}</span>
                    </div>
                  )}
                  {reviewMode && selectedIds.has(c.id) && (
                    <textarea
                      className="input textarea review-note-input"
                      placeholder="点检备注（可选）..."
                      value={reviewNotes[c.id] || ''}
                      onChange={(e) => updateReviewNote(c.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      rows={2}
                    />
                  )}
                </li>
              );
            })}
          </ul>

          {/* 已关闭商机折叠区域 */}
          {filteredClosed.length > 0 && (
            <div className="closed-section">
              <div
                className="closed-section-header"
                onClick={() => setShowClosed((v) => !v)}
              >
                <span>📁 已关闭商机 ({filteredClosed.length})</span>
                <span className="closed-arrow">{showClosed ? '▼' : '▶'}</span>
              </div>
              {showClosed && (
                <ul className="customer-list" style={{ marginTop: 8 }}>
                  {filteredClosed.map((c) => {
                    const isDeleted = c._deleted === true;
                    return (
                      <li
                        key={c.id}
                        className={`customer-card ${reviewMode ? 'review-mode' : ''} ${isDeleted ? 'deleted' : ''} ${c.priority === '重点' ? 'priority-high' : ''}`}
                        onClick={reviewMode ? () => {
                          toggleSelectCustomer(c.id);
                        } : () => {
                    if (window.getSelection()?.toString()) return;
                    navigate(`/customers/${c.id}`);
                  }}
                        style={{ opacity: 0.85 }}
                      >
                        {reviewMode && (
                          <input
                            type="checkbox"
                            className="review-checkbox"
                            checked={selectedIds.has(c.id)}
                            onChange={() => toggleSelectCustomer(c.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <div className="card-top">
                          <strong>{c.companyName}</strong>
                          {c.priority === '重点' && (
                            <span className="priority-badge">重点</span>
                          )}
                          <span className="stage-badge" style={{ opacity: 0.7 }}>{c.stage}</span>
                        </div>
                        <div className="card-mid">
                          <span>{c.contactName}</span>
                          <span>{c.country}</span>
                          {c.opportunityId && <span className="card-opp-id">{c.opportunityId}</span>}
                          {(() => {
                            const qs = getQualScore(c);
                            const label = qs === 4 ? 'BANT✓' : qs > 0 ? `BANT ${qs}/4` : 'BANT✗';
                            const color = qs === 4 ? 'var(--success)' : qs > 0 ? 'var(--warning)' : 'var(--danger)';
                            return <span style={{ fontSize: 10, color, fontWeight: 600 }}>{label}</span>;
                          })()}
                        </div>
                        {c.amount > 0 && <p className="card-amount">$ {c.amount.toLocaleString()}</p>}
                        {lastFollowUpMap[c.id] && (
                          <p className="card-last-fu">
                            <span className="fu-label">{FOLLOWUP_TYPES[lastFollowUpMap[c.id].type]?.label || '跟进'}</span>
                            {lastFollowUpMap[c.id].content.slice(0, 80)}
                            {lastFollowUpMap[c.id].content.length > 80 ? '...' : ''}
                          </p>
                        )}
                        {c.lastCheckpointAt ? (
                          <p className="card-checkpoint">📋 {Math.floor((Date.now() - c.lastCheckpointAt) / 86400000)}天前点检</p>
                        ) : (
                          <p className="card-checkpoint" style={{ color: 'var(--warning)' }}>📋 未点检</p>
                        )}
                        {isDeleted && (
                          <div className="deleted-actions">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={(e) => handleRestore(c.id, e)}
                              disabled={restoringId === c.id}
                            >
                              {restoringId === c.id ? '恢复中...' : '恢复'}
                            </button>
                          </div>
                        )}
                        {reviewMode && selectedIds.has(c.id) && (
                          <textarea
                            className="input textarea review-note-input"
                            placeholder="点检备注（可选）..."
                            value={reviewNotes[c.id] || ''}
                            onChange={(e) => updateReviewNote(c.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            rows={2}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* 点检底部栏 */}
          {reviewMode && selectedIds.size > 0 && (
            <div className="review-bottom-bar">
              <span className="review-count">已选 {selectedIds.size} 个客户</span>
              <button
                className="btn btn-primary"
                onClick={saveCheckpoint}
                disabled={savingCheckpoint}
              >
                {savingCheckpoint ? '保存中...' : '完成点检'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
