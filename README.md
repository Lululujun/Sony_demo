# 索尼产品动态分配 Agent · RFP 演示工作台

这是一个面向客户演示、方案评审和 PPT 截图的纯前端 Demo。页面真实运行智能分层、比例计算、分货求解、特殊物料处理、PSI 周转和诊断规则，而不是把解决方案文案简单搬到网页中。

当前数据均为固定演示数据，不代表索尼真实经营数据。SAP RFC、数据采集和权限操作均为浏览器内模拟，不会连接真实业务系统。

## 本地运行

Windows 可直接双击：

```text
start-demo.bat
```

或在 PowerShell 中运行：

```powershell
.\start-demo.ps1
```

默认地址为 `http://localhost:3000`。

已有 Node.js 20+ 与 pnpm 时，也可以执行：

```powershell
pnpm install
pnpm dev
```

## 六个操作视图

1. **智能分层**：在总部、渠道、子渠道、大区、分公司、经销商六级组织中，根据供给满足度和 PIC 阈值决定停靠层级，并回放 Agent 判断轨迹。
2. **分货工作台**：展示 MIA、SAP、SSP 三系统数据口径；实时运行公平层、效率层、资金上限与整数守恒求解。
3. **方案对比**：在同一输入和硬约束下比较偏公平、均衡、偏效率三套方案。
4. **比例与特殊物料**：演示 PA Plan Ratio、Wkly Ratio、大客户 `kBig`、直营优先与 Buffer、同型号多色以及 Skip 清单。
5. **周转与校准**：以 SSP 过去 12 个月 PSI sellout 为主口径计算消化周转周期，并保留库存流量法和周初校准作为交叉验证。
6. **后台管理**：集中展示八项配置、版本变更留痕、回滚、CSV 导出、角色权限及数据/结果/执行三类诊断。

PPT 示意场景的 WH-1000XM6 会稳定复现：

| 经销商 | 最终分配 |
|---|---:|
| 华东数码-A | 108 台 |
| 中原电子-B | 50 台 |
| 南方声学-C | 52 台 |

总供给与总分配均为 210 台。

## 三类业务数据来源

| 系统 | Demo 中的业务口径 |
|---|---|
| MIA | 月度目标、产品与渠道计划 |
| SAP | 订单、库存、货款余额、可分货量及产品分配 RFC |
| SSP | 历史 PSI、周度 sellout、Skip 后的人工分配承接 |

Demo 使用本地固定 seed 模拟这些输入。正式项目中只需用接口层替换 seed，核心纯函数和页面解释结构可以保留。

## 触发与截图

顶部“触发分货”支持：

- **到货触发**：模拟新货源到达后立即执行；
- **定时批量**：模拟计划任务按批次执行。

普通在线体验直接访问 `/`；客户现场可使用 `/?demo=1`；截图使用 `/?shot=1&preset=...`。截图模式采用固定时间源，并隐藏重置按钮、Toast 和滚动条，保证同一 preset 可重复截取。

常用截图 preset：

- `workbench-result`
- `workbench-audit`
- `scenarios`
- `layering-p1`
- `layering-p2`
- `ratios-special`
- `turnover-psi`
- `calibration`
- `console-alerts`

## 验证与静态交付

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

`pnpm build` 使用 Next.js 静态导出生成 `out/`。产物不需要 Node.js 服务端、数据库、SAP 或 LLM，可断网演示，也可直接部署到静态托管平台。

## Cloudflare Pages

推荐通过 Git 仓库连接 Cloudflare Pages：

| 设置项 | 值 |
|---|---|
| Production branch | 实际生产分支，例如 `main` |
| Build command | `pnpm build` |
| Build output directory | `out` |
| Root directory | 项目根目录 |
| Node.js | 22.x，与 CI 保持一致 |

首次创建项目后，Cloudflare Pages 会拉取代码、安装依赖并发布 `out/`。以后只要向生产分支推送提交，就会自动重新构建并更新正式站点；其他分支可生成 Preview URL。当前 Demo 没有运行时环境变量和服务端密钥。

也可以使用 Docker：

```powershell
docker compose up --build -d
```

访问 `http://localhost:8080`。

更多信息：

- [完整技术路线与在线部署](docs/技术路线与在线部署.md)
- [用户操作与字段说明书](docs/用户操作与字段说明书.md)
- [客户演示脚本](docs/演示脚本.md)
- [设计自查表](docs/设计自查表.md)
