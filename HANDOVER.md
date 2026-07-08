# Sales Assistant 项目交接文档

> **交接方**：longmingYZR → hermes（Claude Code）
> **项目仓库**：`longmingYZR/sales-assistant`
> **日期**：2026-07-08

---

## 1. 项目概览

Sales Assistant 是一个面向**拉美市场**的移动端销售助手 Web App，覆盖客户跟进管理、产品知识库、AI 需求分析和跨设备数据同步。

| 维度 | 说明 |
|------|------|
| **技术栈** | React 18 + Vite 5 |
| **路由** | react-router-dom (HashRouter) |
| **本地存储** | IndexedDB（idb 库封装），8 个 store |
| **AI 服务** | Claude API / DeepSeek API（Provider 模式，可切换） |
| **PDF 解析** | pdfjs-dist |
| **Excel 解析** | SheetJS (xlsx) |
| **PDF 报价单** | jsPDF + jspdf-autotable |
| **部署** | GitHub Pages 静态部署 |
| **线上地址** | `https://longmingyzr.github.io/sales-assistant/` |

---

## 2. 当前完成状态

### 2.1 ✅ 已完成的完整功能

| 模块 | 功能 | 状态 |
|------|------|------|
| **首页看板** | 跟进提醒（4类：急需行动 / 等待反馈 / 推进中 / 日常维护） | ✅ 完成 |
| | 超时客户按紧急程度自动分类+排序 | ✅ 完成 |
| | 7 阶段统计可视化卡片 | ✅ 完成 |
| | 已关闭商机回顾提醒（超过 N 天未查看） | ✅ 完成 |
| | AI 智能分析 — 本周重点客户排序 | ✅ 完成 |
| | AI 智能分析 — 成单规律总结（需 ≥3 个成交客户） | ✅ 完成 |
| | AI 智能分析 — 自由提问（如"我现在最可能成交的客户是谁？"） | ✅ 完成 |
| | 分类折叠（收起已关闭商机、日常维护等） | ✅ 完成 |
| **客户管理** | 完整 CRUD（公司名/联系人/国家/需求/商机编号/阶段/优先级） | ✅ 完成 |
| | 多维度筛选 — 按阶段 / 国家 / 优先级 / 点检状态 | ✅ 完成 |
| | 筛选状态持久化到 URL（可分享链接） | ✅ 完成 |
| | 关键字搜索 | ✅ 完成 |
| | 软删除 + 回收站（可恢复） | ✅ 完成 |
| | 僵尸客户检测（5 条规则综合判定） | ✅ 完成 |
| | 重点商机标记 | ✅ 完成 |
| | BANT 资质评分（预算/权力/需求/时间线）+ 排序权重 | ✅ 完成 |
| | 已关闭商机折叠分组 | ✅ 完成 |
| **跟进记录** | 8 种跟进类型（拜访/催款/待反馈/报价跟进/谈判推进/日常维护/其他/点检） | ✅ 完成 |
| | 按销售阶段智能推荐跟进类型 | ✅ 完成 |
| | 超时提醒（每种类型独立配置间隔 1-90 天） | ✅ 完成 |
| | 跟进记录编辑 | ✅ 完成 |
| **产品知识库** | PDF 文档上传 + 自动提取文本 + 分块存储 | ✅ 完成 |
| | Excel 价格表上传 + 解析 + AI 可引用 | ✅ 完成 |
| | Excel 报价模板上传 + 解析 | ✅ 完成 |
| | 本地全文搜索 — 倒排索引 + TF-IDF（中文 bigram + 英文分词） | ✅ 完成 |
| | AI 文档问答（基于 Claude/DeepSeek） | ✅ 完成 |
| | 搜索关键词高亮 | ✅ 完成 |
| | 文档删除管理 | ✅ 完成 |
| | 产品文档区域折叠 | ✅ 完成 |
| **国别定价** | 26 国覆盖（墨西哥/巴西/阿根廷/哥伦比亚/智利等） | ✅ 完成 |
| | 按国家展示产品卡片（型号/配置/FOB/CIF 价格） | ✅ 完成 |
| | CIF 价格计算器 — 基于体积的海运费自动计算 | ✅ 完成 |
| | CIF 计算器 — 按产品型号筛选 | ✅ 完成 |
| | 产品信息一键复制 | ✅ 完成 |
| | 运费单价记忆（按国家+产品） | ✅ 完成 |
| | 运费手动覆盖标识 | ✅ 完成 |
| **AI 需求分析助手** | 多轮对话 — 模拟资深销售顾问提问梳理需求 | ✅ 完成 |
| | 业务上下文自动注入（产品文档/价格表/模板/客户概况） | ✅ 完成 |
| | 自动提取客户信息 → 一键创建客户（extractCustomerInfo） | ✅ 完成 |
| | 对话持久化 + 自动标题生成 | ✅ 完成 |
| | 对话列表管理 | ✅ 完成 |
| **商机点检** | 批量选择客户 → 逐条填写点检意见 → 批量保存 | ✅ 完成 |
| | 点检记录展示在客户详情跟进时间线中 | ✅ 完成 |
| | 客户列表可按是否点检筛选 | ✅ 完成 |
| | 点检历史页面（按批次查看/展开/删除） | ✅ 完成 |
| | 点检后自动创建跟进记录 | ✅ 完成 |
| **报价单** | 基于 Excel 模板 + 客户信息 + 产品 → HTML 预览 | ✅ 完成 |
| | PDF 报价单导出（jsPDF） | ✅ 完成 |
| **跨设备同步** | GitHub 私有仓库同步（Contents API） | ✅ 完成 |
| | 每 5 分钟自动同步（可开关） | ✅ 完成 |
| | 逐 store 按 ID + 时间戳合并（新者胜出） | ✅ 完成 |
| | 强制推 / 强制拉 | ✅ 完成 |
| | API Key 安全隔离（不出现在同步数据中） | ✅ 完成 |
| | 已删除客户墓碑同步 | ✅ 完成 |
| | 同步进度 UI + 错误提示分类（auth/repo/network/conflict） | ✅ 完成 |
| **设置** | AI 提供商切换（Claude / DeepSeek） | ✅ 完成 |
| | 8 种跟进类型间隔独立配置 | ✅ 完成 |
| | 已关闭商机回顾间隔配置 | ✅ 完成 |
| | GitHub 同步配置 + 状态查看 | ✅ 完成 |
| | 初始种子数据一键导入（50 条拉美商机） | ✅ 完成 |

