import { useState, useEffect } from 'react';
import { getProviders } from '../utils/ai';
import { FOLLOWUP_TYPES } from '../utils/followupTypes';

export default function Settings() {
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState('claude');
  const [intervals, setIntervals] = useState({});
  const [saved, setSaved] = useState(false);
  const [showIntervals, setShowIntervals] = useState(false);

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
        <div className="collapse-header" onClick={() => setShowIntervals(!showIntervals)}>
          <h3 style={{ marginBottom: 0 }}>跟进提醒设置</h3>
          <span className={`collapse-arrow ${showIntervals ? 'open' : ''}`}>▶</span>
        </div>
        {showIntervals && (
          <div className="collapse-body" style={{ marginTop: 10 }}>
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
          </div>
        )}
      </section>

    </div>
  );
}
