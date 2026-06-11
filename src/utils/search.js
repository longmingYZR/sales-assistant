/**
 * 本地搜索引擎 — 倒排索引 + TF-IDF 评分
 * ==========================================
 * 专为产品文档中文搜索优化：
 * - 中文：字符 bigram 分词
 * - 英文/数字：空格+标点分词 + 型号模式保留
 * - BM25 简化版评分
 * - 索引存储在 IndexedDB（searchIndex + searchMeta store）
 */

import { getDB } from '../db';

// ═══════════════════════════════════════════════
// 分词
// ═══════════════════════════════════════════════

const RE_CHINESE = /[一-鿿㐀-䶿]/;
const RE_WORD = /[a-zA-Z0-9]+/g;
const RE_MODEL = /[a-z]{1,4}\d{2,4}[a-z]?[0-9]*/gi;

/**
 * 对文本分词，返回 term → count 的 Map
 */
export function tokenize(text) {
  const terms = new Map();
  if (!text) return terms;

  const add = (t) => {
    const s = t.toLowerCase();
    if (s.length < 1) return;
    // 过滤纯标点/空白
    if (/^[\s.,;:!?()（）【】\[\]{}《》""''\-_=+]+$/.test(s)) return;
    terms.set(s, (terms.get(s) || 0) + 1);
  };

  // 提取型号关键词（优先级高）
  const models = text.match(RE_MODEL) || [];
  for (const m of models) add(m);

  // 逐字符扫描，生成中文 bigram
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (RE_CHINESE.test(ch)) {
      // 单字
      add(ch);
      // bigram
      if (i + 1 < text.length && RE_CHINESE.test(text[i + 1])) {
        add(ch + text[i + 1]);
      }
      i++;
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      // 英文/数字序列由下面的 RE_WORD 统一处理，跳过
      i++;
    } else {
      i++;
    }
  }

  // 英文/数字词（包含型号变体）
  const words = text.match(RE_WORD) || [];
  for (const w of words) {
    if (w.length >= 2 && !/^\d+$/.test(w)) {
      add(w);
    }
  }

  return terms;
}

// ═══════════════════════════════════════════════
// 索引构建
// ═══════════════════════════════════════════════

/**
 * 从所有文档构建倒排索引，存入 IndexedDB
 * 返回 { totalChunks, totalDocs }
 */
export async function buildSearchIndex() {
  const db = await getDB();
  const docs = await db.getAll('documents');

  // 清空旧索引
  await db.clear('searchIndex');
  await db.clear('searchMeta');

  const postingsMap = new Map();  // term → [{chunkIdx, docId, fileName, count}]
  const chunkMeta = [];            // chunkIdx → { text, fileName, docId }
  let chunkIdx = 0;

  for (const doc of docs) {
    const chunks = doc.chunks || [];
    for (const chunk of chunks) {
      const text = chunk.content || chunk.text || '';
      if (!text || text.length < 10) continue;

      chunkMeta.push({
        text,
        fileName: doc.fileName,
        docId: doc.id,
      });

      const termCounts = tokenize(text);
      for (const [term, count] of termCounts) {
        if (!postingsMap.has(term)) {
          postingsMap.set(term, []);
        }
        postingsMap.get(term).push({ chunkIdx, docId: doc.id, fileName: doc.fileName, count });
      }

      chunkIdx++;
    }
  }

  // 批量写入 postings
  const tx = db.transaction('searchIndex', 'readwrite');
  const batch = [];
  for (const [term, postings] of postingsMap) {
    // 限制每个 term 的 postings 数组大小（避免一个高频词导致记录过大）
    const p = postings.length > 500 ? postings.slice(0, 500) : postings;
    batch.push({ term, postings: p });
  }
  await Promise.all(batch.map((r) => tx.store.put(r)));
  await tx.done;

  // 写入 chunk 元数据（批量，按 key 分组避免一条记录过大）
  const txMeta = db.transaction('searchMeta', 'readwrite');
  const CHUNKS_PER_KEY = 100;
  for (let i = 0; i < chunkMeta.length; i += CHUNKS_PER_KEY) {
    const group = chunkMeta.slice(i, i + CHUNKS_PER_KEY);
    await txMeta.store.put({
      key: `chunks_${Math.floor(i / CHUNKS_PER_KEY)}`,
      chunks: group,
    });
  }
  await txMeta.store.put({
    key: 'stats',
    totalChunks: chunkMeta.length,
    totalDocs: docs.length,
    builtAt: Date.now(),
  });
  await txMeta.done;

  return { totalChunks: chunkMeta.length, totalDocs: docs.length };
}

