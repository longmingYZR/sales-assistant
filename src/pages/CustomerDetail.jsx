import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getCustomer,
  getCustomerRaw,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
  getFollowUps,
  addFollowUp,
  updateFollowUp,
} from '../db';
import { FOLLOWUP_TYPES, STAGE_FOLLOWUP_TYPES, getIntervalDays } from '../utils/followupTypes';
import { getCountryPricing, hasProductPricing } from '../utils/countryPricing';
import { calcVolume, formatVolume } from '../utils/dimensions';
import CountryProductCards from '../components/CountryProductCards';

const STAGES = ['初接触', '需求确认', '报价中', '谈判中', '成交', '搁置', '商机关闭'];
const COUNTRIES = [
  '墨西哥', '巴西', '阿根廷', '哥伦比亚', '智利', '秘鲁',
  '厄瓜多尔', '多米尼加', '危地马拉', '巴拿马', '哥斯达黎加',
  '乌拉圭', '巴拉圭', '玻利维亚', '洪都拉斯', '萨尔瓦多', '尼加拉瓜',
  '美国', '加拿大', '巴巴多斯',
];

const emptyForm = {
  companyName: '',
  contactName: '',
  country: '墨西哥',
  needs: '',
  stage: '初接触',
  amount: 0,
  opportunityId: '',
  status: '有效',
  priority: '普通',
  qualBudget: false,
  qualAuthority: false,
  qualNeed: false,
  qualTimeline: false,
};

// Inline collapsible section component
function CollapsibleSection({ title, badge, collapsed, onToggle, children }) {
  return (
    <section className="collapsible-section">
      <div className="section-header" onClick={onToggle}>
        <span className="section-title">{title}</span>
        {badge && <span className="section-badge">{badge}</span>}
        <span className={`section-arrow ${collapsed ? '' : 'open'}`}>
          {collapsed ? '▶' : '▼'}
        </span>
      </div>
      {!collapsed && <div className="section-body">{children}</div>}
    </section>
  );
}