### 2.2 ⚠️ 半成品 / 需要完善的功能

| 模块 | 功能 | 现状态 | 缺失/待完善 |
|------|------|--------|------------|
| **报价单** | Excel 模板解析 + 报价生成 | 基础可用 | `parseTemplate()` 函数在 `excel.js` 中未完成完整实现；模板解析逻辑较脆弱，对非标准格式模板兼容性差 |
| **PDF 文档** | 扫描件 PDF 检测 | 有 `isScannedPDF()` | 扫描件 PDF 无法提取文本时会提示，但没有 OCR 回退方案 |
| **AI 聊天** | 产品文档问答 | 单轮问答可用 | 无对话历史管理；与需求分析助手的架构不一致 |
| **需求分析助手** | 对话管理 | 基础可用 | 没有对话删除确认；无对话导出功能 |
| **搜索** | 全文搜索 | 可用 | 索引需在每次文档变更后手动重建（已自动触发，但大文档可能较慢） |
| **CIF 计算器** | 运费计算 | 基本可用 | 保险计算已修复（FOB × 0.1%），但港杂费、境外运费等字段计算逻辑未完全实现 |

---

## 3. 未解决的 Bug / 已知问题

### 3.1 已确认的 Bug

| # | 描述 | 严重程度 | 现状 |
|---|------|---------|------|
| 1 | `Date.now()` 导致点检后跟进记录时间戳错误，已在上一个 commit (`de386e1`) 修复 | 低 | ✅ 已修复 |
| 2 | 保险费用计算错误（之前是 FOB + freight × 0.1%，应为 FOB × 0.1%），已修复 (`1a76f04`) | 低 | ✅ 已修复 |
| 3 | 文本选择时误触发卡片点击，已修复 (`5466432`) | 低 | ✅ 已修复 |

