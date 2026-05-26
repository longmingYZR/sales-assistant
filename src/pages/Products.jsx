import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAllDocuments, addDocument, deleteDocument,
  getAllPriceLists, addPriceList, deletePriceList,
  getAllTemplates, addTemplate, deleteTemplate,
} from '../db';
import { extractTextFromPDF, isScannedPDF } from '../utils/pdf';
import { chunkText } from '../utils/chunk';

export default function Products() {
  const [docs, setDocs] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setDocs(await getAllDocuments());
    setPriceLists(await getAllPriceLists());
    setTemplates(await getAllTemplates());
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
