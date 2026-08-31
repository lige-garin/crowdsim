# 全站审查报告（2026-08-31）

> 审查范围：crowdsim 全仓 6 包（app / backend / collab / core-behavior / core-gpu / scene-schema），约 49,000 行（TS/TSX/Rust）。所有结论均有 `文件:行号` 证据或今日实测闸门输出支撑；无推测项。

## 执行摘要

- **质量闸门**：单测 451+33 全绿、ESLint 零告警、生产构建绿、e2e 4/4 冒烟通过（修复 2 处测试基建缺陷后）。Prettier 昨日提交引入 10 文件漂移（本次已修复）。
- **重大进展**：长期挂账的 "10 万 agent / 60fps" 宣称**今日首次真机实测**（NVIDIA Lovelace，100k agent，0.13–0.21 ms/step，约 80× 余量），从 FABRICATED 改判 MEASURED。
- **结论**：诚信面、安全面、工程纪律、GPU 性能宣称全部过关；**仿真物理正确性（3 个 P1）仍是唯一上线 blocker**。
- 本次当场修复 7 项（见"四、已修"）。

## 一、闸门实测（全部今日真机跑）

| 闸门 | 结果 | 备注 |
| --- | --- | --- |
| app vitest | **129 文件 / 451 测试全过**（37.4s） | 进程测试后未退出被 timeout 杀（exit 124）——见 P2-4 |
| backend vitest | **6 文件 / 33 测试全过**，exit 0 | |
| ESLint | **PASS**（0 错误 0 警告） | |
| Prettier `--check` | FAIL → **修复后 PASS** | 昨日 5 个 commit 漏跑 prettier，10 文件漂移 |
| 生产构建 | **PASS**（304 模块，wasm 63.7 kB + 2 worker + chunks） | `vite build --outDir dist-verify` |
| Playwright e2e | **4/4 冒烟通过**（1600×900） | 修复 2 处测试基建缺陷后；另发现 720p 真实布局 bug（P2-2） |
| 真机 WebGPU 100k 基准 | **0.131–0.211 ms/step**（3 轮） | NVIDIA Lovelace / Chrome 149，页面内实测 `benchmark100k.webgpu.ts` 同参数复刻 |
| pnpm audit | **不可用** | npmmirror registry 无 audit endpoint（依赖漏洞盲区，P3-6） |
| cargo test（Rust DES） | 昨日全绿，本次未重跑 | 上次会话 gate9 实测通过 |

## 二、P1 — 仿真正确性（上线 blocker，共 3 项，全在物理层）

### P1-1【本次新发现】默认仿真速度 8 m/s，UI 实时仿真跑 6 倍速

证据链：
- `packages/app/src/simulationEngine.ts:96` — `defaultSpeedMetersPerSecond = 8`
- `packages/app/src/useSimulationController.ts:30` — 主线程路径只传 `{decisionBackend, movementBackend}`，**不传速度**
- `packages/app/src/useSimulationWorkerController.ts:107` — worker 路径同样不传
- `packages/scene-schema/src/` — **场景 schema 无行人速度字段** → 速度不随场景持久化

后果：编辑器里用户自建场景恒以 **8 m/s（28.8 km/h，约 6 倍行人速度）** 模拟；而 benchmark（1.34）与行业模板（1.05–1.28）都显式传速 → **"benchmark 绿" 与 "用户看到的对" 完全是两回事**。流量、dwell、throughput 全部失真。

修复建议：默认值改 1.34（Weidmann 自由流），scene-schema 增加可选 `speedMetersPerSecond` 字段，编辑器可调、随场景保存。

### P1-2 无密度-速度耦合（已知，已在 CLAIMS_LEDGER 记录）

2 P/m² 处文献 0.61 m/s vs 引擎恒 1.34 m/s；**RiMEA Test 4 不通过**。`pedestrianFundamentalDiagram.ts`（含 Weidmann/Kladek 公式与 7 项测试）已就位，可直接作为耦合改造后的回归基准。修复方向 = 给引擎加密度-速度耦合，**不是**放宽期望区间。

### P1-3 CPU 引擎无 agent-agent 交互，行人互相穿透（GPU 核心已有社会力！）

证据链：
- `simulationEngine.ts:316-348`（`advanceAgentsCpu`）— 直线走向目标，仅墙/边界约束，**无 agent 间排斥/避让**
- **关键发现**：`packages/core-gpu/src/gpuSimCore.ts` 的 GPU 核心已实现完整社会力参数（`SocialForceParams`：desiredSpeed 1.3、relaxationTime 0.5、agent/wall repulsion、maxSpeed）——即 **P1-2/P1-3 的正确物理已在 GPU 核心写好并通过 100k 基准实测，只是从未接入 UI 仿真主链路**（`useWebGpuMovementBackend` 走的是渲染路径，非 `gpuSimCore` 步进）
- 密度网格（`cpuGrid.ts`）是只读回传，不反馈到 CPU 运动

后果：高密度场景的拥堵形态、排队物理、拱形效应均不存在。**修复路径比预想近**：把 UI 仿真切到（或桥接）`gpuSimCore` 的社会力步进，CPU 路径做简化版间距约束。

## 三、P2 — 上线前应解决

