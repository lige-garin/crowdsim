# 接手审查报告 — 2026-08-28

**审查人**：新接手者 · **代码快照**：`E:\crowdsim` @ 分支 `city-sim-engine`，HEAD `ce72733`（2026-06-25）
**审查方式**：全量读档（CLAUDE.md / ADR / CLAIMS_LEDGER / 7-28 深度审查 / 执行计划）+ 亲自跑闸门命令 + 子代理逐条复核旧审查项

---

## 一、一句话结论

> **内核是真的，仓库是悬空的。**
> 上一轮（07-28 ~ 07-31）做了一大批高质量的安全与渲染修复、把 11 个超长文件拆到 500 行以内、给后端补上了真鉴权测试——但**这批工作一行都没提交**，且在做最后一次测试文件拆分时中断，留下 3 个语法错误，导致 `lint` / `format:check` / `test` 三条闸门**同时是红的**。
> 此后 28 天无人触碰。**没有 git remote，这台机器就是唯一的副本。**

---

## 二、我亲自跑出来的基线（不是引用文档，是实测）

| 命令                                    | 结果                                            | 备注                                                                               |
| --------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| `git remote -v`                         | **空**                                          | 无远端、无备份，2 个本地分支                                                       |
| `git log --oneline \| wc -l`            | **134 次提交，最后 2026-06-25**                 | CLAUDE.md 与 ledger 引用的 `8486a1b`/`12d2078`/基线 `587f7b9` **在本仓库均不存在** |
| `git status --porcelain \| wc -l`       | **185 个文件未提交**（117 改 / 66 新增 / 2 删） | 最后修改时间 **2026-07-31 06:06**，之后停滞                                        |
| `pnpm lint`                             | **红** — 3 个 Parsing error                     | backend 2 个 + scene-schema 1 个                                                   |
| `pnpm format:check`                     | **红** — 5 个文件                               | 同上                                                                               |
| `pnpm test`                             | **红** — scene-schema 先挂，pnpm 递归中断       | **app 的 454 个用例根本没被执行到**                                                |
| `pnpm --filter @crowdsim/app test`      | 135 文件 / **454 用例全过**（37s）              | ~~vitest 进程不退出（exit 143）~~ **2026-08-30 复核：误判，见清单第 9 条**         |
| `pnpm test:rust`                        | **11/11 过**                                    | Rust DES/FSM/queue 是真的                                                          |
| `pnpm --filter @crowdsim/backend test`  | 19 过 / **1 失败** / 2 文件语法错误             | 失败项见下                                                                         |
| `pnpm --filter @crowdsim/core-gpu test` | 30 过 / **5 skip**                              | skip 是 `navigator?.gpu ? it : it.skip`，沙箱无 WebGPU                             |
| `pnpm --filter @crowdsim/collab test`   | 9/9 过                                          |                                                                                    |
| `pnpm build:wasm`                       | **成功**（2.2s）                                | 首次失败是并发跑时的 cargo 锁竞争，非代码问题                                      |
| `pnpm e2e`                              | **跑不了**                                      | 本机未安装 Playwright 浏览器                                                       |
| `.github/workflows/ci.yml`              | 存在，但只监听 `pull_request` / `push: main`    | **无 remote ⇒ CI 从未运行过一次**                                                  |
| 代码规模                                | 381 个 `.ts/.tsx`，48,327 行                    | **>500 行的文件已清零**（07-31 那轮 SP-6 拆分基本完成，但未提交）                  |

### 三个语法错误是同一次中断留下的

三个文件的 mtime 全部落在 **2026-07-31 06:05:24 ~ 06:06:12 这 48 秒内**，是一次测试文件拆分被打断的现场：

