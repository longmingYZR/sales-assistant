import { askAI, getProvider } from './ai';
import { getAllChunks } from '../db';

function buildCustomerPacket(customers, followUps) {
  return customers.map((c) => {
    const records = followUps
      .filter((f) => f.customerId === c.id)
      .sort((a, b) => a.date - b.date)
      .slice(-20)
      .map((f) => ({
        date: new Date(f.date).toISOString().slice(0, 10),
        content: f.content.slice(0, 200),
      }));
    return {
      name: c.contactName,
      company: c.companyName,
      country: c.country,
      stage: c.stage,
      needs: c.needs || '',
      created_at: new Date(c.createdAt).toISOString().slice(0, 10),
      follow_up_records: records,
      total_followups: followUps.filter((f) => f.customerId === c.id).length,
    };
  });
}

function formatCustomersForPrompt(customers, followUps) {
  const packet = buildCustomerPacket(customers, followUps);
  return JSON.stringify(packet, null, 2);
}

// --- 3.1 Weekly Priority Ranking ---

export async function analyzePriority(customers, followUps, apiKey, providerId) {
  if (customers.length === 0) throw new Error('暂无客户数据');
  const active = customers.filter((c) => c.stage !== '成交' && c.stage !== '搁置');
  if (active.length === 0) throw new Error('暂无活跃客户');

  const dataJson = formatCustomersForPrompt(active, followUps);

  const prompt = `你是资深工业机械 ToB 销售顾问。根据以下客户跟进数据，排出本周最值得跟进的 Top 3-5 客户。

对每个客户给出：
1. 一句话理由（基于数据中的推进速度、客户主动性、需求明确度、决策信号）
2. 一条具体的本周操作建议

输出格式：
🏆 本周重点跟进客户

① [联系人名]（[国家] · [公司]）
   [理由]
   → 建议：[具体行动]

如果活跃客户不足3个，就列出所有活跃客户。只基于提供的数据分析，不要编造信息。

客户数据：
${dataJson}`;

  const answer = await askAI(prompt, [], apiKey, providerId);
  return answer;
}

// --- 3.2 Zombie Customer Detection ---

export function detectZombieCustomers(customers, followUps) {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const zombies = [];

  for (const c of customers) {
    if (c.stage === '成交' || c.stage === '搁置' || c.stage === '商机关闭') continue;

    const records = followUps
      .filter((f) => f.customerId === c.id)
      .sort((a, b) => b.date - a.date);

    let flags = 0;
    const reasons = [];

    // Rule 1: same stage > 30 days
    const daysSinceUpdate = (now - c.updatedAt) / DAY;
    if (daysSinceUpdate > 30) {
      flags++;
      reasons.push(`阶段停留${Math.floor(daysSinceUpdate)}天无推进`);
    }

    // Rule 2: last 3 followups all initiated by sales (content doesn't mention customer reply)
    if (records.length >= 3) {
      const recent3 = records.slice(0, 3);
      const customerKeywords = ['客户', '对方', '他', '她', '回复', '主动', '追问', '询问', '提出', '要求'];
      const allSalesInitiated = recent3.every((r) => {
        return !customerKeywords.some((kw) => r.content.includes(kw));
      });
      if (allSalesInitiated) {
        flags++;
        reasons.push('最近3次跟进客户无实质回应');
      }
    }

    // Rule 3: consecutive hesitation keywords
    const hesitationKeywords = ['在考虑', '再等等', '暂时不需要', '以后再说', '再看看', '现在不需要'];
    if (records.length >= 2) {
      const recent2 = records.slice(0, 2);
      const hasHesitation = recent2.some((r) =>
        hesitationKeywords.some((kw) => r.content.includes(kw))
      );
      if (hasHesitation) {
        flags++;
        reasons.push('跟进记录中出现犹豫/推迟表述');
      }
    }

    // Rule 4: no followup > 60 days
    const lastFollowUp = records.length > 0 ? records[0].date : c.createdAt;
    const daysSinceLastFU = (now - lastFollowUp) / DAY;
    if (daysSinceLastFU > 60) {
      flags++;
      reasons.push(`最近跟进距今${Math.floor(daysSinceLastFU)}天`);
    }

    // Rule 5: last 4+ followups all feedback type → customer disengaged
    const last4Types = records.slice(0, 4).map((r) => r.type);
    if (last4Types.length >= 4 && last4Types.every((t) => t === 'feedback')) {
      flags++;
      reasons.push('连续4次等待客户反馈无实质进展');
    }

    if (flags >= 2) {
      zombies.push({
        ...c,
        zombieFlags: flags,
        zombieReasons: reasons,
        daysSinceLastFU: Math.floor(daysSinceLastFU),
      });
    }
  }

  zombies.sort((a, b) => b.zombieFlags - a.zombieFlags);
  return zombies;
}

// --- 3.3 Deal Pattern Analysis ---

export function getWonCustomers(customers) {
  return customers.filter((c) => c.stage === '成交');
}

