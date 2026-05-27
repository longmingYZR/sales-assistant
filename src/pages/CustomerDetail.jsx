import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getCustomer,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  getFollowUps,
  addFollowUp,
  getAllPriceLists,
  getAllTemplates,
} from '../db';
import { FOLLOWUP_TYPES, STAGE_FOLLOWUP_TYPES, getIntervalDays } from '../utils/followupTypes';
import { exportQuotationPDF } from '../utils/quotation';
import { getCountryPricing, hasProductPricing } from '../utils/countryPricing';
import CountryProductCards from '../components/CountryProductCards';

const STAGES = ['初接触', '需求确认', '报价中', '谈判中', '成交', '搁置'];
const COUNTRIES = [
  '墨西哥', '巴西', '阿根廷', '哥伦比亚', '智利', '秘鲁',
  '厄瓜多尔', '多米尼加', '危地马拉', '巴拿马', '哥斯达黎加',
  '乌拉圭', '巴拉圭', '玻利维亚', '洪都拉斯', '萨尔瓦多', '尼加拉瓜',
];

const emptyForm = {
  companyName: '',
  contactName: '',
  country: '墨西哥',
  needs: '',
  stage: '初接触',
};

export default function CustomerDetail() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const [form, setForm] = useState(emptyForm);
  const [followUps, setFollowUps] = useState([]);
  const [newFollowUp, setNewFollowUp] = useState('');
  const [followUpType, setFollowUpType] = useState('visit');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  // Quotation flow states
  const [quoteStep, setQuoteStep] = useState('idle'); // idle | select | confirm
  const [priceLists, setPriceLists] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [quoteInfo, setQuoteInfo] = useState({ number: '', date: new Date().toISOString().slice(0, 10) });
  const [previewHtml, setPreviewHtml] = useState('');
  const [confirmed, setConfirmed] = useState({ prices: false, bank: false, terms: false });
  const [bankInfo, setBankInfo] = useState('');
  const [template, setTemplate] = useState(null);
  // Country pricing state
  const [countryPricing, setCountryPricing] = useState(null);
  const [countrySelectedSeqs, setCountrySelectedSeqs] = useState(new Set());

  const availableTypes = STAGE_FOLLOWUP_TYPES[form.stage] || ['other'];

const NAME_KEYS = ['型号', 'Model', 'model', '产品型号', '名称', 'Product', 'name', '品名', '产品名称', '产品'];

