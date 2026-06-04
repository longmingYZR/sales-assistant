/**
 * GitHub 数据同步引擎
 * ====================
 * 通过 GitHub Contents API 在多个设备间同步 IndexedDB 数据和设置。
 *
 * 同步流程：
 *   1. 导出本地所有数据 (exportAllData)
 *   2. 从 GitHub 拉取其他设备快照
 *   3. 逐 store 按 ID + 时间戳合并 (新者胜出)
 *   4. 将合并结果写回本地 IndexedDB
 *   5. 将当前完整状态推送到 GitHub (sync/<deviceId>.json)
 *
 * 安全：aiApiKey 绝不出现在同步数据中。
 */

import {
  getAllCustomers,
  getAllCustomersRaw,
  getAllFollowUps,
  getAllDocuments,
  getAllPriceLists,
  getAllTemplates,
  getAllConversations,
} from '../db';

import { getDB } from '../db';

// ═══════════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════════

const LS_TOKEN    = 'syncGithubToken';
const LS_REPO     = 'syncRepo';
const LS_DEVICE   = 'syncDeviceId';
const LS_DEVNAME  = 'syncDeviceName';
const LS_LAST     = 'syncLastAt';

export function getSyncConfig() {
  const token  = localStorage.getItem(LS_TOKEN);
  const repo   = localStorage.getItem(LS_REPO);
  const deviceId = localStorage.getItem(LS_DEVICE);
  const deviceName = localStorage.getItem(LS_DEVNAME) || '';
  if (!token || !repo || !deviceId) return { enabled: false };
  return { enabled: true, token, repo, deviceId, deviceName };
}

export function saveSyncConfig({ token, repo, deviceId, deviceName }) {
  localStorage.setItem(LS_TOKEN, token.trim());
  localStorage.setItem(LS_REPO, repo.trim());
  localStorage.setItem(LS_DEVICE, deviceId);
  localStorage.setItem(LS_DEVNAME, deviceName);
}

export function clearSyncConfig() {
  [LS_TOKEN, LS_REPO, LS_DEVICE, LS_DEVNAME, LS_LAST].forEach(k => localStorage.removeItem(k));
}

export function generateDeviceId() {
  const id = 'dev-' + Math.random().toString(16).slice(2, 10);
  localStorage.setItem(LS_DEVICE, id);
  return id;
}

function getLastSyncAt() {
  return Number(localStorage.getItem(LS_LAST) || '0');
}

function setLastSyncAt(ts) {
  localStorage.setItem(LS_LAST, String(ts || Date.now()));
}

// ═══════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════

const STORE_NAMES = ['customers', 'followUps', 'documents', 'priceLists', 'templates', 'conversations'];

const STORE_READERS = {
  customers:     getAllCustomersRaw, // 包含墓碑，让其他设备知道删除操作
  followUps:     getAllFollowUps,
  documents:     getAllDocuments,
  priceLists:    getAllPriceLists,
  templates:     getAllTemplates,
  conversations: getAllConversations,
};

/**
 * 导出所有 IndexedDB 数据 + localStorage 设置（不含 aiApiKey）。
 */
export async function exportAllData() {
  const stores = {};
  for (const name of STORE_NAMES) {
    stores[name] = await STORE_READERS[name]();
  }

  const followupIntervals = (() => {
    try { return JSON.parse(localStorage.getItem('followupIntervals') || '{}'); }
    catch { return {}; }
  })();

  return {
    version: 1,
    stores,
    settings: {
      aiProvider: localStorage.getItem('aiProvider') || 'claude',
      followupIntervals,
    },
  };
}

// ═══════════════════════════════════════════════
// 导入
// ═══════════════════════════════════════════════

/**
 * 将同步数据写回 IndexedDB 和 localStorage。
 * @param {'merge'|'replace'} strategy
 */
