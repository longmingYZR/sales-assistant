import * as claude from './providers/claude.js';
import * as deepseek from './providers/deepseek.js';
import { getAllDocuments, getAllPriceLists, getAllTemplates, getAllCustomers } from '../db.js';

const providers = { claude, deepseek };

export function getProviders() {
  return Object.entries(providers).map(([id, p]) => ({ id, name: p.name, keyPlaceholder: p.keyPlaceholder }));
}

export function getProvider(id) {
  return providers[id] || null;
}

export async function askAI(question, chunks, apiKey, providerId = 'claude') {
  const provider = providers[providerId];
  if (!provider) throw new Error(`未知的 AI 提供商: ${providerId}`);
  return provider.ask(question, chunks, apiKey);
}

export async function chatAI(messages, systemPrompt, apiKey, providerId = 'claude') {
  const provider = providers[providerId];
  if (!provider) throw new Error(`未知的 AI 提供商: ${providerId}`);

  // 截断到最近 20 条消息，避免超出 token 限制
  const recent = messages.length > 20 ? messages.slice(-20) : messages;

  return provider.chat(recent, systemPrompt, apiKey);
}

export const ASSISTANT_SYSTEM_PROMPT = `你是一位资深的工业机械（矿用宽体车、矿卡、挖掘机、破碎筛分设备）销售技术顾问。你的任务是帮助销售经理梳理客户项目需求，通过多轮提问逐步明确需求细节，最终给出专业的设备选型和报价建议。

## 核心规则

**提问优先原则**：在未充分了解客户需求之前，绝对不要直接生成报价或推荐方案。你需要像一位经验丰富的销售经理一样，通过提问来逐步理清需求。

**关键信息清单**（按优先级排列）：
1. 客户所在国家/地区 — 决定运输方式和报价条款（FOB/CIF/DDP）
2. 项目工况 — 矿山类型（煤矿/铁矿/铜矿/砂石）、运距、坡度、工作环境温度/海拔
3. 设备类型偏好 — 矿卡吨位、宽体车品牌偏好、挖掘机吨位等
4. 各机型需求数量
5. 预算范围 — 客户是否有明确预算限制
6. 交期要求 — 紧急程度
7. 竞争对手 — 客户还在和谁谈
8. 特殊需求 — 排放标准（欧II/欧III/国四）、右舵、定制涂装等

**方案输出时机**：当你判断已掌握足够信息（通常3-5轮问答后），可以给出结构化建议：
- 推荐机型及理由
- 预估价格区间（注明是基于价格表数据还是市场估算）
- 技术参数对比
- 建议的付款和交货条款
- 竞争策略和风险提示

**语言规则**：默认用中文回复。如果用户用西班牙语提问，则用西班牙语回复。

**引用规则**：引用具体数据时注明来源（"根据价格表..." / "根据产品文档..." / "根据市场经验估算..."）。

请始终保持专业、耐心和以客户为中心的态度。不要编造具体价格数据，除非系统提供了价格表上下文。`;

/**
 * 构建业务数据上下文（产品文档、价格表、模板、客户摘要）
 * 每次 AI 调用前执行，确保 AI 了解当前可用的数据
 */
export async function buildBusinessContext() {
  let context = '';

  const documents = await getAllDocuments();
  if (documents.length > 0) {
    context += '\n## 可用的产品技术文档\n';
    for (const d of documents) {
      context += `- ${d.fileName}（${d.chunks?.length || 0} 段文本）\n`;
    }
  }

  const priceLists = await getAllPriceLists();
  if (priceLists.length > 0) {
    context += '\n## 可用的价格表\n';
    for (const pl of priceLists) {
      const headers = pl.headers || [];
      const modelColIndex = headers.findIndex(h => /型号|Model|model|Part/i.test(h));
      let sampleModels = '';
      if (modelColIndex >= 0 && pl.rows) {
        const models = new Set();
        for (const row of pl.rows) {
          const val = row[modelColIndex];
          if (val) models.add(String(val));
          if (models.size >= 8) break;
        }
        sampleModels = Array.from(models).join('、');
      }
      context += `- ${pl.fileName}（${pl.rows?.length || 0} 行`;
      if (sampleModels) context += `，型号如：${sampleModels}`;
      context += `）\n`;
    }
  }

  const templates = await getAllTemplates();
  if (templates.length > 0) {
    context += '\n## 可用的报价模板\n';
    for (const t of templates) {
      context += `- ${t.fileName}（${t.sheetNames?.length || 0} 个 sheet）\n`;
    }
  }

  const customers = await getAllCustomers();
  if (customers.length > 0) {
    const countryCounts = {};
    const stageCounts = {};
    for (const c of customers) {
      countryCounts[c.country] = (countryCounts[c.country] || 0) + 1;
      stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1;
    }
    context += '\n## 现有客户概况\n';
    context += `共 ${customers.length} 个客户。`;
    context += `国家分布：${Object.entries(countryCounts).map(([k, v]) => `${k}(${v})`).join('、')}。`;
    context += `阶段分布：${Object.entries(stageCounts).map(([k, v]) => `${k}(${v})`).join('、')}。`;
  }

  return context;
}
