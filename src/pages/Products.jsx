import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllDocuments, addDocument, deleteDocument } from '../db';
import { extractTextFromPDF, isScannedPDF } from '../utils/pdf';
import { chunkText } from '../utils/chunk';

export default function Products() {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    getAllDocuments().then(setDocs);
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setMessage('');

    try {
      const text = await extractTextFromPDF(file);
      if (isScannedPDF(text)) {
        setMessage('⚠️ 此文件为扫描版，AI 可能无法读取内容，建议使用文字版 PDF');
      }

      const chunks = chunkText(text);
      await addDocument({
        fileName: file.name,
        fileSize: file.size,
        chunks,
      });

      setDocs(await getAllDocuments());
      setMessage(text.length > 0
        ? `已上传：${file.name}（提取 ${text.length} 字符，${chunks.length} 个文本块）`
        : `已上传：${file.name}，但未提取到文字内容`);
    } catch (err) {
      setMessage(`上传失败：${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id) => {
    await deleteDocument(id);
    setDocs(await getAllDocuments());
  };

  return (
    <div className="page">
      <h2 className="page-title">产品知识库</h2>

      <div className="upload-area">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleUpload}
          style={{ display: 'none' }}
          id="pdf-upload"
        />
        <label htmlFor="pdf-upload" className="btn btn-primary btn-full upload-btn">
          {uploading ? '解析中...' : '+ 上传 PDF 文档'}
        </label>
      </div>

      {message && <p className={`hint ${message.includes('失败') ? 'danger' : ''}`}>{message}</p>}

      {docs.length === 0 ? (
        <p className="empty">暂无产品文档，请上传 PDF</p>
      ) : (
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
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate(`/products/${doc.id}/chat`)}
                >
                  问答
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(doc.id)}
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