export async function importData(data, strategy = 'merge') {
  const db = await getDB();

  if (strategy === 'replace') {
    // 清空所有 store
    for (const name of STORE_NAMES) {
      await db.clear(name);
    }
  }

  for (const name of STORE_NAMES) {
    const records = data.stores?.[name];
    if (!records || !Array.isArray(records)) continue;
    for (const record of records) {
      if (record.id == null) continue;
      if (strategy === 'merge') {
        const existing = await db.get(name, record.id);
        if (existing && recordTimestamp(existing) >= recordTimestamp(record)) {
          continue; // 本地更新，跳过
        }
      }
      await db.put(name, record);
    }
  }

  // 恢复设置（不含 aiApiKey）
  if (data.settings) {
    if (data.settings.aiProvider) {
      localStorage.setItem('aiProvider', data.settings.aiProvider);
    }
    if (data.settings.followupIntervals) {
      const localIntervals = (() => {
        try { return JSON.parse(localStorage.getItem('followupIntervals') || '{}'); }
        catch { return {}; }
      })();
      const merged = { ...localIntervals, ...data.settings.followupIntervals };
      localStorage.setItem('followupIntervals', JSON.stringify(merged));
    }
  }
}

// ═══════════════════════════════════════════════
// 合并引擎
// ═══════════════════════════════════════════════

/** 取记录的最大时间戳 */
function recordTimestamp(record) {
  return Math.max(
    record.createdAt   || 0,
    record.updatedAt   || 0,
    record.uploadedAt  || 0,
    record.date        || 0,
  );
}

/**
 * 合并本地记录与多个远程快照。
 * - 按 id 分组
 * - 每组取 timestamp 最大的那条
 * - 相等时本地优先
 */
function mergeRecords(localRecords, remoteSnapshots, storeName) {
  const best = new Map(); // id → { record, ts, source }

  for (const rec of localRecords) {
    best.set(rec.id, { record: rec, ts: recordTimestamp(rec), source: 'local' });
  }

  for (const snap of remoteSnapshots) {
    const records = snap.data?.stores?.[storeName];
    if (!records || !Array.isArray(records)) continue;
    for (const rec of records) {
      if (rec.id == null) continue;
      const ts = recordTimestamp(rec);
      const existing = best.get(rec.id);
      if (!existing || ts > existing.ts || (ts === existing.ts && existing.source === 'local')) {
        best.set(rec.id, { record: rec, ts, source: 'remote' });
      }
    }
  }

  return Array.from(best.values()).map(e => e.record);
}

// ═══════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  const bin = Array.from(bytes, b => String.fromCharCode(b)).join('');
  return btoa(bin);
}

function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ═══════════════════════════════════════════════
// GitHub API
// ═══════════════════════════════════════════════

const API_BASE = 'https://api.github.com';

class SyncError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code; // 'auth' | 'repo' | 'network' | 'conflict'
  }
}

