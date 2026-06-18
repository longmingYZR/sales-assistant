# 销售助手 (Sales Assistant)

面向拉美市场的移动端销售助手 Web App，覆盖客户跟进管理、产品知识库、AI 需求分析和跨设备数据同步。

## 技术栈

| 类别 | 选型 |
|------|------|
| 框架 | React 18 + Vite |
| 路由 | react-router-dom (HashRouter) |
| 本地存储 | IndexedDB（idb 封装） |
| AI 服务 | Claude API / DeepSeek API（可切换） |
| PDF 解析 | pdfjs-dist |
| Excel 解析 | SheetJS (xlsx) |
| PDF 报价单 | jsPDF + jspdf-autotable |
| 部署 | GitHub Pages 静态部署 |

## 快速开始

```bash
npm install
npm run dev
```

构建：

```bash
npm run build
```

产物在 `dist/` 目录。

## 项目结构

```
src/
├── App.jsx                    # 路由定义 + 自动同步
├── App.css                    # 全局样式（移动端优先）
├── main.jsx                   # 入口
├── db.js                      # IndexedDB 数据层（8 个 store）
├── components/
│   ├── Layout.jsx             # 页面布局容器
│   ├── TabBar.jsx             # 底部导航栏
│   └── CountryProductCards.jsx # 国家产品卡片组件
├── pages/
│   ├── Dashboard.jsx          # 首页看板：跟进提醒 + 阶段统计 + AI 分析
│   ├── Customers.jsx          # 客户列表页：筛选/搜索/批量管理
│   ├── CustomerDetail.jsx     # 客户详情页：信息编辑/跟进记录/国别定价
│   ├── Products.jsx           # 产品库：文档/价格表/模板管理 + 全文搜索
│   ├── ProductChat.jsx        # 产品问答：基于文档的 AI 问答
│   ├── ConversationList.jsx   # 需求分析对话列表
│   ├── RequirementChat.jsx    # 需求分析对话：多轮 AI 需求梳理
│   └── Settings.jsx           # 设置页：API Key / 提供商 / 跟进提醒 / GitHub 同步
├── utils/
│   ├── ai.js                  # AI 调用抽象（Provider 模式）
│   ├── providers/
│   │   ├── claude.js          # Claude API 适配器
│   │   └── deepseek.js        # DeepSeek API 适配器
│   ├── analysis.js            # AI 分析：优先级排序/成单规律/自由提问
│   ├── sync.js                # GitHub 跨设备数据同步引擎
│   ├── search.js              # 本地全文搜索（倒排索引 + TF-IDF）
│   ├── followupTypes.js       # 跟进类型定义 + 提醒间隔配置
│   ├── countryPricing.js      # 国别定价数据查询
│   ├── quotation.js           # PDF 报价单生成
│   ├── excel.js               # Excel 价格表/模板解析
│   ├── pdf.js                 # PDF 文本提取
│   ├── chunk.js               # 文档文本分块
│   ├── dimensions.js          # 体积/重量计算
│   ├── importCustomers.js     # 初始客户数据导入
│   └── search.js              # 全文搜索引擎
├── data/
│   ├── initialCustomers.js    # 初始客户种子数据（50 条）
│   └── countryPricingData.js  # 26 国产品定价数据
```

## 功能概览

### 📊 首页看板

- **跟进提醒** — 按紧急程度（急需行动 / 等待反馈 / 推进中 / 日常维护）分类展示超时客户，支持点击直达详情
- **已关闭商机回顾** — 超过配置天数未查看的关闭商机自动提醒，避免遗忘
- **阶段统计** — 7 个销售阶段（初接触 → 需求确认 → 报价中 → 谈判中 → 成交 / 搁置 / 商机关闭）可视化卡片
- **AI 智能分析**
  - 本周重点客户 — AI 根据跟进记录自动排序优先级
  - 成单规律总结 — AI 分析历史成交客户特征
  - 自由提问 — 基于全量客户数据回答（如"我现在最可能成交的客户是谁？"）

