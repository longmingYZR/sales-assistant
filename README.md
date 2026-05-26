# 销售助手 (Sales Assistant)

移动端优先的个人销售助手 Web App，支持客户跟进管理、产品知识库和 AI 问答。

## 技术栈

- React 18 + Vite
- IndexedDB (idb) 本地数据存储
- Claude API (claude-sonnet-4-20250514)
- pdfjs-dist PDF 文本提取
- GitHub Pages 静态部署

## 启动

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

产物在 `dist/` 目录。

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

## 使用说明

1. 在**设置**页输入 Claude API Key（存储在本地浏览器）
2. 在**客户**页添加客户及跟进记录
3. 在**产品**页上传 PDF 文档
4. 在产品库中点击**问答**，AI 将根据文档内容回答你的问题
5. **首页**看板显示超时未跟进客户和各阶段统计

## 销售阶段

初接触 → 需求确认 → 报价中 → 谈判中 → 成交 / 搁置