| 文件                                                | 症状                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/scene-schema/src/sceneTestFixtures.ts:57` | 文件末尾多一个 `};`                                                                |
| `packages/backend/src/aiProxyRoutes.test.ts:212`    | `it("blocks client-side tile keys...", async () => {` **函数体是空的**，直接 `});` |
| `packages/backend/src/tilesCorsRoutes.test.ts:174`  | 文件末尾多一个 `});`                                                               |

而 `projectRoutes.test.ts:39` 那个**真失败**的用例，报错是：

```
ReferenceError: aiPayload is not defined
```

——`aiPayload` 本来就该定义在写坏了的 `aiProxyRoutes.test.ts` 里。四个症状是同一个根因，修复量约 20 行。

---

## 三、旧审查（07-28）问题的复核结果

对 `docs/REVIEW-2026-07-28.md` 的关键项逐条回到代码里核实：

**已修复（值得记功）**

- 16 个"城市规划工具"假按钮 → 抽成 `workspacePalette.ts`，每个 entry 绑真实回调，且有 `workspacePalette.test.ts` 防回归
- 图层复选框 / 时间轴 `readOnly` → 已移除，改为非交互进度条
- 写死的「证据: 已验证」/ 天气 / 内核 / T0.x 里程碑 → 已删，`App.test.tsx:190-195` 断言这些字符串不在 DOM 中
- 视口每秒重建整个 Three 场景 + 泄漏 GPUDevice → 已拆结构层/时变层两个 effect，`useSimulationViewportRenderer.ts:437` 补 `gpuDevice?.destroy()`
- InstancedMesh 容量 100,000 → 8,192（`renderBenchmark.ts:30`）；`device.destroy()` 就位
- 后端统一 session 校验 / `ownerId` 取自 session / 越权 404 / AI 与 tiles 代理鉴权+限额 / 服务端生成 share token / CORS → **均已落地且有测试为证**（`hides other accounts' projects behind a 404`、`files projects under the session account, not the request body`、`returns 429 once the project quota is exhausted` 全绿）
- 文件 >500 行：11 个 → **0 个**

**未修复**

| #   | 问题                                       | 证据                                                                                                                                                                                   |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **核心闭环仍断：编辑器改的东西进不了仿真** | `App.tsx:53/58` 两个仿真控制器硬绑 `demoScene`；`SceneEditor.tsx:47` 场景只存自己的 `baseScene`，全仓无「应用到仿真」按钮                                                              |
| 2   | **`POST /api/auth/login` 不校验任何凭据**  | `backend/src/index.ts:184-189` 是 `if (options.verifyLogin && …)`，钩子可选且生产未注入 ⇒ 任意 `accountId` 换有效 session，前面所有 session 鉴权等于零                                 |
| 3   | 8 个孤儿模块仍在，只被自己的测试引用       | `simulationOrchestrator` / `odCalibration` / `odSensitivity` / `odFlowAnalysis` / `verticalTransport` / `weatherIntegration` / `aiMallAutomation` / `useWasmSimulationDecisionBackend` |
| 4   | `gpuSimCore.ts` 仍零调用（964 行）         | app 从不 import，只有 `test-webgpu/` 里 5 个全 skip 的 spec 用它                                                                                                                       |
| 5   | 默认仿真后端仍是 CPU、上限 2000            | `simulationEngine.ts:105 movementBackend: "cpu-compat"`、`:98 defaultMaxAgents = 2_000`                                                                                                |
| 6   | `reportExport.test.ts` 自比假绿            | `:26-40` baseline 由同一个 `createReport()` 现算再自比，`match` 恒 true，且结果写进可导出报告                                                                                          |
| 7   | 实验面板仍主线程同步跑（4.86 万步）        | `ExperimentSweepPanel.tsx:21` / `ExperimentSummaryPanel.tsx:12` / `ScenarioComparisonPanel.tsx:7`；现成的 `experimentWorkerClient` 没人用                                              |
| 8   | 视口 overlay 仍硬截 240 人                 | `simulationViewportOverlay.ts:36 slice(0, 240)`（InstancedMesh 路径已修，overlay 路径没修）                                                                                            |
| ~~9~~ | ~~vitest 进程跑完不退出~~  | **2026-08-30 复核：不存在此 bug，原记录为误判。** 三次实测定时：app 全量 22s 退出（exit 0）、`pnpm -r test` 20s 退出、完整 `lint && typecheck && test` 链 77s 退出。并注入临时 `afterAll` 探针打印 `process._getActiveHandles()`，测试结束后仅剩 **4 个 vitest 自身的 IPC socket（Pipe + 3×Socket）**，无任何遗留定时器/服务器句柄。原先的 exit 143 是 `timeout` 对**首次 `wasm-pack` 冷编译 Rust**（含 cargo 全量构建）的正常耗时误杀，不是进程 hang。教训：把"等了很久"当成"挂住"，正是本项目 CLAIMS_LEDGER 反复清理的那类未验证断言 |

---

## 四、最该先做的四件事（按顺序，不要跳）

### 1. 固化代码 + 建远端（今天，30 分钟）

185 个文件、一个月的产出、含全部安全修复，**全在一台机器上，没有 remote**。硬盘故障 = 项目归零。

