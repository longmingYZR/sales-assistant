import { useState, useEffect } from 'react';
import { getAllDocuments, deleteDocument } from '../db';
import { getProviders } from '../utils/ai';
import { FOLLOWUP_TYPES, getDefaultInterval } from '../utils/followupTypes';

export default function Settings() {
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState('claude');
  const [intervals, setIntervals] = useState({});
  const [docs, setDocs] = useState([]);
  const [saved, setSaved] = useState(false);

  const providers = getProviders();
  const currentProvider = providers.find((p) => p.id === provider) || providers[0];

  useEffect(() => {
    setApiKey(localStorage.getItem('aiApiKey') || '');
    setProvider(localStorage.getItem('aiProvider') || 'claude');
    const stored = JSON.parse(localStorage.getItem('followupIntervals') || '{}');
    const initial = {};
    for (const typeId of Object.keys(FOLLOWUP_TYPES)) {
      initial[typeId] = stored[typeId] != null ? stored[typeId] : FOLLOWUP_TYPES[typeId].defaultInterval;
    }
    setIntervals(initial);
    getAllDocuments().then(setDocs);
  }, []);

  const saveApiKey = () => {
    localStorage.setItem('aiApiKey', apiKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const saveProvider = (val) => {
    setProvider(val);
    localStorage.setItem('aiProvider', val);
  };

  const handleIntervalChange = (typeId, val) => {
    const days = Math.max(1, Math.min(90, Number(val) || 0));
    const next = { ...intervals, [typeId]: days };
    setIntervals(next);
    localStorage.setItem('followupIntervals', JSON.stringify(next));
  };

  const handleDeleteDoc = async (id) => {
    await deleteDocument(id);
    setDocs(await getAllDocuments());
  };

  return (
    <div className="page">
      <h2 className="page-title">设置</h2>

      <section className="settings-section">
        <h3>AI 提供商</h3>
        <select
          className="select"
          value={provider}
          onChange={(e) => saveProvider(e.target.value)}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </section>

      <section className="settings-section">
        <h3>{currentProvider.name} API Key</h3>
        <div className="input-row">
          <input
            type="password"
            className="input"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={saveApiKey}
            placeholder={currentProvider.keyPlaceholder}
          />
        </div>
        {saved && <p className="hint success">已保存</p>}
        <p className="hint">API Key 仅存储在本地浏览器，不会上传到任何服务器</p>
      </section>

      <section className="settings-section">
        <h3>跟进提醒设置</h3>
        <p className="hint">每种跟进类型的超时提醒间隔（超过此天数未动作将在看板提醒）</p>
        {Object.entries(FOLLOWUP_TYPES).map(([typeId, info]) => (
          <div className="input-row interval-row" key={typeId}>
            <label className="interval-label">{info.label}</label>
            <input
              type="number"
              className="input short"
              value={intervals[typeId] ?? info.defaultInterval}
              onChange={(e) => handleIntervalChange(typeId, e.target.value)}
              min={1}
              max={90}
            />
            <span className="hint">天</span>
          </div>
        ))}
      </section>

      <section className="settings-section">
        <h3>已上传文档 ({docs.length})</h3>
        {docs.length === 0 ? (
          <p className="empty">暂无文档</p>
        ) : (
          <ul className="doc-list">
            {docs.map((doc) => (
              <li key={doc.id} className="doc-item">
                <div className="doc-info">
                  <span className="doc-name">{doc.fileName}</span>
                  <span className="doc-size">
                    {(doc.fileSize / 1024).toFixed(1)} KB
                  </span>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDeleteDoc(doc.id)}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