async function githubApi(path, { method = 'GET', body, token, repo, sha } = {}) {
  const url = `${API_BASE}/repos/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const fetchBody = body ? JSON.stringify({
    message: `sync: update ${path}`,
    content: utf8ToBase64(body),
    ...(sha ? { sha } : {}),
  }) : undefined;

  let resp;
  try {
    resp = await fetch(url, { method, headers, body: fetchBody });
  } catch {
    throw new SyncError('网络连接失败，请检查网络', 'network');
  }

  if (resp.status === 401 || resp.status === 403) {
    throw new SyncError('GitHub Token 无效或权限不足', 'auth');
  }
  if (resp.status === 404) {
    // 区分三种 404：仓库不存在 vs 空仓库 vs 路径不存在
    const errBody = await resp.json().catch(() => ({}));
    if (errBody.message === 'This repository is empty.' || errBody.message === 'Not Found') {
      // 空仓库或路径不存在 → 返回 null，由上层处理（如 listSyncFiles 返回 []）
      return null;
    }
    throw new SyncError('仓库未找到，请检查仓库名称（格式: owner/repo）', 'repo');
  }
  if (resp.status === 409) {
    throw new SyncError('冲突', 'conflict');
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new SyncError(`GitHub API 错误 (${resp.status}): ${text.slice(0, 200)}`, 'network');
  }

  if (method === 'PUT') {
    // PUT returns { content: { sha } }
    const json = await resp.json();
    return { sha: json.content.sha };
  }

  if (method === 'GET' || resp.status === 200) {
    const json = await resp.json();
    // For directory listing, returns array
    if (Array.isArray(json)) return json;
    // For file read, decode base64
    if (json.content) {
      const decoded = base64ToUtf8(json.content);
      return { data: JSON.parse(decoded), sha: json.sha };
    }
    return json;
  }

  return null;
}

async function listSyncFiles(token, repo) {
  try {
    const result = await githubApi('sync', { token, repo });
    if (Array.isArray(result)) {
      return result.filter(f => f.name.endsWith('.json'));
    }
    return [];
  } catch (e) {
    if (e.code === 'repo') throw e;
    // sync 目录不存在（首次同步）
    return [];
  }
}

async function readRemoteSnapshot(path, token, repo) {
  return githubApi(path, { token, repo });
}

async function writeSnapshot(deviceId, data, token, repo, sha = null) {
  const path = `sync/${deviceId}.json`;
  const json = JSON.stringify(data, null, 2);

  // 检查大小
  if (json.length > 900_000) {
    throw new SyncError(`同步数据过大 (${(json.length / 1024).toFixed(0)}KB)，请清理部分数据`, 'network');
  }

  return githubApi(path, { method: 'PUT', body: json, token, repo, sha });
}

// ═══════════════════════════════════════════════
// 完整同步编排
// ═══════════════════════════════════════════════

/**
 * 执行一次完整同步。
 * @param {Function} onProgress 进度回调 ({ phase, detail })
 * @returns {{ success: boolean, stats: object }}
 */
export async function syncAll(onProgress = () => {}) {
  const config = getSyncConfig();
  if (!config.enabled) {
    throw new SyncError('请先配置 GitHub 同步', 'config');
  }
  const { token, repo, deviceId, deviceName } = config;

  const log = (phase, detail) => onProgress({ phase, detail });

  // ── Phase 1: 导出本地数据 ──
  log('export', '读取本地数据...');
  const localData = await exportAllData();

  // ── Phase 2: 拉取远程快照 ──
  log('fetch', '获取远程快照...');
  const files = await listSyncFiles(token, repo);
  log('fetch', `找到 ${files.length} 个设备快照`);

  const remoteSnapshots = [];
  for (const file of files) {
    if (file.name === `${deviceId}.json`) continue; // 跳过自己的旧快照
    try {
      const result = await readRemoteSnapshot(file.path, token, repo);
      if (result && result.data) {
        remoteSnapshots.push({
          deviceId: file.name.replace('.json', ''),
          data: result.data,
        });
        log('fetch', `已读取: ${file.name}`);
      }
    } catch (e) {
      log('fetch', `警告: 跳过 ${file.name}（${e.message}）`);
    }
  }

  // ── Phase 3: 合并 ──
  const stats = {};
  const db = await getDB();

  for (const storeName of STORE_NAMES) {
    const localRecords = localData.stores[storeName] || [];
    const merged = mergeRecords(localRecords, remoteSnapshots, storeName);
    stats[storeName] = merged.length;

    // 检测新增/更新的记录
    const newOrUpdated = merged.filter(m => {
      const local = localRecords.find(r => r.id === m.id);
      return !local || recordTimestamp(m) > recordTimestamp(local);
    });

    log('merge', `${storeName}: ${merged.length} 条 (新增/更新 ${newOrUpdated.length})`);

    // 写入合并结果
    for (const record of newOrUpdated) {
      await db.put(storeName, record);
    }
  }

  // 合并设置
  const localIntervals = (() => {
    try { return JSON.parse(localStorage.getItem('followupIntervals') || '{}'); }
    catch { return {}; }
  })();

  if (remoteSnapshots.length > 0) {
    for (const snap of remoteSnapshots) {
      const remoteIntervals = snap.data?.settings?.followupIntervals;
      if (remoteIntervals) {
        Object.assign(localIntervals, remoteIntervals);
      }
    }
    localStorage.setItem('followupIntervals', JSON.stringify(localIntervals));

    // aiProvider: 本地优先
    const remoteProvider = remoteSnapshots[remoteSnapshots.length - 1]?.data?.settings?.aiProvider;
    if (remoteProvider && !localStorage.getItem('aiProvider')) {
      localStorage.setItem('aiProvider', remoteProvider);
    }
  }

  // ── Phase 4: 重新导出完整状态并推送 ──
  log('push', '上传同步快照...');
  const fullData = await exportAllData();
  const syncPayload = {
    deviceId,
    deviceName,
    lastSyncAt: Date.now(),
    version: 1,
    ...fullData,
  };

  // 获取自己旧快照的 SHA（目录列表已包含 sha，无需额外请求）
  let ownSha = null;
  const ownFile = files.find(f => f.name === `${deviceId}.json`);
  if (ownFile) {
    ownSha = ownFile.sha; // 直接从目录列表取，避免再读文件内容（可能 JSON 解析失败）
  }

  // 重试写入（处理 409 冲突）
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await writeSnapshot(deviceId, syncPayload, token, repo, ownSha);
      break;
    } catch (e) {
      if (e.code === 'conflict' && attempt < 2) {
        log('push', `冲突，重试 (${attempt + 2}/3)...`);
        // 重新获取 SHA
        try {
          const refetch = await readRemoteSnapshot(`sync/${deviceId}.json`, token, repo);
          if (refetch) ownSha = refetch.sha;
        } catch { /* 用旧 SHA 再试 */ }
        await new Promise(r => setTimeout(r, 500));
      } else {
        throw e;
      }
    }
  }

  // ── Phase 5: 完成 ──
  setLastSyncAt(Date.now());
  log('done', '同步完成 ✓');

  return {
    success: true,
    stats,
    deviceCount: remoteSnapshots.length,
  };
}

/**
 * 强制拉取：用远程数据覆盖本地。
 */
export async function forcePull(onProgress = () => {}) {
  const config = getSyncConfig();
  if (!config.enabled) throw new SyncError('请先配置 GitHub 同步', 'config');
  const { token, repo, deviceId } = config;

  const log = (phase, detail) => onProgress({ phase, detail });

  log('fetch', '获取所有远程快照...');
  const files = await listSyncFiles(token, repo);
  const snapshots = [];

  for (const file of files) {
    try {
      const result = await readRemoteSnapshot(file.path, token, repo);
      if (result && result.data) {
        snapshots.push({ deviceId: file.name.replace('.json', ''), data: result.data });
        log('fetch', `已读取: ${file.name}`);
      }
    } catch (e) {
      log('fetch', `警告: 跳过 ${file.name}`);
    }
  }

  if (snapshots.length === 0) {
    throw new SyncError('远程没有任何快照数据', 'repo');
  }

  // 合并所有远程快照（不含本地数据）
  const db = await getDB();
  for (const storeName of STORE_NAMES) {
    const merged = mergeRecords([], snapshots, storeName);
    await db.clear(storeName);
    for (const record of merged) {
      await db.put(storeName, record);
    }
    log('merge', `${storeName}: 导入 ${merged.length} 条`);
  }

  // 设置
  if (snapshots.length > 0) {
    const last = snapshots[snapshots.length - 1];
    if (last.data.settings?.aiProvider) {
      localStorage.setItem('aiProvider', last.data.settings.aiProvider);
    }
    if (last.data.settings?.followupIntervals) {
      localStorage.setItem('followupIntervals', JSON.stringify(last.data.settings.followupIntervals));
    }
  }

  setLastSyncAt(Date.now());
  log('done', '强制拉取完成 ✓');
  return { success: true };
}

/**
 * 强制推送：用本地数据覆盖远程。
 */
export async function forcePush(onProgress = () => {}) {
  const config = getSyncConfig();
  if (!config.enabled) throw new SyncError('请先配置 GitHub 同步', 'config');
  const { token, repo, deviceId, deviceName } = config;

  const log = (phase, detail) => onProgress({ phase, detail });

  log('export', '导出本地数据...');
  const fullData = await exportAllData();

  const syncPayload = {
    deviceId,
    deviceName,
    lastSyncAt: Date.now(),
    version: 1,
    ...fullData,
  };

  // 获取旧 SHA
  let sha = null;
  try {
    const existing = await readRemoteSnapshot(`sync/${deviceId}.json`, token, repo);
    if (existing) sha = existing.sha;
  } catch { /* 首次推送 */ }

  log('push', '上传快照...');
  await writeSnapshot(deviceId, syncPayload, token, repo, sha);
  setLastSyncAt(Date.now());
  log('done', '强制推送完成 ✓');
  return { success: true };
}

export { getLastSyncAt, STORE_NAMES };
