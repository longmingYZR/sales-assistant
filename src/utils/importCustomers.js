/**
 * 商机客户数据批量导入工具
 * ==============================
 * 将用户提供的表格数据（中文列名）映射为应用字段并写入 IndexedDB。
 */

import { getDB } from '../db';

const STAGE_MAP = {
  '需求确认': '需求确认',
  '商务谈判': '谈判中',
  '采购确认': '谈判中',
  '初步意向': '初接触',
  '商机关闭': '商机关闭',
};

/**
 * 将一行原始数据映射为应用客户记录
 * @param {Object} raw - 中文列名作为 key 的原始行
 * @returns {Object} 应用格式的客户对象
 */
export function mapImportRow(raw) {
  // 金额：处理 "742,315.00" 或数字
  const amountRaw = raw['商机金额'] || raw['商机金额 (USD)'];
  let amount = 0;
  if (amountRaw != null) {
    const cleaned = String(amountRaw).replace(/,/g, '');
    amount = parseFloat(cleaned) || 0;
  }

  // 状态：仅 "结束" 映射为 结束，其余为 有效
  const statusRaw = (raw['当前状态'] || raw['状态'] || '有效').trim();
  const status = statusRaw === '结束' ? '结束' : '有效';

  // 阶段映射
  const stageRaw = (raw['销售阶段'] || '').trim();
  const stage = STAGE_MAP[stageRaw] || '初接触';

  // 创建日期
  let createdAt;
  if (raw['创建日期']) {
    const d = new Date(raw['创建日期']);
    if (!isNaN(d.getTime())) createdAt = d.getTime();
  }

  // 客户级别
  const priorityRaw = (raw['客户级别'] || raw['重点客户'] || raw['优先级'] || '').trim();
  const priority = priorityRaw === '是' || priorityRaw === '重点' || priorityRaw === 'Y' || priorityRaw === 'yes' ? '重点' : '普通';

  return {
    companyName: (raw['客户名称'] || '未命名').trim(),
    contactName: (raw['联系人'] || '').trim(),
    country: (raw['国家'] || '墨西哥').trim(),
    needs: (raw['机型/需求重点'] || raw['需求重点'] || '').trim(),
    stage,
    amount,
    opportunityId: (raw['商机编号'] || '').trim(),
    status,
    priority,
    ...(createdAt ? { createdAt } : {}),
  };
}

/**
 * 批量导入客户数据
 * @param {Array<Object>} rows - 原始数据行数组
 * @returns {Promise<number>} 成功导入的记录数
 */
export async function importCustomers(rows) {
  const db = await getDB();
  const now = Date.now();
  let count = 0;

  for (const raw of rows) {
    const customer = mapImportRow(raw);
    // 保留原始创建日期（如果有），否则用当前时间
    const createdAt = customer.createdAt || now;
    await db.add('customers', { ...customer, createdAt, updatedAt: now });
    count++;
    // 每 10 条让出主线程，保持 UI 响应
    if (count % 10 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  return count;
}