### 👥 客户管理

- **完整 CRUD** — 公司名称、联系人、国家、需求描述、商机编号、阶段、优先级
- **多维度筛选** — 按阶段 / 国家 / 优先级筛选，支持搜索
- **软删除 + 回收站** — 删除的客户可恢复
- **低活跃 / 僵尸客户检测** — 自动识别长期无跟进客户
- **重点客户标记** — 支持标记「重点」/「普通」优先级

### 📝 跟进记录

- **7 种跟进类型** — 拜访、催款、待反馈、报价跟进、谈判推进、日常维护、其他
- **按阶段智能推荐** — 不同销售阶段展示对应的跟进类型
- **超时提醒** — 每种跟进类型可独立配置提醒间隔（1-90 天），超时未动作在看板醒目提醒

### 📦 产品知识库

- **PDF 文档** — 上传产品文档，自动提取文本并分块存储，支持 AI 问答
- **Excel 价格表** — 上传价格表，AI 可引用具体价格数据
- **Excel 报价模板** — 上传模板，结合客户信息生成 PDF 报价单
- **本地全文搜索** — 基于倒排索引 + TF-IDF 的中英文混合搜索，秒级响应
- **AI 文档问答** — 基于 Claude/DeepSeek 的产品知识问答，引用具体文档段落

### 🌎 国别定价

- **26 国覆盖** — 墨西哥、巴西、阿根廷、哥伦比亚、智利等拉美主要市场
- **按国家展示** — 客户详情页根据所属国家自动展示对应产品定价
- **产品卡片** — 包含型号、配置、FOB/CIF 价格等结构化数据

### 🤖 AI 需求分析助手

- **多轮对话** — 模拟资深销售顾问，通过提问逐步理清客户项目需求
- **业务上下文注入** — 自动注入产品文档、价格表、报价模板、客户概况
- **结构化建议** — 掌握足够信息后输出推荐机型、价格区间、技术对比、竞争策略
- **对话持久化** — 所有对话保存在本地，支持随时继续
- **自动标题** — 根据首条消息自动生成对话标题

### 🔄 跨设备同步

- **GitHub 私有仓库** — 通过 GitHub Contents API 在多台设备间同步数据
- **自动同步** — 每 5 分钟自动同步（可开关）
- **合并策略** — 逐 store 按 ID + 时间戳合并，新者胜出
- **强制推/拉** — 支持以本地或远程数据为准的强制覆盖
- **安全隔离** — API Key 绝不出现在同步数据中，每台设备独立配置

### ⚙️ 设置

- **AI 提供商切换** — Claude / DeepSeek 二选一，支持自定义 API Key
- **跟进间隔配置** — 7 种跟进类型 + 已关闭商机回顾间隔独立调节
- **GitHub 同步连接** — 一键配置连接，实时查看同步状态和日志
- **初始数据导入** — 一键导入 50 条拉美商机种子数据

## 销售阶段

```
初接触 → 需求确认 → 报价中 → 谈判中 → 成交
                              ↘ 搁置 → 商机关闭
```

## 部署到 GitHub Pages

1. 在 GitHub 创建仓库 `sales-assistant`
2. 推送代码到 `main` 分支
3. 使用 GitHub Actions 部署 `dist/` 到 `gh-pages` 分支：

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

4. 在仓库 Settings → Pages 中选择 `gh-pages` 分支作为源

## 使用流程

1. **设置**页配置 AI API Key（Claude 或 DeepSeek）
2. （可选）**设置**页连接 GitHub 同步，或导入初始客户数据
3. **客户**页添加客户，录入公司信息和商机阶段
4. 定期在**客户详情**页添加跟进记录
5. **首页看板**查看超时提醒和阶段统计，使用 AI 分析辅助决策
6. **产品**页上传产品文档和价格表，使用全文搜索和 AI 问答
7. 在**客户详情**页根据国别定价生成报价单
8. 使用**需求分析助手**进行多轮 AI 需求梳理
