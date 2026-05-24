import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getCustomer,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  getFollowUps,
  addFollowUp,
  getAllChunks,
} from '../db';
import { generateQuotation } from '../utils/analysis';

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
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quotation, setQuotation] = useState('');

  useEffect(() => {
    if (!isNew) {
      loadCustomer();
    }
  }, [id]);

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
    });
    setNewFollowUp('');
    setFollowUps(await getFollowUps(Number(id)));
  };

  const handleDelete = async () => {
    if (!window.confirm('确定删除此客户及所有跟进记录？')) return;
    await deleteCustomer(Number(id));
    navigate('/customers');
  };

  const handleGenerateQuote = async () => {
    const apiKey = localStorage.getItem('aiApiKey');
    const providerId = localStorage.getItem('aiProvider') || 'claude';
    if (!apiKey) { alert('请先在设置页配置 AI API Key'); return; }

    setQuoteLoading(true);
    setQuotation('');
    try {
      const chunks = await getAllChunks();
      if (chunks.length === 0) {
        setQuotation('提示：暂未上传产品文档，将生成报价单框架。建议先上传产品 PDF 以获得更准确的报价。\n\n');
      }
      const result = await generateQuotation(form, chunks, apiKey, providerId);
      setQuotation((prev) => prev + result);
    } catch (err) {
      setQuotation(`生成失败：${err.message}`);
    } finally {
      setQuoteLoading(false);
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
            <button
              className="btn btn-primary btn-sm"
              onClick={handleAddFollowUp}
              disabled={!newFollowUp.trim()}
            >
              添加
            </button>
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
          <button
            className="btn btn-primary btn-full"
            onClick={handleGenerateQuote}
            disabled={quoteLoading}
          >
            {quoteLoading ? 'AI 生成中...' : '一键生成报价单'}
          </button>
          {quotation && (
            <div className="quotation-result">{quotation}</div>
          )}
        </section>
      )}
    </div>
  );
}
