# 索尼动态分货 Agent · 运营演示工作台

面向客户演示和产品截图的纯前端 Demo。界面呈现的是可操作的分货算法、状态流和库存校准过程，不是解决方案 PPT 的网页版。

## 本地运行

Windows 可直接双击：

```text
start-demo.bat
```

或使用 PowerShell：

```powershell
.\start-demo.ps1
```

默认地址：`http://localhost:3000`

已有 Node.js 20+ 与 pnpm 时：

```powershell
pnpm install
pnpm dev
```

## 四个操作视图

1. **分货工作台**：调整供给、额度、需求与权重；通过横向满足率轨道回放公平层和效率层；展开逐经销商审计轨迹。
2. **方案对比**：同一输入生成偏公平、均衡、偏效率三套方案，并同步采用结果。
3. **锁单看板**：演示实时额度校验、部分锁单、支付确认、主动放弃、超时释放和货量回流。
4. **周转与校准**：演示库存流量法、14 天置信区间和周一库存真值校准。

场景与 SKU 为两级数据模型：每个场景包含 3 个可选 SKU，每个 SKU 都有独立的供给、渠道、需求、额度、动销、库存和求解结果。PPT 示意场景的 WH-1000XM6 固定复现：华东数码 A 108 台、中原电子 B 50 台额度触顶、南方声学 C 52 台，总量守恒为 210 台。

## 截图模式

浏览器使用 1920×1080、100% 缩放。以下链接会隐藏重置按钮、Toast 和滚动条，并自动摆好演示状态：

- `/?shot=1&preset=workbench-result`
- `/?shot=1&preset=workbench-audit`
- `/?shot=1&preset=scenarios`
- `/?shot=1&preset=locking-timeout`
- `/?shot=1&preset=turnover-band`
- `/?shot=1&preset=calibration`

## 验证与静态交付

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

`pnpm build` 生成完全静态的 `out/`，不依赖 Node.js 服务端、数据库、SAP 或 LLM。

## 在线部署

Docker：

```powershell
docker compose up --build -d
```

访问 `http://localhost:8080`。生产环境可将镜像发布到任意容器平台，也可以把 `out/` 直接上传到 Nginx、对象存储/CDN、Cloudflare Pages 或 Vercel。

完整架构、算法和部署说明见 [docs/技术路线与在线部署.md](docs/技术路线与在线部署.md)。所有字段、标签、页面和操作的解释见 [docs/用户操作与字段说明书.md](docs/用户操作与字段说明书.md)。客户讲解顺序见 [docs/演示脚本.md](docs/演示脚本.md)。
