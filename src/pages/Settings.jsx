import { useState, useEffect } from 'react';
import { getProviders } from '../utils/ai';
import { FOLLOWUP_TYPES } from '../utils/followupTypes';
import {
  getSyncConfig,
  saveSyncConfig,
  clearSyncConfig,
  generateDeviceId,
  getLastSyncAt,
  syncAll,
  forcePull,
  forcePush,
} from '../utils/sync';

function formatSyncTime(ts) {
  if (!ts) return '从未同步';
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Settings() {
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState('claude');
  const [intervals, setIntervals] = useState({});
  const [saved, setSaved] = useState(false);
  const [showIntervals, setShowIntervals] = useState(false);
  const [showSync, setShowSync] = useState(false);

  // ── Sync state ──
  const [syncCfg, setSyncCfg] = useState(() => getSyncConfig());
  const [syncToken, setSyncToken] = useState('');
  const [syncRepo, setSyncRepo] = useState('');
  const [syncDevName, setSyncDevName] = useState('');
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | success | error
  const [syncLog, setSyncLog] = useState([]);
  const [syncError, setSyncError] = useState('');
  const [lastSync, setLastSync] = useState(() => getLastSyncAt());

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

    // 预填同步配置
    const cfg = getSyncConfig();
    if (cfg.enabled) {
      setSyncToken(cfg.token);
      setSyncRepo(cfg.repo);
      setSyncDevName(cfg.deviceName);
    }
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

  // ── Sync handlers ──

  const handleConnectSync = () => {
    if (!syncToken.trim() || !syncRepo.trim()) return;
    const deviceId = generateDeviceId();
    const deviceName = syncDevName.trim() || '未命名设备';
    saveSyncConfig({ token: syncToken, repo: syncRepo, deviceId, deviceName });
    setSyncCfg(getSyncConfig());
    addLog('配置已保存，设备 ID: ' + deviceId);
    // 连接后立即同步
    handleSync();
  };

  const handleSync = async () => {
    setSyncStatus('syncing');
    setSyncError('');
    setSyncLog([]);
    try {
      await syncAll(({ phase, detail }) => addLog(detail));
      setSyncStatus('success');
      setLastSync(Date.now());
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (e) {
      setSyncStatus('error');
      setSyncError(e.message);
    }
  };

  const handleForcePull = async () => {
    if (!window.confirm('⚠️ 强制拉取会用远程数据覆盖本地所有数据，不可撤销。确定继续？')) return;
    setSyncStatus('syncing');
    setSyncError('');
    setSyncLog([]);
    try {
      await forcePull(({ phase, detail }) => addLog(detail));
      setSyncStatus('success');
      setLastSync(Date.now());
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (e) {
      setSyncStatus('error');
      setSyncError(e.message);
    }
  };

  const handleForcePush = async () => {
    if (!window.confirm('⚠️ 强制推送会用本地数据覆盖远程快照。确定继续？')) return;
    setSyncStatus('syncing');
    setSyncError('');
    setSyncLog([]);
    try {
      await forcePush(({ phase, detail }) => addLog(detail));
      setSyncStatus('success');
      setLastSync(Date.now());
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (e) {
      setSyncStatus('error');
      setSyncError(e.message);
    }
  };

  const handleDisconnect = () => {
    if (!window.confirm('确定断开同步？本地数据不会丢失，仅清除 GitHub 连接配置。')) return;
    clearSyncConfig();
    setSyncCfg({ enabled: false });
    setSyncToken('');
    setSyncRepo('');
    setSyncDevName('');
    setSyncLog([]);
    setSyncError('');
    setLastSync(0);
  };

  const addLog = (msg) => {
    setSyncLog((prev) => [...prev.slice(-19), msg]);
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

      {/* ── GitHub 同步 ── */}
      <section className="settings-section">
        <div className="collapse-header" onClick={() => setShowSync(!showSync)}>
          <h3 style={{ marginBottom: 0 }}>
            GitHub 同步
            {syncCfg.enabled && syncStatus === 'idle' && (
              <span className="sync-badge" style={{ marginLeft: 8, fontSize: 11, color: 'var(--success)' }}>
                ● 已连接
              </span>
            )}
            {syncStatus === 'syncing' && (
              <span className="sync-badge" style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)' }}>
                ◌ 同步中
              </span>
            )}
          </h3>
          <span className={`collapse-arrow ${showSync ? 'open' : ''}`}>▶</span>
        </div>

        {showSync && (
          <div className="collapse-body" style={{ marginTop: 10 }}>

            {/* ── 未配置 ── */}
            {!syncCfg.enabled ? (
              <div className="sync-config">
                <p className="hint" style={{ marginBottom: 12 }}>
                  通过 GitHub 私有仓库在多台设备间同步数据。
                  <br />API Key <strong>不会</strong> 同步到 GitHub，每个设备需单独配置。
                </p>

                <div className="form" style={{ gap: 8 }}>
                  <div>
                    <label className="form-label">GitHub Personal Access Token</label>
                    <input
                      type="password"
                      className="input"
                      value={syncToken}
                      onChange={(e) => setSyncToken(e.target.value)}
                      placeholder="ghp_..."
                    />
                    <p className="hint">
                      建议使用 <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">Fine-grained token</a>，
                      仅需 <code>Contents: Read and write</code>，限定目标仓库。
                    </p>
                  </div>

                  <div>
                    <label className="form-label">仓库名称</label>
                    <input
                      type="text"
                      className="input"
                      value={syncRepo}
                      onChange={(e) => setSyncRepo(e.target.value)}
                      placeholder="username/my-sync-repo"
                    />
                    <p className="hint">格式：owner/repo。建议使用<strong>私有仓库</strong>保护数据安全。</p>
                  </div>

                  <div>
                    <label className="form-label">设备名称</label>
                    <input
                      type="text"
                      className="input"
                      value={syncDevName}
                      onChange={(e) => setSyncDevName(e.target.value)}
                      placeholder="我的PC"
                    />
                  </div>

                  <button
                    className="btn btn-primary btn-full"
                    onClick={handleConnectSync}
                    disabled={!syncToken.trim() || !syncRepo.trim()}
                  >
                    连接并同步
                  </button>
                </div>
              </div>
            ) : (
              /* ── 已配置 ── */
              <div className="sync-panel">
                <div className="sync-status-bar">
                  <span className="sync-status-text">
                    设备: <strong>{syncCfg.deviceName}</strong> ({syncCfg.deviceId})
                  </span>
                  <span className="sync-status-text">
                    仓库: <strong>{syncCfg.repo}</strong>
                  </span>
                  <span className="sync-status-text">
                    上次同步: {lastSync ? formatSyncTime(lastSync) : '从未'}
                  </span>
                </div>

                {syncError && (
                  <div className="sync-error">{syncError}</div>
                )}

                {syncStatus === 'success' && (
                  <div className="sync-success">✓ 同步完成</div>
                )}

                <div className="sync-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleSync}
                    disabled={syncStatus === 'syncing'}
                  >
                    {syncStatus === 'syncing' ? '同步中...' : '立即同步'}
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={handleForcePush}
                    disabled={syncStatus === 'syncing'}
                    style={{ color: 'var(--warning)' }}
                  >
                    强制推送
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={handleForcePull}
                    disabled={syncStatus === 'syncing'}
                  >
                    强制拉取
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={handleDisconnect}
                    disabled={syncStatus === 'syncing'}
                  >
                    断开
                  </button>
                </div>

                {syncLog.length > 0 && (
                  <div className="sync-log">
                    {syncLog.map((msg, i) => (
                      <div key={i} className="sync-log-line">{msg}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

    </div>
  );
}
