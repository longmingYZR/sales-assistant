import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAllDocuments, addDocument, deleteDocument,
  getAllPriceLists, addPriceList, deletePriceList,
  getAllTemplates, addTemplate, deleteTemplate,
} from '../db';
import { extractTextFromPDF, isScannedPDF } from '../utils/pdf';
import { chunkText } from '../utils/chunk';
import { askAI } from '../utils/ai';

export default function Products() {
  const [docs, setDocs] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null);

  // ── Global Q&A state ──
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setDocs(await getAllDocuments());
    setPriceLists(await getAllPriceLists());
    setTemplates(await getAllTemplates());
  };

  // ══════════════════════════════════════
  // 智能路由：判断问题类型 → 决定搜哪些数据源
  // ══════════════════════════════════════

  const classifyQuestion = (q) => {
    const lower = q.toLowerCase();
    const hasModel = /zm[cstj]\d|zt\d|zmi\d|zms\d|zmj\d|zmc\d/i.test(q);
    const hasPrice = /价格|报价|多少钱|费用|成本|折扣|precio|costo|precio/i.test(lower);
    const hasSpec = /排放|功率|尺寸|重量|产能|配置|规格|参数|型号|发动机|油耗|排放标准|motor|capacidad|potencia|especificaci/i.test(lower);
    const hasTemplate = /模板|报价单|格式|条款|付款条件|plantilla|término/i.test(lower);
    const hasCompare = /对比|区别|哪个好|推荐|比较|comparar|diferencia|recomendar/i.test(lower);

    return { hasModel, hasPrice, hasSpec, hasTemplate, hasCompare };
  };

  const buildChatContext = async (q) => {
    const types = classifyQuestion(q);
    const chunks = [];
    const sources = [];

    // 提取型号关键词用于精确过滤
    const modelMatch = q.match(/zm[cstj]\d{2,4}[a-z]?[0-9]*/gi) || [];
    const modelKWs = modelMatch.map((m) => m.toUpperCase());

    // ── PDF 文档：规格/参数类问题 或 综合对比 ──
    const searchDocs = types.hasSpec || types.hasCompare || modelKWs.length > 0;
    if (searchDocs) {
      const docs = await getAllDocuments();
      for (const doc of docs) {
        for (const chunk of doc.chunks) {
          const text = chunk.text || '';
          // 有型号关键词时做精确过滤，否则全部纳入
          if (modelKWs.length > 0) {
            if (modelKWs.some((kw) => text.toUpperCase().includes(kw))) {
              chunks.push({ ...chunk, fileName: doc.fileName });
            }
          } else if (text.length > 20) {
            chunks.push({ ...chunk, fileName: doc.fileName });
          }
        }
      }
      if (chunks.length > 0) sources.push('产品文档');
    }

    // ── 价格表：价格类问题 或 带型号查询 ──
    const searchPrices = types.hasPrice || types.hasCompare || modelKWs.length > 0;
    if (searchPrices) {
      const pls = await getAllPriceLists();
      for (const pl of pls) {
        const headers = pl.headers || [];
        const modelIdx = headers.findIndex((h) => /型号|Model|model|Part/i.test(h));
        let matchingRows = pl.rows || [];
        if (modelKWs.length > 0 && modelIdx >= 0) {
          matchingRows = matchingRows.filter((row) =>
            modelKWs.some((kw) => String(row[modelIdx] || '').toUpperCase().includes(kw))
          );
        }
        if (matchingRows.length > 0) {
          const headerText = headers.join('\t');
          const rowTexts = matchingRows.slice(0, 30).map((r) => r.join('\t'));
          const text = [headerText, ...rowTexts].join('\n');
          chunks.push({ text, fileName: pl.fileName, isPriceList: true });
        }
      }
      if (pls.length > 0) sources.push('价格表');
    }

    // ── 模板 ──
    if (types.hasTemplate) {
      const tpls = await getAllTemplates();
      for (const tpl of tpls) {
        const summary = tpl.sheetNames?.map((n) => `Sheet: ${n}`).join(', ') || '';
        chunks.push({ text: `报价模板：${tpl.fileName}，包含：${summary}`, fileName: tpl.fileName, isTemplate: true });
      }
      if (tpls.length > 0) sources.push('报价模板');
    }

    // 如果没有匹配到任何数据源，默认用全部
    if (chunks.length === 0) {
      const [docs, pls, tpls] = await Promise.all([
        getAllDocuments(), getAllPriceLists(), getAllTemplates(),
      ]);
      for (const doc of docs) {
        for (const chunk of doc.chunks) {
          chunks.push({ ...chunk, fileName: doc.fileName });
        }
      }
      for (const pl of pls) {
        const headerText = (pl.headers || []).join('\t');
        const rowTexts = (pl.rows || []).slice(0, 20).map((r) => r.join('\t'));
        chunks.push({ text: [headerText, ...rowTexts].join('\n'), fileName: pl.fileName });
      }
      sources.push('全部文档');
    }

    return { chunks, sources };
  };

  // ── Chat handlers ──

  const handleChatSend = async () => {
    const q = chatInput.trim();
    if (!q || chatLoading) return;

    const apiKey = localStorage.getItem('aiApiKey');
    if (!apiKey) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'user', text: q },
        { role: 'assistant', text: '请先在设置页配置 AI API Key' },
      ]);
      setChatInput('');
      return;
    }

    const userMsg = { role: 'user', text: q };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const { chunks, sources } = await buildChatContext(q);
      const providerId = localStorage.getItem('aiProvider') || 'claude';

      const systemHint = `你是一个工程机械产品知识库助手。当前搜索范围：${sources.join('、') || '全部文档'}。请基于提供的产品数据回答问题，注明数据来源文件名。如果数据不足以回答，请明确告知。`;

      const answer = await askAI(`${systemHint}\n\n问题：${q}`, chunks, apiKey, providerId);
      setChatMessages((prev) => [...prev, { role: 'assistant', text: answer }]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `错误：${err.message}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  };

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setMessage('');

    try {
      const ext = file.name.split('.').pop().toLowerCase();

      if (ext === 'pdf') {
        await handlePDF(file);
      } else if (ext === 'xls' || ext === 'xlsx') {
        // Read Excel once, detect type
        const { headers, rows, sheets, sheetNames } = await parseExcelOnce(file);
        // Check for template indicators: To/From/Bank/Beneficiary/SWIFT/报价/QUOTATION
        const allCells = (rows || []).flat().map((c) => String(c));
        const allText = [...headers.map((h) => String(h)), ...allCells].join(' ');
        const isTemplate = /To:|From:|Beneficiary|SWIFT|报价单|QUOTATION|Warranty|Remarks|Payment Terms/i.test(allText);
        if (isTemplate) {
          await handleTemplateResult(file.name, sheets, sheetNames);
        } else {
          await handlePriceListResult(file.name, headers, rows);
        }
      } else {
        throw new Error('不支持的文件格式，请上传 PDF 或 Excel 文件');
      }
      await loadAll();
    } catch (err) {
      setMessage(`操作失败：${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePDF = async (file) => {
    const text = await extractTextFromPDF(file);
    if (isScannedPDF(text)) {
      setMessage('此 PDF 为扫描版，AI 可能无法读取内容。建议上传文字版 PDF');
    }
    const chunks = chunkText(text);
    await addDocument({ fileName: file.name, fileSize: file.size, chunks });
    setMessage(text.length > 0
      ? `已上传：${file.name}（${text.length} 字符，${chunks.length} 块）`
      : `已上传：${file.name}，但未提取到文字`);
  };

  const handlePriceListResult = async (fileName, headers, rows) => {
    await addPriceList({ fileName, headers, rows });
    setMessage(`已导入价格表：${fileName}（${rows.length} 条产品）`);
  };

  const handleTemplateResult = async (fileName, sheets, sheetNames) => {
    await addTemplate({ fileName, sheets, sheetNames });
    setMessage(`已导入报价模板：${fileName}`);
  };

  return (
    <div className="page">
      <h2 className="page-title">产品知识库</h2>

      <div className="upload-area">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.xls,.xlsx"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          id="file-upload"
        />
        <label htmlFor="file-upload" className="btn btn-primary btn-full upload-btn">
          {uploading ? '处理中...' : '+ 上传文件'}
        </label>
        <p className="hint" style={{ textAlign: 'center' }}>
          支持 PDF（产品文档）、Excel（价格表/报价模板）
        </p>
      </div>

      {message && <p className={`hint ${message.includes('失败') ? 'danger' : ''}`}>{message}</p>}

      {/* 价格表 */}
      {priceLists.length > 0 && (
        <section className="products-section">
          <h3>价格表 ({priceLists.length})</h3>
          <ul className="doc-list">
            {priceLists.map((pl) => (
              <li key={pl.id} className="doc-item type-pricelist">
                <div className="doc-info">
                  <span className="doc-name">{pl.fileName}</span>
                  <span className="doc-size">{pl.rows?.length || 0} 条产品</span>
                </div>
                <button className="btn btn-danger btn-sm" onClick={async () => { await deletePriceList(pl.id); loadAll(); }}>
                  删除
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 报价模板 */}
      {templates.length > 0 && (
        <section className="products-section">
          <h3>报价模板 ({templates.length})</h3>
          <ul className="doc-list">
            {templates.map((tpl) => (
              <li key={tpl.id} className="doc-item type-template">
                <div className="doc-info">
                  <span className="doc-name">{tpl.fileName}</span>
                  <span className="doc-size">{tpl.sheetNames?.length || 0} sheet</span>
                </div>
                <button className="btn btn-danger btn-sm" onClick={async () => { await deleteTemplate(tpl.id); loadAll(); }}>
                  删除
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* PDF 文档 */}
      {docs.length > 0 && (
        <section className="products-section">
          <h3>产品文档 ({docs.length})</h3>
          <ul className="doc-list">
            {docs.map((doc) => (
              <li key={doc.id} className="doc-card">
                <div className="doc-main" onClick={() => navigate(`/products/${doc.id}/chat`)}>
                  <div className="doc-icon">📄</div>
                  <div className="doc-info">
                    <strong>{doc.fileName}</strong>
                    <span>{(doc.fileSize / 1024).toFixed(1)} KB · {doc.chunks.length} 块</span>
                  </div>
                </div>
                <div className="doc-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => navigate(`/products/${doc.id}/chat`)}>
                    问答
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={async () => { await deleteDocument(doc.id); loadAll(); }}>
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {docs.length === 0 && priceLists.length === 0 && templates.length === 0 ? (
        <p className="empty">暂无文件，请上传</p>
      ) : null}

      {/* ═══ 全局 AI 问答 ═══ */}
      {(docs.length > 0 || priceLists.length > 0 || templates.length > 0) && (
        <section className="products-chat-section">
          <h3 className="section-title">产品 AI 问答</h3>
          <p className="hint" style={{ marginBottom: 8 }}>
            基于全部已上传文件，按问题类型智能搜索相关数据。按 Enter 发送。
          </p>

          <div className="chat-messages" style={{ maxHeight: 300, overflow: 'auto', marginBottom: 8 }}>
            {chatMessages.length === 0 && (
              <p className="hint" style={{ textAlign: 'center', padding: 16 }}>
                试试问：ZMC300G 的排放标准是什么？ 或 这几款破碎机价格对比？
              </p>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role}`}>
                <div className="bubble-role">
                  {msg.role === 'user' ? '你' : 'AI'}
                </div>
                <div className="bubble-text">{msg.text}</div>
              </div>
            ))}
            {chatLoading && (
              <div className="chat-bubble assistant">
                <div className="bubble-role">AI</div>
                <div className="bubble-text typing">思考中...</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="chat-input-bar">
            <textarea
              className="input chat-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              placeholder="输入问题，按 Enter 发送..."
              rows={1}
              disabled={chatLoading}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleChatSend}
              disabled={chatLoading || !chatInput.trim()}
            >
              发送
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// Read Excel file once, return both price list and template views
async function parseExcelOnce(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const mod = await import('xlsx');
        const wb = mod.read(e.target.result, { type: 'array' });
        // Parse all sheets as template data
        const sheets = {};
        for (const name of wb.SheetNames) {
          sheets[name] = mod.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
        }
        // First sheet's first row as headers for price list detection
        const firstSheet = sheets[wb.SheetNames[0]] || [[]];
        const headers = (firstSheet[0] || []).map((h) => String(h).trim());
        const rows = firstSheet.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''));
        resolve({ headers, rows, sheets, sheetNames: wb.SheetNames });
      } catch (err) {
        reject(new Error(`Excel 解析失败：${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsArrayBuffer(file);
  });
}