### 3.2 潜在风险 / 技术债

| # | 描述 | 影响范围 |
|---|------|---------|
| 1 | **IndexedDB 版本迁移** — `db.js` 中 v2 和 v3 都创建了 `type` 索引（重复操作），虽然 catch 了错误但代码不干净 | `db.js` |
| 2 | **API Key 前端存储** — 用户的 `aiApiKey` 存在 localStorage 中，明文存储，有 XSS 泄露风险 | `Settings.jsx`, 全局 |
| 3 | **GitHub Token 前端存储** — 同步用的 GitHub Personal Access Token 同样明文存在 localStorage | `sync.js` |
| 4 | **无错误边界** — React 没有 ErrorBoundary 组件，任何未捕获异常会导致白屏 | `App.jsx` |
| 5 | **无离线提示** — 虽然是纯前端应用，但没有 Service Worker 或 PWA 配置，网络断开时行为不明确 | 全局 |
| 6 | **模型硬编码** — Claude provider 使用 `claude-sonnet-4-20250514` 固定版本，模型过期后调用会失败 | `claude.js` |
| 7 | **大文件上传** — PDF 解析和索引构建在主线程进行，大文件会导致 UI 卡顿 | `Products.jsx` |
| 8 | **同步冲突** — 合并策略是"时间戳新者胜出"，没有处理真正冲突（两人同时编辑同一条记录） | `sync.js` |
| 9 | **没有测试** — 整个项目没有单元测试或 E2E 测试 | 全局 |
| 10 | **package-lock.json** — 随 `node_modules` 一起被 `.claudeignore` 忽略，但 npm 版本差异可能导致构建问题 | 部署 |

---

## 4. 待开发特性

以下是讨论过的"下一步要做什么"：

| 优先级 | 特性 | 说明 |
|--------|------|------|
| 🔴 高 | **错误边界 + 离线提示** | 增加生产环境的稳定性 |
| 🔴 高 | **Token 安全加固** | 考虑将 API Key 和 GitHub Token 加密存储，至少加一层混淆 |
| 🟡 中 | **PWA 化** | 添加 Service Worker + manifest.json，支持离线使用和添加到主屏幕 |
| 🟡 中 | **跟进记录附件** | 支持上传图片/文件到跟进记录 |
| 🟡 中 | **数据导出** | 支持导出客户/跟进数据为 Excel 或 CSV |
| 🟡 中 | **通知提醒** | 浏览器 Notification API 推送超时跟进提醒 |
| 🟡 中 | **多语言 UI** | 目前只有中文 UI + AI 支持西语回复，UI 本身不支持西语/英语切换 |
| 🟢 低 | **暗色模式** | 适配系统暗色主题 |
| 🟢 低 | **模型版本自动更新** | 让用户可配置模型版本，或使用最新模型 |
| 🟢 低 | **OCR 集成** | 处理扫描件 PDF，集成 Tesseract.js 或云 OCR |
| 🟢 低 | **数据分析面板** | 销售漏斗图、转化率、跟进频率统计等可视化 |

---

## 5. 数据依赖

### 5.1 价格数据

- **来源**：`拉美国家(矿机)-FOB-CIF 价格汇总表(补充信息)-2025.10.xlsx`
- **位置**：编译时通过 `scripts/convert_pricing.py` 转换为 `src/data/countryPricingData.js`
- **内容**：26 个拉美国家的矿山设备 FOB/CIF/DDP 价格
  - 产品类别：宽体车、矿卡、矿挖、破碎设备、筛分设备、钻机
  - 每产品包含：型号、名称、外形尺寸、运输重量、FOB、海运费、保险、CIF、DDP、增值税等