function getProductName(item) {
  for (const k of NAME_KEYS) {
    const v = item[k];
    if (v && String(v).trim().length > 0) return String(v).trim();
  }
  for (const v of Object.values(item)) {
    const s = String(v).trim();
    if (s.length > 2 && !/^\d+(\.\d+)?$/.test(s) && !s.startsWith('_')) return s;
  }
  return '产品';
}

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
    const c = await getCustomer(Number(id));
    if (!c) { navigate('/customers'); return; }
    setForm({
      companyName: c.companyName,
      contactName: c.contactName,
      country: c.country,
      needs: c.needs,
      stage: c.stage,
    });
    setFollowUps(await getFollowUps(c.id));
    // Load country pricing data
    const pricing = getCountryPricing(c.country);
    setCountryPricing(pricing);
    setCountrySelectedSeqs(new Set());
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
    if (!window.confirm('确定删除此客户及所有跟进记录？')) return;
    await deleteCustomer(Number(id));
    navigate('/customers');
  };

  // --- New Quotation Flow ---

  const openQuotation = async () => {
    const pls = await getAllPriceLists();
    const tpls = await getAllTemplates();
    setPriceLists(pls);
    setTemplates(tpls);
    if (tpls.length === 0) {
      alert('请先在产品页上传报价模板（Excel）');
      return;
    }
    setTemplate(tpls[0]); // use first template by default
    setSelectedProducts([]);
    setSearchTerm('');
    setQuoteStep('select');
  };

  // Build product list from all price lists
  const allPriceItems = priceLists.flatMap((pl) =>
    (pl.rows || []).map((row, i) => {
      const item = {};
      (pl.headers || []).forEach((h, ci) => { item[h] = row[ci] || ''; });
      item._priceListId = pl.id;
      item._rowIndex = i;
      return item;
    })
  );

  const filteredItems = searchTerm
    ? allPriceItems.filter((item) =>
        Object.values(item).some((v) =>
          String(v).toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : allPriceItems;

  const toggleProduct = (item) => {
    setSelectedProducts((prev) => {
      const exists = prev.find((p) => p._priceListId === item._priceListId && p._rowIndex === item._rowIndex);
      if (exists) return prev.filter((p) => p !== exists);
      return [...prev, { ...item, qty: 1, columns: {} }];
    });
  };

  const updateQty = (idx, qty) => {
    setSelectedProducts((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], qty: Math.max(1, Number(qty) || 1) };
      return next;
    });
  };

  const updatePriceCol = (idx, col, val) => {
    setSelectedProducts((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], columns: { ...next[idx].columns, [col]: val } };
      return next;
    });
  };

  const goToConfirm = () => {
    if (selectedProducts.length === 0) {
      alert('请至少选择一个产品');
      return;
    }
    // Extract bank info from template
    const raw = template?.sheets?.[template?.sheetNames?.[0]] || [];
    for (const row of raw) {
      const cellStr = String(row[1] || '');
      if (cellStr.includes('Beneficiary') || cellStr.includes('Bank') || cellStr.includes('SWIFT')) {
        setBankInfo(cellStr);
      }
    }
    setQuoteInfo((prev) => ({
      ...prev,
      number: `QT${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`,
    }));
    setQuoteStep('confirm');
  };

  const handleExportPDF = () => {
    // Build priceCols from template or selected products
    const raw = template?.sheets?.[template?.sheetNames?.[0]] || [];
    const headerRow = raw.find((r) => String(r[1] || '').includes('No.')) || [];
    const priceCols = headerRow.map((h, i) => ({
      key: String(i),
      header: String(h || '').replace(/\n/g, ' '),
    }));

    const products = selectedProducts.map((p, i) => ({
      no: String(i + 1),
      product: p.name || p.model || Object.values(p)[0] || '',
      qty: p.qty,
      ...Object.fromEntries(
        priceCols.slice(4, priceCols.length - 1).map((c) => [
          c.key, p.columns[c.key] || String(Object.values(p).find((v, k) => k !== 'qty' && k !== '_priceListId' && k !== '_rowIndex' && k !== 'columns' && k !== 'name' && k !== 'model' && String(v).match(/^\d/)) || ''),
        ])
      ),
    }));

    exportQuotationPDF(
      { companyName: form.companyName, contactName: form.contactName },
      products,
      priceCols,
      bankInfo,
      quoteInfo,
      { name: '', contact: '' }
    );
  };

  // --- Country product selection ---
  const handleCountryToggleSelect = (product) => {
    setCountrySelectedSeqs((prev) => {
      const next = new Set(prev);
      if (next.has(product.seq)) {
        next.delete(product.seq);
      } else {
        next.add(product.seq);
      }
      return next;
    });
  };

  const addCountryProductsToQuotation = () => {
    if (!countryPricing || countrySelectedSeqs.size === 0) return;
    // Build selected product objects compatible with quotation flow
    const selected = countryPricing.products
      .filter((p) => countrySelectedSeqs.has(p.seq))
      .map((p) => {
        // Find the FOB price key in the existing price list items
        const item = {
          _priceListId: 'country-' + countryPricing.country,
          _rowIndex: p.seq,
          _source: 'countryPricing',
          ['型号']: p.model,
          ['名称']: p.name,
          ['FOB(USD)']: p.fob,
          qty: 1,
          columns: {},
        };
        // Attach all fields so quotation can use them
        if (p.allFields) {
          Object.entries(p.allFields).forEach(([k, v]) => {
            item[k] = v;
          });
        }
        // Pre-fill key price columns in the columns map
        if (pricingModel === 'DDP' && p.ddp) {
          item.columns['DDP价(USD)'] = p.ddp;
        } else if (pricingModel === 'CIF' && p.cif) {
          item.columns['CIF港口(USD)'] = p.cif;
        }
        if (p.oceanFreight) item.columns['海运费'] = p.oceanFreight;
        return item;
      });

    setSelectedProducts((prev) => [...prev, ...selected]);
    setCountrySelectedSeqs(new Set());
    // Open quotation if not already open
    if (quoteStep === 'idle') {
      openQuotation();
    } else {
      setQuoteStep('select');
    }
  };

  const pricingModel = countryPricing?.pricingModel || '';

  const updateField = (field, value) => setForm({ ...form, [field]: value });

  if (loading) return <div className="page"><p className="loading">加载中...</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn btn-back" onClick={() => navigate(-1)}>
          ← 返回
        </button>
        {!isNew && (
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>
            删除客户
          </button>
        )}
      </div>

      <h2 className="page-title">{isNew ? '新增客户' : '客户详情'}</h2>

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

      {/* Country Product Cards */}
      {!isNew && countryPricing && (
        <section className="followup-section">
          <div className="country-pricing-header">
            <h3>产品报价 - {form.country}</h3>
            <span className={`pricing-model-badge ${countryPricing.pricingModel === 'CIF' ? 'cif' : ''}`}>
              {countryPricing.pricingModel}
            </span>
          </div>
          {countryPricing.products.length > 0 ? (
            <>
              <CountryProductCards
                products={countryPricing.products}
                pricingModel={countryPricing.pricingModel}
                selectedSeqSet={countrySelectedSeqs}
                onToggleSelect={handleCountryToggleSelect}
              />
              <div className="country-pricing-actions">
                <button
                  className="btn btn-primary btn-full"
                  disabled={countrySelectedSeqs.size === 0}
                  onClick={addCountryProductsToQuotation}
                >
                  {countrySelectedSeqs.size > 0
                    ? `将选中的 ${countrySelectedSeqs.size} 个产品加入报价单`
                    : '请选择产品加入报价单'}
                </button>
              </div>
            </>
          ) : (
            <p className="country-pricing-hint">暂无产品数据</p>
          )}
        </section>
      )}

      {!isNew && countryPricing === null && hasProductPricing(form.country) === false && (
        <section className="followup-section">
          <h3>产品报价 - {form.country}</h3>
          <p className="country-pricing-hint">暂无该国详细报价数据</p>
        </section>
      )}

      {!isNew && (
        <section className="followup-section">
          <h3>跟进记录 ({followUps.length})</h3>

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
        </section>
      )}

      {!isNew && (
        <section className="followup-section">
          <h3>报价单生成</h3>

          {quoteStep === 'idle' && (
            <button className="btn btn-primary btn-full" onClick={openQuotation}>
              生成报价单
            </button>
          )}

          {/* Step 1: Select products */}
          {quoteStep === 'select' && (
            <div className="quote-select">
              <h4>选择产品</h4>
              <input
                className="input"
                placeholder="搜索型号/名称..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {filteredItems.length === 0 ? (
                <p className="empty">未找到产品，请先在产品页上传价格表</p>
              ) : (
                <div className="quote-product-grid">
                  {filteredItems.map((item, i) => {
                    const sel = selectedProducts.find((p) => p._priceListId === item._priceListId && p._rowIndex === item._rowIndex);
                    return (
                      <div
                        key={i}
                        className={`quote-product-card ${sel ? 'selected' : ''}`}
                        onClick={() => toggleProduct(item)}
                      >
                        {sel && <span className="card-check">&#10003;</span>}
                        <span className="card-name">{getProductName(item)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="quote-actions">
                <button className="btn btn-back" onClick={() => setQuoteStep('idle')}>取消</button>
                <button className="btn btn-primary" onClick={goToConfirm}>
                  下一步（{selectedProducts.length} 个产品）
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Confirm & export */}
          {quoteStep === 'confirm' && (
            <div className="quote-confirm">
              <h4>确认报价信息</h4>
              <p className="hint">报价单号：{quoteInfo.number} &nbsp; 日期：{quoteInfo.date}</p>

              {/* Product table with editable prices */}
              <div className="confirm-section">
                <h5 className={!confirmed.prices ? 'confirm-warn' : 'confirm-ok'}>
                  {!confirmed.prices ? '⚠ 请确认产品价格及费用' : '✓ 价格已确认'}
                </h5>
                {selectedProducts.map((p, idx) => {
                  const name = p['名称'] || p['型号'] || p['Product'] || p['model'] || p['name'] || '';
                  const priceKeys = Object.keys(p).filter((k) =>
                    k !== '_priceListId' && k !== '_rowIndex' && k !== 'columns' && k !== 'qty' && k !== 'name' && k !== 'model' &&
                    (String(p[k]).match(/^\d+(\.\d+)?$/) || /价|Price|price|单价|Unit/.test(k))
                  );
                  return (
                    <div key={idx} className="confirm-product-row">
                      <span className="confirm-product-name">{name}</span>
                      <input type="number" className="input short" value={p.qty} onChange={(e) => updateQty(idx, e.target.value)} min={1} />
                      {priceKeys.map((pk) => (
                        <input
                          key={pk}
                          type="text"
                          className="input short"
                          value={p.columns[pk] || p[pk] || ''}
                          onChange={(e) => updatePriceCol(idx, pk, e.target.value)}
                          placeholder={pk}
                        />
                      ))}
                    </div>
                  );
                })}
                <button className="btn btn-sm btn-primary" onClick={() => setConfirmed({ ...confirmed, prices: true })} disabled={confirmed.prices}>
                  {confirmed.prices ? '已确认' : '确认价格'}
                </button>
              </div>

              {/* Bank info confirmation */}
              <div className="confirm-section bank-section">
                <h5 className={!confirmed.bank ? 'confirm-warn' : 'confirm-ok'}>
                  {!confirmed.bank ? '🔴 请核对银行信息（敏感）' : '✓ 银行已确认'}
                </h5>
                <textarea
                  className="input textarea"
                  value={bankInfo}
                  onChange={(e) => setBankInfo(e.target.value)}
                  rows={5}
                  placeholder="银行信息从模板中提取..."
                />
                <button className="btn btn-sm btn-primary" onClick={() => setConfirmed({ ...confirmed, bank: true })} disabled={confirmed.bank}>
                  {confirmed.bank ? '已确认' : '确认银行信息'}
                </button>
              </div>

              {/* Terms confirmation */}
              <div className="confirm-section">
                <h5 className={!confirmed.terms ? 'confirm-warn' : 'confirm-ok'}>
                  {!confirmed.terms ? '⚠ 请确认报价条款' : '✓ 条款已确认'}
                </h5>
                <label className="quote-check-label">
                  <input type="checkbox" checked={confirmed.terms} onChange={(e) => setConfirmed({ ...confirmed, terms: e.target.checked })} />
                  报价有效期、付款条款、交货条款已确认无误
                </label>
              </div>

              <div className="quote-actions">
                <button className="btn btn-back" onClick={() => setQuoteStep('select')}>返回选择</button>
                <button
                  className="btn btn-danger btn-full"
                  onClick={handleExportPDF}
                  disabled={!confirmed.prices || !confirmed.bank || !confirmed.terms}
                >
                  导出 PDF
                </button>
              </div>
              {(!confirmed.prices || !confirmed.bank || !confirmed.terms) && (
                <p className="hint" style={{ textAlign: 'center', marginTop: 8 }}>
                  请确认所有项目后再导出
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
