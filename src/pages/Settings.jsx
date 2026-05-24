import { useState, useEffect } from 'react';
import { getAllDocuments, deleteDocument } from '../db';

export default function Settings() {
  const [apiKey, setApiKey] = useState('');
  const [remindDays, setRemindDays] = useState(5);
  const [docs, setDocs] = useState([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setApiKey(localStorage.getItem('claudeApiKey') || '');
    setRemindDays(Number(localStorage.getItem('remindDays')) || 5);
    getAllDocuments().then(setDocs);
  }, []);

  const saveApiKey = () => {
    localStorage.setItem('claudeApiKey', apiKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const saveRemindDays = (val) => {
    const days = Math.max(1, Math.min(30, Number(val)));
    setRemindDays(days);
    localStorage.setItem('remindDays', days);
  };

  const handleDeleteDoc = async (id) => {
    await deleteDocument(id);
    setDocs(await getAllDocuments());
  };

  return (
    <div className="page">
      <h2 className="page-title">设置</h2>

      <section className="settings-section">
        <h3>Claude API Key</h3>
        <div className="input-row">
          <input
            type="password"
            className="input"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={saveApiKey}
            placeholder="sk-ant-..."
          />
        </div>
        {saved && <p className="hint success">已保存</p>}
        <p className="hint">API Key 仅存储在本地浏览器，不会上传到任何服务器</p>
      </section>

      <section className="settings-section">
        <h3>跟进提醒设置</h3>
        <div className="input-row">
          <label>超时提醒天数：</label>
          <input
            type="number"
            className="input short"
            value={remindDays}
            onChange={(e) => saveRemindDays(e.target.value)}
            min={1}
            max={30}
          />
        </div>
        <p className="hint">超过此天数未跟进的客户将在看板标红提醒</p>
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