- **更新方式**：
  1. 修改源 Excel 文件
  2. 运行 `python scripts/convert_pricing.py`
  3. 重新构建部署
- **⚠️ 注意**：转换脚本中的 Excel 路径是硬编码的本地路径（`c:\Users\28307\Desktop\...`），换机器需修改

### 5.2 客户种子数据

- **来源**：用户商机跟踪表格（拉美商机记录）
- **位置**：`src/data/initialCustomers.js` — 50 条硬编码记录
- **内容**：每条包含商机编号、客户名称、国家、商机金额、销售阶段、当前状态、机型/需求重点、创建日期
- **更新方式**：手动修改 JS 文件；用户在设置页可通过"导入初始数据"按钮一键导入到 IndexedDB

### 5.3 运行时数据（用户数据）

- **存储**：浏览器 IndexedDB（`salesAssistant` 数据库，version 9）
- **8 个 object store**：`customers`, `followUps`, `documents`, `priceLists`, `templates`, `conversations`, `searchIndex`, `searchMeta`, `reviewSessions`
- **备份**：通过 GitHub 同步到私有仓库的 `sync/<deviceId>.json`

---

## 6. 环境说明

### 6.1 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173/sales-assistant/）
npm run dev

# 构建生产版本
npm run build     # 产物在 dist/