export default function CustomerDetail() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const [form, setForm] = useState(emptyForm);
  const [followUps, setFollowUps] = useState([]);
  const [newFollowUp, setNewFollowUp] = useState('');
  const [followUpType, setFollowUpType] = useState('visit');
  const [editingFuId, setEditingFuId] = useState(null);
  const [editingFuContent, setEditingFuContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  // Country pricing state
  const [countryPricing, setCountryPricing] = useState(null);
  // CIF calculator state — freight input per product model
  const [cifFreight, setCifFreight] = useState({});
  // Freight rate per m³
  const [freightRate, setFreightRate] = useState('');
  // Models whose freight has been manually overridden
  const [freightOverrides, setFreightOverrides] = useState(new Set());
  // CIF product selection
  const [cifSelectedModels, setCifSelectedModels] = useState(new Set());
  // Collapsible sections
  const [collapsedSections, setCollapsedSections] = useState(new Set(['customerInfo', 'qualification', 'followUps', 'productPricing', 'cifPricing']));

  const availableTypes = STAGE_FOLLOWUP_TYPES[form.stage] || ['other'];

  const toggleSection = (name) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  useEffect(() => {
    if (!isNew) {
      loadCustomer();
    }
  }, [id]);

  useEffect(() => {
    if (!availableTypes.includes(followUpType)) {
      setFollowUpType(availableTypes[0]);
    }
  }, [form.stage]);

  // 加载该国家的海运费单价记忆
  useEffect(() => {
    if (countryPricing) {
      const saved = localStorage.getItem(`freightRate_${form.country}`);
      if (saved !== null) setFreightRate(saved);
    }
  }, [countryPricing, form.country]);

  const loadCustomer = async () => {
    let c = await getCustomer(Number(id));
    // 如果已删除，尝试获取原始记录以显示恢复界面
    if (!c) {
      c = await getCustomerRaw(Number(id));
      if (c && c._deleted) {
        setIsDeleted(true);
      } else {
        navigate('/customers'); return;
      }
    }
    setForm({
      companyName: c.companyName,
      contactName: c.contactName || '',
      country: c.country,
      needs: c.needs || '',
      stage: c.stage,
      amount: c.amount || 0,
      opportunityId: c.opportunityId || '',
      status: c.status || '有效',
      priority: c.priority || '普通',
      qualBudget: c.qualBudget || false,
      qualAuthority: c.qualAuthority || false,
      qualNeed: c.qualNeed || false,
      qualTimeline: c.qualTimeline || false,
      lastCheckpointAt: c.lastCheckpointAt,
      lastCheckpointNote: c.lastCheckpointNote || '',
    });
    setFollowUps(await getFollowUps(c.id));
    // Load country pricing data
    const pricing = getCountryPricing(c.country);
    setCountryPricing(pricing);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.companyName.trim()) return;
    setSaving(true);
    if (isNew) {
      const newId = await addCustomer(form);
      navigate(`/customers/${newId}`, { replace: true });
    } else {
      await updateCustomer(Number(id), form);
    }
    setSaving(false);
  };

  const startEditFu = (f) => {
    setEditingFuId(f.id);
    setEditingFuContent(f.content);
  };
  const cancelEditFu = () => {
    setEditingFuId(null);
    setEditingFuContent('');
  };
  const saveEditFu = async (id) => {
    if (!editingFuContent.trim()) return;
    await updateFollowUp(id, { content: editingFuContent.trim() });
    setEditingFuId(null);
    setEditingFuContent('');
    setFollowUps(await getFollowUps(Number(id)));
  };

  const handleAddFollowUp = async () => {
    if (!newFollowUp.trim()) return;
    await addFollowUp({
      customerId: Number(id),
      date: Date.now(),
      content: newFollowUp.trim(),
      type: followUpType,
    });
    setNewFollowUp('');
    setFollowUps(await getFollowUps(Number(id)));
  };

  const handleDelete = async () => {
    if (!window.confirm('确定删除此客户？可在客户列表筛选「已删除」中恢复。')) return;
    await deleteCustomer(Number(id));
    navigate('/customers');
  };

  const handleRestore = async () => {
    await restoreCustomer(Number(id));
    setIsDeleted(false);
    // 刷新以获取正常数据
    const c = await getCustomer(Number(id));
    if (c) {
      setForm({
        companyName: c.companyName,
        contactName: c.contactName || '',
        country: c.country,
        needs: c.needs || '',
        stage: c.stage,
        amount: c.amount || 0,
        opportunityId: c.opportunityId || '',
        status: c.status || '有效',
        priority: c.priority || '普通',
        qualBudget: c.qualBudget || false,
        qualAuthority: c.qualAuthority || false,
        qualNeed: c.qualNeed || false,
        qualTimeline: c.qualTimeline || false,
      });
    }
  };

  // --- Copy product info for logistics ---
  const handleCopyProduct = (product) => {
    const volume = calcVolume(product.dimensions);
    const fob = getFOB(product);
    const text = [
      `${product.model}  ${product.name}`,
      `FOB: $${fob.toLocaleString('en-US')}`,
      `尺寸: ${product.dimensions || '-'} mm`,
      `体积: ${formatVolume(volume)}`,
    ].join('\n');

    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  };

  // --- CIF product selection ---
  const handleToggleCIFSelect = (model) => {
    setCifSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model); else next.add(model);
      return next;
    });
  };

  // --- CIF calculator helpers ---
  const FOB_MARKUP = 1.15;
  const getFOB = (p) => Number(p.fob) * FOB_MARKUP;

  const getFreight = (model, product) => {
    // Tier 1: Manual override — user typed a specific value
    if (cifFreight[model] !== undefined && cifFreight[model] !== '') return Number(cifFreight[model]);
    // Tier 2: Auto-calculated from rate × volume
    if (freightRate !== '' && Number(freightRate) > 0 && product) {
      const volume = calcVolume(product.dimensions);
      if (volume !== null) {
        return Math.round(volume * Number(freightRate));
      }
    }
    // Tier 3: Static oceanFreight from product data
    if (product?.oceanFreight) return Number(product.oceanFreight);
    return 0;
  };

  const handleFreightRateChange = (value) => {
    setFreightRate(value);
    const key = `freightRate_${form.country}`;
    if (value === '') {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  };

  const calcInsurance = (fob) => fob * 0.001;

  const calcCIF = (fob, freight) => fob + freight + calcInsurance(fob);

  const totalCIF = countryPricing?.products
    .filter(p => cifSelectedModels.has(p.model))
    .reduce((sum, p) => {
      const fob = getFOB(p);
      const f = getFreight(p.model, p);
      return sum + calcCIF(fob, f);
    }, 0) || 0;

  const handleCopyCIFSummary = () => {
    if (!countryPricing) return;
    const selected = countryPricing.products.filter(p => cifSelectedModels.has(p.model));
    const lines = ['CIF 报价汇总'];
    for (const p of selected) {
      const fob = getFOB(p);
      const f = getFreight(p.model, p);
      const ins = calcInsurance(fob);
      const cif = calcCIF(fob, f);
      lines.push(`${p.model} ${p.name} | FOB: $${fob.toLocaleString('en-US')} | 海运费: $${f.toLocaleString('en-US')} | 保险: $${ins.toFixed(2)} | CIF: $${cif.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    }
    lines.push(`总计 CIF: $${totalCIF.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

    const text = lines.join('\n');
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
    });
  };

  const QUAL_ITEMS = [
    { key: 'qualBudget', label: '预算明确？' },
    { key: 'qualAuthority', label: '决策人已接触？' },
    { key: 'qualNeed', label: '需求真实？' },
    { key: 'qualTimeline', label: '时间窗口 < 3个月？' },
  ];

  const getQualStatus = (f) => {
    const checked = QUAL_ITEMS.filter((q) => f[q.key]).length;
    const unchecked = QUAL_ITEMS.filter((q) => !f[q.key]).map((q) => q.label);
    if (checked === 4) return { text: '已验证', className: 'qual-badge-verified' };
    if (checked > 0) return { text: '待核实', className: 'qual-badge-pending', detail: unchecked.join('、') };
    return { text: '低优先级', className: 'qual-badge-low' };
  };

  const toggleQual = async (key) => {
    const updated = { ...form, [key]: !form[key] };
    setForm(updated);
    if (!isNew) {
      await updateCustomer(Number(id), { [key]: updated[key] });
    }
  };

  const updateField = (field, value) => setForm({ ...form, [field]: value });

  if (loading) return <div className="page"><p className="loading">加载中...</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn btn-back" onClick={() => navigate(-1)}>
          ← 返回
        </button>
        {!isNew && (isDeleted ? (
          <button className="btn btn-primary btn-sm" onClick={handleRestore}>
            恢复客户
          </button>
        ) : (
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>
            删除客户
          </button>
        ))}
      </div>

      {isDeleted && (
        <div className="restore-banner">
          <span>此客户已被删除，可在客户列表「已删除」筛选中找到</span>
          <button className="btn btn-primary btn-sm" onClick={handleRestore}>
            恢复客户
          </button>
        </div>
      )}

      <h2 className="page-title">{isNew ? '新增客户' : form.companyName || '客户详情'}</h2>

      {/* Section 1: Customer Info */}
      <CollapsibleSection
        title="客户信息"
        badge={form.priority === '重点' ? '重点' : form.stage}
        collapsed={collapsedSections.has('customerInfo')}
        onToggle={() => toggleSection('customerInfo')}
      >
        <div className="form">
          <label className="form-label">公司名 *</label>
          <input
            className="input"
            value={form.companyName}
            onChange={(e) => updateField('companyName', e.target.value)}
            placeholder="公司名称"
          />

          <label className="form-label">联系人</label>
          <input
            className="input"
            value={form.contactName}
            onChange={(e) => updateField('contactName', e.target.value)}
            placeholder="联系人姓名"
          />

          <label className="form-label">国家</label>
          <select
            className="select"
            value={form.country}
            onChange={(e) => updateField('country', e.target.value)}
          >
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <label className="form-label">销售阶段</label>
          <select
            className="select"
            value={form.stage}
            onChange={(e) => updateField('stage', e.target.value)}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <label className="form-label">商机编号</label>
          <input
            className="input"
            value={form.opportunityId}
            onChange={(e) => updateField('opportunityId', e.target.value)}
            placeholder="如 ZP2600460400"
          />

          <label className="form-label">商机金额 (USD)</label>
          <input
            className="input"
            type="number"
            value={form.amount || ''}
            onChange={(e) => updateField('amount', parseFloat(e.target.value) || 0)}
            placeholder="0"
            min="0"
            step="any"
          />

          <label className="form-label">状态</label>
          <select
            className="select"
            value={form.status}
            onChange={(e) => updateField('status', e.target.value)}
          >
            <option value="有效">有效</option>
            <option value="结束">结束</option>
          </select>

          <label className="form-label">客户级别</label>
          <select
            className="select"
            value={form.priority || '普通'}
            onChange={(e) => updateField('priority', e.target.value)}
          >
            <option value="普通">普通</option>
            <option value="重点">重点</option>
          </select>

          <label className="form-label">需求描述</label>
          <textarea
            className="input textarea"
            value={form.needs}
            onChange={(e) => updateField('needs', e.target.value)}
            placeholder="客户需求..."
            rows={3}
          />

          <button
            className="btn btn-primary btn-full"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </CollapsibleSection>

      {/* Section: BANT Qualification */}
      {!isNew && (() => {
        const qualStatus = getQualStatus(form);
        return (
          <CollapsibleSection
            title="资格评估"
            badge={
              <span className={`section-badge ${qualStatus.className}`}>
                {qualStatus.text}
                {qualStatus.detail && (
                  <span className="qual-badge-detail">：{qualStatus.detail}</span>
                )}
              </span>
            }
            collapsed={collapsedSections.has('qualification')}
            onToggle={() => toggleSection('qualification')}
          >
            <p className="hint" style={{ marginBottom: 10 }}>
              快速评估客户质量（BANT法则）
            </p>
            <div className="qual-list">
              {QUAL_ITEMS.map((item) => (
                <div
                  key={item.key}
                  className="qual-item"
                  onClick={() => toggleQual(item.key)}
                >
                  <span className={`qual-icon ${form[item.key] ? 'qual-icon-checked' : ''}`}>
                    {form[item.key] ? '☑' : '☐'}
                  </span>
                  <span className="qual-label">{item.label}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        );
      })()}

      {/* Section 2: Follow-up Records (moved up, right after customer info) */}
      {!isNew && (
        <CollapsibleSection
          title={`跟进记录 (${followUps.length})`}
          collapsed={collapsedSections.has('followUps')}
          onToggle={() => toggleSection('followUps')}
        >
          <div className="followup-input">
            <textarea
              className="input textarea"
              value={newFollowUp}
              onChange={(e) => setNewFollowUp(e.target.value)}
              placeholder="新增跟进记录..."
              rows={2}
            />
            <div className="followup-actions">
              <select
                className="select"
                value={followUpType}
                onChange={(e) => setFollowUpType(e.target.value)}
              >
                {availableTypes.map((t) => (
                  <option key={t} value={t}>{FOLLOWUP_TYPES[t].label}</option>
                ))}
              </select>
              <span className="interval-hint">建议{getIntervalDays(followUpType)}天后跟进</span>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleAddFollowUp}
                disabled={!newFollowUp.trim()}
              >
                添加
              </button>
            </div>
          </div>

          {followUps.length === 0 ? (
            <p className="empty">暂无跟进记录</p>
          ) : (
            <ul className="followup-list">
              {followUps.map((f) => (
                <li key={f.id} className="followup-item">
                  <span className="followup-date">
                    {new Date(f.date).toLocaleDateString('zh-CN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    <span className={`followup-type-badge type-${f.type || 'other'}`}>
                      {FOLLOWUP_TYPES[f.type || 'other']?.label || '其他'}
                    </span>
                  </span>
                  {editingFuId === f.id ? (
                    <div className="fu-edit-row">
                      <textarea
                        className="input textarea"
                        value={editingFuContent}
                        onChange={(e) => setEditingFuContent(e.target.value)}
                        rows={3}
                      />
                      <div className="fu-edit-actions">
                        <button className="btn btn-primary btn-sm" onClick={() => saveEditFu(f.id)}>保存</button>
                        <button className="btn btn-back btn-sm" onClick={cancelEditFu}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <div className="fu-content-row">
                      <p className="followup-content">{f.content}</p>
                      <button
                        className="btn btn-back btn-xs"
                        onClick={() => startEditFu(f)}
                        style={{ fontSize: 10, padding: '2px 6px', opacity: 0.6, flexShrink: 0 }}
                      >
                        ✏️
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>
      )}

      {/* Section 3: Country Product Cards */}
      {!isNew && countryPricing && (
        <CollapsibleSection
          title={`产品报价 - ${form.country}`}
          collapsed={collapsedSections.has('productPricing')}
          onToggle={() => toggleSection('productPricing')}
        >
          {countryPricing.products.length > 0 ? (
            <>
              <p className="hint" style={{ marginBottom: 10 }}>
                点击卡片选择设备，已选设备将在下方 CIF 计价中计算
              </p>
              <CountryProductCards
                products={countryPricing.products}
                selectedModels={cifSelectedModels}
                onToggleSelect={handleToggleCIFSelect}
                onCopyProduct={handleCopyProduct}
              />
            </>
          ) : (
            <p className="country-pricing-hint">暂无产品数据</p>
          )}
        </CollapsibleSection>
      )}

      {!isNew && countryPricing === null && hasProductPricing(form.country) === false && (
        <CollapsibleSection
          title={`产品报价 - ${form.country}`}
          collapsed={collapsedSections.has('productPricing')}
          onToggle={() => toggleSection('productPricing')}
        >
          <p className="country-pricing-hint">暂无该国详细报价数据</p>
        </CollapsibleSection>
      )}

      {/* Section 4: CIF Pricing Calculator */}
      {!isNew && countryPricing && countryPricing.products.length > 0 && (
        <CollapsibleSection
          title="CIF 计价"
          collapsed={collapsedSections.has('cifPricing')}
          onToggle={() => toggleSection('cifPricing')}
        >
          {cifSelectedModels.size === 0 ? (
            <p className="hint" style={{ textAlign: 'center', padding: 20 }}>
              👆 请在上方「产品报价」中点击选择需要计价的设备
            </p>
          ) : (
            <>
              <p className="hint" style={{ marginBottom: 10 }}>
                保险按 FOB × 0.1% 计算。设置海运费单价后自动计算，可逐产品手动修改。
              </p>

              {/* Freight rate per m³ */}
              <div className="cif-rate-row">
                <div className="cif-rate-input-group">
                  <label className="cif-rate-label">海运费单价</label>
                  <span className="cif-rate-currency">$</span>
                  <input
                    type="number"
                    className="input cif-rate-input"
                    placeholder="每立方米价格"
                    value={freightRate}
                    onChange={(e) => handleFreightRateChange(e.target.value)}
                    min="0"
                    step="any"
                  />
                  <span className="cif-rate-unit">/ m³</span>
                </div>
                {freightRate !== '' && Number(freightRate) > 0 && (
                  <span className="cif-rate-active-hint">选中产品自动按 体积 × 单价 计算海运费</span>
                )}
              </div>

              <div className="cif-product-list">
                {countryPricing.products
                  .filter(p => cifSelectedModels.has(p.model))
                  .map((p) => {
                    const fob = getFOB(p);
                    const freight = getFreight(p.model, p);
                    const insurance = calcInsurance(fob);
                    const cif = calcCIF(fob, freight);
                    const volume = calcVolume(p.dimensions);
                    const isFreightAuto = freightRate !== '' && Number(freightRate) > 0 && !freightOverrides.has(p.model);

                    return (
                <div key={p.seq} className="cif-product-row">
                  <div className="cif-product-header">
                    <span className="cif-product-model">{p.model}</span>
                    <span className="cif-product-name">{p.name}</span>
                  </div>
                  <div className="cif-fields">
                    <div className="cif-field">
                      <span className="cif-label">FOB</span>
                      <span className="cif-value">$ {fob.toLocaleString('en-US')}</span>
                    </div>
                    <div className="cif-field">
                      <span className="cif-label">体积</span>
                      <span className="cif-value">{formatVolume(volume)}</span>
                    </div>
                    <div className="cif-field cif-freight-field">
                      <span className="cif-label">海运费</span>
                      <div className="cif-freight-control">
                        <input
                          type="number"
                          className={`input cif-freight-input ${isFreightAuto ? 'cif-freight-auto' : ''}`}
                          placeholder="问物流"
                          value={
                            cifFreight[p.model] !== undefined
                              ? cifFreight[p.model]
                              : (freightRate !== '' && Number(freightRate) > 0 ? freight : (p.oceanFreight || ''))
                          }
                          onChange={(e) => {
                            const value = e.target.value;
                            setCifFreight(prev => {
                              const next = { ...prev };
                              if (value === '') {
                                delete next[p.model];
                              } else {
                                next[p.model] = value;
                              }
                              return next;
                            });
                            setFreightOverrides(prev => {
                              const next = new Set(prev);
                              if (value === '') {
                                next.delete(p.model);
                              } else {
                                next.add(p.model);
                              }
                              return next;
                            });
                          }}
                          min="0"
                          step="any"
                        />
                        {freightOverrides.has(p.model) ? (
                          <span className="cif-freight-badge cif-freight-badge-manual">手动</span>
                        ) : (freightRate !== '' && Number(freightRate) > 0) ? (
                          <span className="cif-freight-badge cif-freight-badge-auto">自动</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="cif-field">
                      <span className="cif-label">保险费</span>
                      <span className="cif-value cif-insurance">$ {insurance.toFixed(2)}</span>
                    </div>
                    <div className="cif-field cif-total-field">
                      <span className="cif-label">CIF</span>
                      <span className="cif-value cif-cif">$ {cif.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
                    );
                  })}
              </div>

              <div className="cif-summary">
                <span className="cif-summary-label">总计 CIF</span>
                <span className="cif-summary-value">$ {totalCIF.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>

              <button className="btn btn-primary btn-full" onClick={handleCopyCIFSummary} style={{ marginTop: 12 }}>
                复制 CIF 汇总
              </button>
            </>
          )}
        </CollapsibleSection>
      )}
      {!isNew && countryPricing === null && hasProductPricing(form.country) === false && (
        <CollapsibleSection
          title="CIF 计价"
          collapsed={collapsedSections.has('cifPricing')}
          onToggle={() => toggleSection('cifPricing')}
        >
          <p className="country-pricing-hint">暂无该国产品数据</p>
        </CollapsibleSection>
      )}
    </div>
  );
}