// ═══════════════════════════════════════════════
// 搜索
// ═══════════════════════════════════════════════

/**
 * 本地搜索：分词查询 → 倒排索引检索 → TF-IDF 评分 → 返回 topK 结果
 *
 * @param {string} query - 查询字符串
 * @param {number} topK - 返回结果数量（默认 15）
 * @returns {Array<{chunk: string, fileName: string, docId: number, score: number}>}
 */
export async function searchChunks(query, topK = 15) {
  const db = await getDB();

  // 读取索引统计
  const stats = await db.get('searchMeta', 'stats');
  if (!stats || !stats.totalChunks) return [];

  const totalChunks = stats.totalChunks;

  // 分词查询
  const queryTerms = tokenize(query);
  if (queryTerms.size === 0) return [];

  // 读取每个 term 的 postings
  const scores = new Map(); // chunkIdx → score
  const chunkInfo = new Map(); // chunkIdx → { text, fileName, docId }

  for (const [term] of queryTerms) {
    const entry = await db.get('searchIndex', term);
    if (!entry || !entry.postings) continue;

    const df = entry.postings.length; // 文档频率
    const idf = Math.log((totalChunks - df + 0.5) / (df + 0.5) + 1);

    for (const p of entry.postings) {
      const tf = p.count;
      const score = tf * idf;
      scores.set(p.chunkIdx, (scores.get(p.chunkIdx) || 0) + score);
      if (!chunkInfo.has(p.chunkIdx)) {
        chunkInfo.set(p.chunkIdx, {
          fileName: p.fileName,
          docId: p.docId,
        });
      }
    }
  }

  if (scores.size === 0) return [];

  // 按分数排序，取 topK
  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK);

  // 读取 chunk 文本
  const result = [];
  for (const [cIdx, score] of ranked) {
    // 查找 chunk 所在的 meta group
    const groupKey = `chunks_${Math.floor(cIdx / 100)}`;
    const group = await db.get('searchMeta', groupKey);
    const localIdx = cIdx % 100;
    const meta = group?.chunks?.[localIdx];
    if (meta) {
      result.push({
        chunk: meta.text,
        fileName: meta.fileName,
        docId: meta.docId,
        score: Math.round(score * 100),
      });
    }
  }

  return result;
}

// ═══════════════════════════════════════════════
// 工具
// ═══════════════════════════════════════════════

/**
 * 获取搜索索引状态
 */
export async function getSearchStats() {
  const db = await getDB();
  return (await db.get('searchMeta', 'stats')) || null;
}

/**
 * 高亮关键词
 */
export function highlightText(text, query, maxLen = 200) {
  const terms = [...tokenize(query).keys()];
  if (terms.length === 0) return { snippet: text.slice(0, maxLen), highlights: [] };

  // 找到第一个匹配的位置，取周围文本
  let bestPos = -1;
  const lower = text.toLowerCase();
  for (const term of terms) {
    const pos = lower.indexOf(term);
    if (pos !== -1 && (bestPos === -1 || pos < bestPos)) {
      bestPos = pos;
    }
  }

  const start = bestPos >= 0 ? Math.max(0, bestPos - 60) : 0;
  let snippet = text.slice(start, start + maxLen);
  if (start > 0) snippet = '...' + snippet;
  if (start + maxLen < text.length) snippet += '...';

  // 收集高亮区间
  const highlights = [];
  for (const term of terms) {
    let idx = snippet.toLowerCase().indexOf(term);
    while (idx !== -1) {
      highlights.push({ start: idx, end: idx + term.length });
      idx = snippet.toLowerCase().indexOf(term, idx + 1);
    }
  }
  // 合并重叠区间
  highlights.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const h of highlights) {
    if (merged.length && h.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, h.end);
    } else {
      merged.push(h);
    }
  }

  return { snippet, highlights: merged };
}