export async function analyzeDealPatterns(customers, followUps, apiKey, providerId) {
  const won = getWonCustomers(customers);
  if (won.length < 3) throw new Error(`需要至少3个成交客户（当前${won.length}个）`);

  const wonFollowUps = followUps.filter((f) => won.some((c) => c.id === f.customerId));
  const dataJson = formatCustomersForPrompt(won, wonFollowUps);

  const prompt = `你是资深工业机械 ToB 销售分析师。根据以下已成交客户的历史数据，总结成单规律。

输出格式：
📊 成单规律总结（基于 ${won.length} 个成交案例）

1. 平均成单周期：（从初接触到成交的平均天数）
2. 最常见成交国家/地区：
3. 高频决策信号关键词：
4. 客户共同特征：
5. 建议复用策略：

只基于提供的数据分析，用中文输出。

已成交客户数据：
${dataJson}`;

  return askAI(prompt, [], apiKey, providerId);
}

// --- 3.4 Free-form Customer Q&A ---

export async function askAboutCustomers(question, customers, followUps, apiKey, providerId) {
  if (customers.length === 0) throw new Error('暂无客户数据');
  const dataJson = formatCustomersForPrompt(customers, followUps);

  const prompt = `你是资深销售顾问，正在通过分析 CRM 数据帮助销售人员。根据以下所有客户和跟进记录数据，用中文回答用户问题。

客户数据：
${dataJson}

用户问题：${question}

要求：
- 基于数据回答，不编造信息
- 涉及具体客户时，列出客户名和关键信息
- 如果有数据不足以回答的部分，诚实说明`;

  return askAI(prompt, [], apiKey, providerId);
}

// --- 5. One-click Quotation ---

export async function generateQuotation(customer, chunks, apiKey, providerId) {
  const customerInfo = {
    company: customer.companyName,
    contact: customer.contactName,
    country: customer.country,
    needs: customer.needs || '未填写',
    stage: customer.stage,
  };

  const productContext = chunks
    .map((c) => `[${c.fileName}]\n${c.content}`)
    .join('\n\n');

  const prompt = `你是专业的工业机械销售报价助手。请根据客户信息和产品资料，生成一份专业的报价单草稿。

客户信息：
${JSON.stringify(customerInfo, null, 2)}

产品资料：
${productContext || '暂无产品资料'}

请生成：
1. 报价单标题和编号（编号用日期+序号格式）
2. 客户信息栏
3. 产品报价明细表（型号、名称、数量、单价、总价 — 如果产品资料中有具体型号和价格就用，没有的话标注"待确认"）
4. 付款条款（默认：30%订金，70%发货前付清）
5. 交货条款（默认：FOB 中国主要港口，收到订金后30-45天）
6. 报价有效期（默认：30天）
7. 备注栏

用中文输出，格式专业、清晰，货币单位默认美元(USD)。如果产品资料中没有足够信息，就生成报价单框架结构，具体内容标注"待确认"。`;

  return askAI(prompt, [], apiKey, providerId);
}

// --- 6. Customer Info Extraction from Chat ---

export async function extractCustomerInfo(messages, apiKey, providerId) {
  const conversationText = messages
    .map((m) => `[${m.role === 'user' ? '销售' : 'AI'}]：${m.content}`)
    .join('\n\n');

  const prompt = `你是一个擅长从销售对话中提取结构化客户信息的助手。请从以下对话记录中提取客户信息。

对话记录：
${conversationText}

请以严格JSON格式返回提取的信息（只返回JSON对象，不要包裹在markdown代码块中，不要加任何额外说明文字）：
{
  "companyName": "公司名，未提到则为空字符串",
  "contactName": "联系人姓名，未提到则为空字符串",
  "country": "国家（使用中文名如墨西哥、巴西、阿根廷等），未提到则为空字符串",
  "needs": "需求描述，总结客户的核心需求和工况，未提到则为空字符串",
  "stage": "销售阶段猜测，只能是以下之一：初接触/需求确认/报价中/谈判中，默认初接触",
  "amount": "预算金额（纯数字如500000，未提到则为0）",
  "priority": "优先级猜测：普通 或 重点，默认普通",
  "qualBudget": true或false（从对话判断预算是否明确），
  "qualAuthority": true或false（从对话判断是否已接触到决策人），
  "qualNeed": true或false（从对话判断需求是否真实明确），
  "qualTimeline": true或false（从对话判断时间窗口是否小于3个月）
}`;

  const answer = await askAI(prompt, [], apiKey, providerId);

  // Parse JSON — strip markdown code blocks if present
  const cleaned = answer
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // Fallback: regex extract first JSON object
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error('AI返回格式无法解析，请重试');
    }
  }

  // Normalize and set defaults
  const VALID_STAGES = ['初接触', '需求确认', '报价中', '谈判中'];
  return {
    companyName: parsed.companyName || '',
    contactName: parsed.contactName || '',
    country: parsed.country || '',
    needs: parsed.needs || '',
    stage: VALID_STAGES.includes(parsed.stage) ? parsed.stage : '初接触',
    amount: Number(parsed.amount) || 0,
    priority: parsed.priority === '重点' ? '重点' : '普通',
    qualBudget: !!parsed.qualBudget,
    qualAuthority: !!parsed.qualAuthority,
    qualNeed: !!parsed.qualNeed,
    qualTimeline: !!parsed.qualTimeline,
  };
}
