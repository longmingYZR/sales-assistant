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
  const [saving, setSaving] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  // Country pricing state
  const [countryPricing, setCountryPricing] = useState(null);
  // CIF calculator state — freight input per product model
  const [cifFreight, setCifFreight] = useState({});
  // Collapsible sections
  const [collapsedSections, setCollapsedSections] = useState(new Set(['customerInfo', 'followUps', 'productPricing', 'cifPricing']));

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
      });
    }
  };

  // --- Copy product info for logistics ---
  const handleCopyProduct = (product) => {
    const volume = calcVolume(product.dimensions);
    const text = [
      `${product.model}  ${product.name}`,
      `FOB: $${Number(product.fob).toLocaleString('en-US')}`,
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

  // --- CIF calculator helpers ---
  const getFreight = (model) => {
    if (cifFreight[model] !== undefined && cifFreight[model] !== '') return Number(cifFreight[model]);
    return 0;
  };

  const calcInsurance = (fob, freight) => (Number(fob) + freight) * 0.001;

  const calcCIF = (fob, freight) => Number(fob) + freight + calcInsurance(fob, freight);

  const totalCIF = countryPricing?.products.reduce((sum, p) => {
    const f = getFreight(p.model);
    return sum + calcCIF(p.fob, f);
  }, 0) || 0;

  const handleCopyCIFSummary = () => {
    if (!countryPricing) return;
    const lines = ['CIF 报价汇总'];
    for (const p of countryPricing.products) {
      const f = getFreight(p.model);
      const ins = calcInsurance(p.fob, f);
      const cif = calcCIF(p.fob, f);
      lines.push(`${p.model} ${p.name} | FOB: $${Number(p.fob).toLocaleString('en-US')} | 海运费: $${f.toLocaleString('en-US')} | 保险: $${ins.toFixed(2)} | CIF: $${cif.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
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
                  <p className="followup-content">{f.content}</p>
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
          badge={countryPricing.pricingModel}
          collapsed={collapsedSections.has('productPricing')}
          onToggle={() => toggleSection('productPricing')}
        >
          {countryPricing.products.length > 0 ? (
            <>
              <p className="hint" style={{ marginBottom: 10 }}>
                点击「复制信息」将 FOB 价格、尺寸和体积发送给物流人员
              </p>
              <CountryProductCards
                products={countryPricing.products}
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
          badge={countryPricing.pricingModel}
          collapsed={collapsedSections.has('cifPricing')}
          onToggle={() => toggleSection('cifPricing')}
        >
          <p className="hint" style={{ marginBottom: 10 }}>
            保险按 (FOB + 海运费) × 0.1% 计算。海运费请向物流确认后填入。
          </p>

          <div className="cif-product-list">
            {countryPricing.products.map((p) => {
              const freight = getFreight(p.model);
              const insurance = calcInsurance(p.fob, freight);
              const cif = calcCIF(p.fob, freight);
              const volume = calcVolume(p.dimensions);

              return (
                <div key={p.seq} className="cif-product-row">
                  <div className="cif-product-header">
                    <span className="cif-product-model">{p.model}</span>
                    <span className="cif-product-name">{p.name}</span>
                  </div>
                  <div className="cif-fields">
                    <div className="cif-field">
                      <span className="cif-label">FOB</span>
                      <span className="cif-value">$ {Number(p.fob).toLocaleString('en-US')}</span>
                    </div>
                    <div className="cif-field">
                      <span className="cif-label">体积</span>
                      <span className="cif-value">{formatVolume(volume)}</span>
                    </div>
                    <div className="cif-field cif-freight-field">
                      <span className="cif-label">海运费</span>
                      <input
                        type="number"
                        className="input cif-freight-input"
                        placeholder="问物流"
                        value={cifFreight[p.model] !== undefined ? cifFreight[p.model] : (p.oceanFreight || '')}
                        onChange={(e) => setCifFreight(prev => ({ ...prev, [p.model]: e.target.value }))}
                        min="0"
                        step="any"
                      />
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