| # | 发现 | 证据 / 状态 |
| --- | --- | --- |
| P2-1 | ~~10 万 GPU 宣称未验证~~ → **今日已实测** | 100k @ 0.13–0.21 ms/step（Lovelace/Chrome149）≈ 80× 余量；已记入 `packages/core-gpu/BENCHMARKS.md` 与 CLAIMS_LEDGER。剩余范围：仅测了 GPU 步进核（不含决策/回传/渲染全管线）；parity/determinism 规格仍无真机执行 |
| P2-2 | **720p 视口下编辑器工具条被面板坞遮挡**【本次新发现】 | 1280×720 下点击 `editor-tool-shop`，命中测试被 `panel-dock-collapsed` 拦截 30s（playwright hit-test 与真实点击等价）；1600×900 下同一测试 1.3s 通过。真实用户在 720p 笔记本会遇到"点工具没反应" |
| P2-3 | e2e 基建已破但无人跑（本次修复两处） | ① 落地页上线后 4 个冒烟测试全部直接失败（没人跑过 e2e gate）；② `canvasHasContent` 对 WebGPU 画布读黑帧（drawImage 读不到 WebGPU 内容，`toDataURL` 可以）——注释声称兼容两者，实际不兼容。两处均已修复 |
| P2-4 | **测试进程退出挂起（两类）** | vitest：测试全过但 jsdom worker 保活 → exit 124；playwright：worker 300s 不退出强杀。CI 会 flake。修法：teardown 显式 `worker.terminate()` / 强制退出 |
| P2-5 | benchmark 场景几何是"自称 RiMEA 的自作近似"，非官方几何（CLAIMS_LEDGER 已声明） | 对外避免"RiMEA 认证"措辞 |
| P2-6 | e2e 仅 Chromium/Chrome；`reuseExistingServer` + 固定 5173 有端口劫持风险（本机 5173 被另一产品占用，playwright 盲目复用） | 建议 `strictPort` + 启动后校验页面标记 |

## 四、P3 — 卫生/运维

**本次已修（随本报告提交）**：
1. ✅ Prettier 10 文件漂移 → `--write` 修复，闸门恢复绿
2. ✅ `simulationEngine.ts:352` 注释乱码 `鈥?` → `—`（全仓 Python 字节扫描唯一残留）
3. ✅ `.gitignore`/`.prettierignore` 补 `.workbuddy/`、`.pnpm-store/`、`.vite-5184.log`、`_to_delete`
4. ✅ e2e `enterWorkbench` helper（落地页导航）
5. ✅ e2e `canvasHasContent` WebGPU `toDataURL` 回读路径
6. ✅ `BENCHMARKS.md`/`CLAIMS_LEDGER.md` 记录 100k 实测数
7. ✅ e2e 实测通道打通（隔离端口 + strictPort 临时配置）

**未修（低风险，记录在案）**：
8. `backendRequestUtils.ts:19` `readJson` 无请求体大小上限（DoS 面）
9. `pnpm audit` 在 npmmirror 下不可用 → 依赖 CVE 盲区
10. `auth.ts:30` 会话存内存 Map：重启全员登出、多实例不共享
11. login 无速率限制/锁定
12. `_to_delete/` 残留 2 个无引用死文件（`agentLifecycle.*`）
13. 后端 `/api/ai/:provider` 完整实现（fail-closed、配额、密钥拦截、aiPolicy）但 app 端无真实调用（`AiWorkflowPanel` 只构造请求展示 URL）——后端先行管线
14. e2e 临时配置/补丁文件未入库（沙箱专用，方法已记入文档）

## 五、正面清单（值得保持的强项）

- **安全**：CSPRNG 32 字节会话 token + 8h 过期；login fail-closed（b68b6fd）；`sk-` 客户端密钥拦截（URL 参数 + 深层 JSON）；CORS wildcard+credentials 启动断言；tiles 代理防路径穿越 + 固定上游
- **诚信**：CLAIMS_LEDGER 记录到"哪行代码、何时验证"粒度；Weidmann 对比表明示 +0.73/+1.18 偏差；UI 无残留 "AI" 宣称（本次复核为零）；100k 宣称从 FABRICATED 升级为 MEASURED 且范围诚实
- **测试纪律**：e2e 锚定 `data-testid`/ARIA；画布"真的画了东西"断言；捕获运行时错误；e2e 注释记录历史教训
- **代码卫生**：全仓 0 TODO/FIXME；非测试代码仅 1 处合理 console.warn；零密钥泄漏
- **架构**：ProjectStore 接口 + 内存/D1/R2 双实现；GPU 社会力核 + CPU 兼容路径分离；`?mainsim` 调试开关

## 六、结论

**距上线水准的差距已全部量化且高度集中。** 诚信/安全/工程纪律/GPU 性能四个面今日全部过关；剩余 blocker 全在 CPU 仿真物理层（P1-1/2/3），而 P1-3 的正确物理（社会力）**已经在 GPU 核心里写好并实测 80× 余量**——接入即可。建议行动顺序：

1. 【P0】默认速度 8→1.34 + scene schema 速度字段（半小时级，收益立竿见影）
2. 【P0】UI 仿真接入 `gpuSimCore` 社会力步进（CPU 路径做间距约束简化版），以 `pedestrianFundamentalDiagram` 为回归基准对齐 RiMEA Test 4
3. 【P1】720p 布局 bug（panel dock 遮挡编辑器工具条）
4. 【P1】真机跑全管线 fps（GPU 核心已过，全链路未测）；parity/determinism 规格真机执行
5. 【P2】e2e strictPort + 跨浏览器矩阵 + 两类 teardown 挂起修复

## 附：e2e 实测记录

- 通道：隔离端口 5199 + `strictPort` + 禁用 reuse（仓库默认配置会被 5173 上无关产品劫持）
- 结果（1600×900）：workbench 启动并渲染人群 ✅ / GPU 单次初始化 ✅ / 编辑器放置+撤销 ✅ / 面板坞 ✅
- 1280×720：编辑器测试失败（P2-2 遮挡 bug，非测试问题）
- WebGPU 画布读回：`drawImage` 读黑帧为测试基建限制，`toDataURL` 可读 —— smoke helper 已补该路径