```
修 3 个语法错误 → 补 aiPayload → lint/format/test 全绿 → 提交 → 建 GitHub/GitLab 远端并 push
```

建议至少切成 3 个提交（tier-0 闸门 / tier-1 止血 / SP-6 拆分），不要把一个月的工作压成一个巨型 commit。

### 2. 让 CI 真正跑起来（今天）

CI 只在 `pull_request` 和 `push: main` 时触发，而当前分支叫 `city-sim-engine`，且没有 remote —— **这套 CI 从未执行过一次**。建好 remote 后加一条：

```yaml
on:
  push:
    branches: ["**"]
```

另外 CI 缺 `pnpm test:webgpu` 和浏览器缓存，Node 版本（CI 24 / 本地 22.22）也不一致，建议统一。

### 3. 补完后端两件事（1 天）

- **`login` 接真实凭据校验**：这是唯一还是洞的安全项，且它让上面所有 session 鉴权失去意义。`verifyLogin` 钩子已存在，缺的是生产注入。
- **补完被打断的测试拆分**：`aiProxyRoutes.test.ts` 那个空壳 `it()` 和缺失的 `aiPayload`，同时修好 `projectRoutes.test.ts` 的红。

### 4. 接通核心闭环（3–5 天，做完产品才从"技术演示"变成"工具"）

`scene` 状态提升到 `App` 层 + 编辑器加显式「应用到仿真」主按钮 + 仿真 `reinit(scene)`。

**这是当前唯一一个让整个产品失去意义的问题**：用户花 20 分钟画墙、放店、调吸引力和容量，点"开始"跑的还是那个雨天商业街，改动一个字节都没进仿真。上百个参数字段全部白做。

---

## 五、再往后的判断（可以选择不做）

**关于「10 万 GPU agent」这个卖点**——建议**暂时冻结，不要继续投入**。理由：

- `gpuSimCore.ts` 写了 964 行，零调用，5 个验证 spec 在无 WebGPU 环境 100% skip
- 这个卖点只有在**有 WebGPU 的真机**上才能验证，而开发机是 Windows + 无 WebGPU
- 继续堆代码只会增加"写了但永远不验证"的面积，这正是 `CLAIMS_LEDGER.md` 花大力气清理的那类债

更划算的路径：**先把默认后端从 CPU 直线移动换成已有的 GPU 社会力路径**（代码都在，只差接线），哪怕先做到 5,000 agent @60fps 并且**在真机上实测出数字**，也比一个未验证的 10 万承诺值钱。

**关于 AI 层**——目前全是确定性模板（`includes("mall")` 级别的关键词匹配）。要么接真 LLM，要么在 UI 上把"AI"改名为"规则草稿"。现在这个中间状态风险最高。

**关于孤儿模块**——8 个模块 + 964 行 `gpuSimCore` + 未接线的 experiment worker。建议逐个做二选一：**接线**或**删除**，不要保留第三种状态。它们测试全过，`pnpm test` 给不出任何信号。

---

## 六、一个必须纠正的文档问题

`CLAUDE.md` 的「本轮文档更新亲自复跑的命令」一节写着：

> `npx prettier . --check` → 全绿 · `pnpm lint` → 无输出（0 error / 0 warning）

**实测两者都是红的**（见第二节）。同样，`docs/CLAIMS_LEDGER.md` 里 "Commits `8486a1b tier0: gates` and `12d2078 tier1: stop the bleeding`" 引用的两个 sha 在本仓库不存在。

这恰恰是这个项目花大力气建立 `CLAIMS_LEDGER` 想根治的病——**文档声称的验证状态与实际不符**。建议在恢复绿灯后，把 CLAUDE.md 这一节改成"最后一次验证于 YYYY-MM-DD，命令与结果如下"，并且**每条都附上可复跑的命令**，让下一个接手的人不必再信一次文档。

---

## 七、最后一句

这个仓库最有价值的资产不是代码，是 `CLAIMS_LEDGER.md` + `PANEL_STATUS.md` + ADR 这套自我审计机制——它敢在文档里写下"这条是伪造的"，比多数项目诚实得多。上一轮的工作质量也确实高：真鉴权、真视口修复、真文件拆分。

但它现在处于一个**非常脆弱的瞬间**：一个月的产出悬在未提交状态，且仓库因为三个半截字符而无法自证健康。先把这个瞬间过去，再谈 10 万 agent。