# 预览构建产物
npm run preview
```

**Node 版本要求**：≥ 18（GitHub Actions 使用 Node 20）

### 6.2 构建配置

- **构建工具**：Vite 5，插件 `@vitejs/plugin-react`
- **base 路径**：`/sales-assistant/`（GitHub Pages 子路径）
- **分包策略**：`pdfjs-dist` 单独拆包（约 2MB，避免阻塞主 bundle）
- **路由模式**：`HashRouter`（静态托管兼容，避免 404）

### 6.3 部署流程

1. 推送代码到 `master` 分支
2. GitHub Actions 自动触发（`.github/workflows/deploy.yml`）：
   - checkout → npm ci → npm run build → 部署 `dist/` 到 `gh-pages` 分支
3. GitHub Pages 从 `gh-pages` 分支提供服务

### 6.4 特殊配置

| 配置项 | 位置 | 说明 |
|--------|------|------|
| AI API Key | 用户浏览器 localStorage (`aiApiKey`) | 不提交到代码，每设备独立设置 |
| AI 提供商 | localStorage (`aiProvider`) | `claude` 或 `deepseek` |
| GitHub 同步 Token | localStorage (`syncGithubToken`) | 需 `repo` scope 的 Personal Access Token |
| 同步仓库 | localStorage (`syncRepo`) | 格式 `owner/repo` |
| 跟进间隔 | localStorage (`followupIntervals`) | JSON 对象，按跟进类型配置天数 |
| 已关闭商机回顾天数 | localStorage (`closedReviewDays`) | 默认 30 天 |
| CIF 运费单价 | localStorage (`freightRate_<country>`) | 按国家记忆 |

### 6.5 没有的服务端依赖

- ✅ 这是一个**纯前端应用**，没有后端服务
- ✅ AI API 调用直接从浏览器发起（CORS 已配置 `anthropic-dangerous-direct-browser-access: true`）
- ✅ 数据全在浏览器 IndexedDB 中，GitHub 同步是唯一的"后端"
- ⚠️ 这意味着 API Key 暴露在前端代码中（见第 3 节风险项）

---

## 7. 项目结构速查

```
sales-assistant/
├── .claudeignore              # 排除 node_modules, dist, .git
├── .github/workflows/deploy.yml  # GitHub Actions 自动部署
├── index.html                 # SPA 入口
├── package.json               # 依赖和脚本
├── vite.config.js             # Vite 配置（base: /sales-assistant/）
├── README.md                  # 项目说明
├── scripts/
│   └── convert_pricing.py     # Excel → JS 价格数据转换脚本
└── src/
    ├── main.jsx               # React 入口
    ├── App.jsx                # 路由 + 自动同步
    ├── App.css                # 全局样式（移动端优先）
    ├── db.js                  # IndexedDB 数据层（8 个 store + CRUD）
    ├── components/
    │   ├── Layout.jsx          # 页面布局容器（含 TabBar）
    │   ├── TabBar.jsx          # 底部导航栏
    │   └── CountryProductCards.jsx  # 国别产品卡片（CIF 选择/复制）
    ├── pages/
    │   ├── Dashboard.jsx       # 首页看板（跟进提醒/阶段统计/AI 分析/点检汇总）
    │   ├── Customers.jsx       # 客户列表（筛选/搜索/僵尸检测/点检模式）
    │   ├── CustomerDetail.jsx  # 客户详情（编辑/跟进/国别定价/CIF 计算/BANT 资质）
    │   ├── Products.jsx        # 产品库（文档/价格表/模板/全文搜索/AI 问答）
    │   ├── ProductChat.jsx     # 产品文档 AI 问答页
    │   ├── ConversationList.jsx # 需求分析对话列表
    │   ├── RequirementChat.jsx  # 需求分析多轮对话
    │   ├── Checkpoints.jsx     # 点检历史（按批次查看）
    │   └── Settings.jsx        # 设置（AI Key/提供商/跟进间隔/GitHub 同步/数据导入）
    ├── utils/
    │   ├── ai.js               # AI 调用抽象层（Provider 模式 + 业务上下文构建）
    │   ├── analysis.js         # AI 分析（优先级排序/僵尸检测/成单规律/extractCustomerInfo）
    │   ├── sync.js             # GitHub 跨设备同步引擎（拉取/合并/推送/强制推拉）
    │   ├── search.js           # 本地全文搜索（倒排索引 + TF-IDF + 中文 bigram）
    │   ├── followupTypes.js    # 跟进类型定义 + 提醒间隔 + 阶段推荐
    │   ├── countryPricing.js   # 国别定价数据查询
    │   ├── quotation.js        # PDF 报价单生成（HTML 预览 + jsPDF 导出）
    │   ├── excel.js            # Excel 价格表/模板解析
    │   ├── pdf.js              # PDF 文本提取
    │   ├── chunk.js            # 文档文本分块
    │   ├── dimensions.js       # 体积/重量计算
    │   ├── importCustomers.js  # 初始客户数据导入逻辑
    │   └── providers/
    │       ├── claude.js       # Claude API 适配器
    │       └── deepseek.js     # DeepSeek API 适配器
    └── data/
        ├── initialCustomers.js  # 初始客户种子数据（50 条）
        └── countryPricingData.js # 26 国产品定价数据（自动生成）
```

---

## 8. 关键联系人 / 资源配置

| 资源 | 说明 |
|------|------|
| **GitHub 仓库** | `longmingYZR/sales-assistant` |
| **价格源文件** | `拉美国家(矿机)-FOB-CIF 价格汇总表(补充信息)-2025.10.xlsx`（用户桌面） |
| **AI 提供商** | Claude API (`api.anthropic.com`) + DeepSeek API (`api.deepseek.com`) |
| **部署目标** | GitHub Pages (`longmingyzr.github.io/sales-assistant/`) |
| **同步用 GitHub 仓库** | 用户自建的私有仓库（设置页配置） |

---

## 9. 给 hermes 的建议

1. **先跑起来** — `npm install && npm run dev` 启动开发服务器，打开浏览器体验一遍所有功能
2. **重点关注** — `db.js`（数据层）、`sync.js`（同步引擎）、`ai.js`（AI 抽象）是三个核心模块
3. **安全优先** — Token 明文存储是最大的技术债，建议作为第一个改进项
4. **加测试** — 哪怕只给 `db.js` 加几个单元测试，也会大幅降低回归风险
5. **价格数据更新** — 如果要更新价格，找用户要最新的 Excel 文件，修改 `convert_pricing.py` 中的路径后运行
