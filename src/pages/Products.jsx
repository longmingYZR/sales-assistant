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
import { searchChunks, buildSearchIndex, highlightText } from '../utils/search';

export default function Products() {
  const [docs, setDocs] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null);

  // ── Collapse state ──
  const [showDocs, setShowDocs] = useState(true);

  // ── Global Q&A state ──
  const [showChat, setShowChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null=未搜索, []=无结果
  const [searchLoading, setSearchLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState(''); // AI 总结文本
  const [aiLoading, setAiLoading] = useState(false);
  const [indexBuilt, setIndexBuilt] = useState(false);
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
  // 本地搜索（倒排索引）
  // ══════════════════════════════════════

  const ensureIndex = async () => {
    try {
      await buildSearchIndex();
      setIndexBuilt(true);
    } catch (e) {
      console.warn('索引构建失败:', e);
    }
  };

  // 文档变更后重建索引
  const loadAllAndIndex = async () => {
    await loadAll();
    await ensureIndex();
  };

  // 首次进入检查索引
  useEffect(() => {
    loadAll().then(() => {
      // 空库也标记就绪，上传文档后会重建
      setIndexBuilt(true);
    });
  }, []);

  // ── 搜索 + AI 总结 ──

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q || searchLoading) return;

    setSearchLoading(true);
    setAiSummary('');

    try {
      const results = await searchChunks(q, 15);
      setSearchResults(results);
    } catch (e) {
      console.warn('搜索失败:', e);
      setSearchResults([]);
      setMessage('搜索失败，请确保已上传文档');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleAISummary = async () => {
    const apiKey = localStorage.getItem('aiApiKey');
    if (!apiKey) {
      setMessage('请先在设置页配置 AI API Key');
      return;
    }
    if (!searchResults || searchResults.length === 0) return;

    setAiLoading(true);
    setAiSummary('');

    try {
      const providerId = localStorage.getItem('aiProvider') || 'claude';
      const topChunks = searchResults.slice(0, 5).map((r, i) => ({
        text: r.chunk,
        fileName: r.fileName,
      }));
      const systemHint = `你是一个工程机械产品知识库助手。请基于提供的产品文档片段，用简洁的中文回答用户问题。如果数据不足以回答，请明确告知。`;

      const answer = await askAI(
        `${systemHint}\n\n用户问题：${searchQuery}\n\n以下是从产品文档中匹配到的相关片段：`,
        topChunks.map((c) => ({ text: `[${c.fileName}]\n${c.text}`, fileName: c.fileName })),
        apiKey,
        providerId
      );
      setAiSummary(answer);
    } catch (err) {
      setAiSummary(`AI 总结失败：${err.message}`);
    } finally {
      setAiLoading(false);
    }
  };

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
      await loadAllAndIndex();
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
                <button className="btn btn-danger btn-sm" onClick={async () => { await deletePriceList(pl.id); loadAllAndIndex(); }}>
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
                <button className="btn btn-danger btn-sm" onClick={async () => { await deleteTemplate(tpl.id); loadAllAndIndex(); }}>
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
          <div className="collapse-header" onClick={() => setShowDocs(!showDocs)}>
            <h3 style={{ marginBottom: 0 }}>产品文档 ({docs.length})</h3>
            <span className={`collapse-arrow ${showDocs ? 'open' : ''}`}>▶</span>
          </div>
          {showDocs && (
            <div className="collapse-body">
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
                      <button className="btn btn-danger btn-sm" onClick={async () => { await deleteDocument(doc.id); loadAllAndIndex(); }}>
                        删除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {docs.length === 0 && priceLists.length === 0 && templates.length === 0 ? (
        <p className="empty">暂无文件，请上传</p>
      ) : null}

      {/* ═══ 产品知识搜索（本地检索 + AI 可选）═══ */}
      {(docs.length > 0 || priceLists.length > 0 || templates.length > 0) && (
        <section className="settings-section" style={{ borderTop: '2px solid var(--border)', marginTop: 24, paddingTop: 16 }}>
          <div className="collapse-header" onClick={() => setShowChat(!showChat)}>
            <h3 style={{ marginBottom: 0 }}>
              产品知识搜索
            </h3>
            <span className={`collapse-arrow ${showChat ? 'open' : ''}`}>▶</span>
          </div>
          {showChat && (
            <div className="collapse-body" style={{ marginTop: 10 }}>
              <p className="hint" style={{ marginBottom: 8 }}>
                本地毫秒级检索，匹配结果即时显示。可点"AI 总结"让 AI 基于匹配内容做进一步分析。
              </p>

              {/* ── 搜索栏 ── */}
              <div className="chat-input-bar">
                <textarea
                  className="input chat-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="输入关键词，如：运输尺寸、排放标准、发动机功率..."
                  rows={1}
                  disabled={searchLoading}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSearch}
                  disabled={searchLoading || !searchQuery.trim()}
                >
                  {searchLoading ? '搜索中...' : '搜索'}
                </button>
              </div>

              {/* ── 搜索结果 ── */}
              {searchResults !== null && (
                <div className="search-results" style={{ marginTop: 10 }}>
                  {searchResults.length === 0 ? (
                    <p className="hint" style={{ textAlign: 'center', padding: 12 }}>
                      未找到匹配结果，试试其他关键词
                    </p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span className="hint" style={{ margin: 0 }}>
                          找到 {searchResults.length} 条匹配结果
                        </span>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={handleAISummary}
                          disabled={aiLoading}
                        >
                          {aiLoading ? 'AI 总结中...' : '🤖 AI 总结'}
                        </button>
                      </div>

                      {searchResults.map((r, i) => {
                        const { snippet, highlights } = highlightText(r.chunk, searchQuery);
                        // 构建高亮 JSX
                        const parts = [];
                        let lastEnd = 0;
                        for (const h of highlights) {
                          if (h.start > lastEnd) {
                            parts.push(snippet.slice(lastEnd, h.start));
                          }
                          parts.push(<mark key={`h-${h.start}`} className="search-highlight">{snippet.slice(h.start, h.end)}</mark>);
                          lastEnd = h.end;
                        }
                        if (lastEnd < snippet.length) {
                          parts.push(snippet.slice(lastEnd));
                        }

                        return (
                          <div key={i} className="search-result-item">
                            <div className="search-result-source">
                              📄 {r.fileName}
                              <span className="search-result-score">{r.score}%</span>
                            </div>
                            <div className="search-result-snippet">{parts}</div>
                          </div>
                        );
                      })}

                      {/* ── AI 总结 ── */}
                      {aiSummary && (
                        <div className="ai-summary">
                          <div className="ai-summary-label">💬 AI 总结</div>
                          <div className="ai-summary-text">{aiSummary}</div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
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
