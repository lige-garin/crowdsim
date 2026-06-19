# CrowdSim Web — 多智能体客流仿真引擎 项目规划书

> **历史档（2026-06-19）**：本文档记录的是初版行人客流仿真方向。产品已转向
> 都市天际线级城市仿真引擎。当前单一真相源为
> `docs/superpowers/specs/2026-06-19-city-sim-engine-design.md` 与 `docs/adr/`。
> §4 优先级与 §5 边界已被 ADR 0001/0003 取代。

> 本文档供 Claude Code 作为开发依据。建议放在仓库根目录，并将「第9节 CLAUDE.md 模板」单独保存为 `CLAUDE.md`。

-----

## 1. 产品定位

**一句话**：全网页端的多智能体行人/客流仿真引擎，模拟商场、车站、活动场馆中的真实消费行为、排队、疏散与突发事件，对标 AnyLogic 行人库（Pedestrian Library），但无需安装、GPU 加速、支持自然语言配置场景。

**目标用户**：商业地产运营、交通枢纽规划、活动安保、建筑/消防咨询。

**核心差异化**：

1. 纯浏览器运行（WebGPU），单机 5万~10万 agent 实时仿真
1. AI 场景生成：自然语言描述 → 仿真配置（后期接 Claude API）
1. 开箱即用的分析看板（热力图、疏散时间、商铺客流转化）

-----

## 2. 技术栈（2026.06 选型）

|层             |技术                                            |理由                           |
|--------------|----------------------------------------------|-----------------------------|
|仿真核心（移动/避障）   |WebGPU Compute Shader (WGSL)                  |每 agent 一线程，空间哈希网格邻居查询，10万级实时|
|行为决策/离散事件(DES)|Rust → WASM，跑在 Web Worker                     |状态机、事件队列、消费决策；不阻塞 UI         |
|渲染            |Three.js WebGPURenderer + InstancedMesh       |与仿真共享 GPU buffer，零拷贝         |
|前端框架          |React 19 + TypeScript + Vite                  |编辑器 UI、看板                    |
|状态管理          |Zustand                                       |轻量，适合编辑器                     |
|2D 编辑器画布      |自绘 Canvas/SVG 图层（不引入重型库）                      |画墙、出入口、商铺、闸机                 |
|数据可视化         |自绘 GPU 热力图 + ECharts（曲线/统计）                   |                             |
|工程            |pnpm monorepo + Vitest + Playwright           |                             |
|数据格式          |自定义 JSON Schema（场景文件 .csim.json），支持 GeoJSON 导入|                             |

**降级策略**：检测到无 WebGPU 时显示明确提示（不做 WebGL 回退，那是 v2 范围之外）。

-----

## 3. 系统架构

```
┌─────────────────────────────────────────────────┐
│  React UI 层                                     │
│  场景编辑器 │ 仿真控制台 │ 分析看板 │ 项目管理      │
├─────────────────────────────────────────────────┤
│  Orchestrator（主线程 TS）                        │
│  仿真生命周期、时间控制、UI<->Worker<->GPU 桥接     │
├──────────────────────┬──────────────────────────┤
│ Behavior Worker      │  GPU Simulation Pipeline │
│ (Rust/WASM)          │  (WebGPU Compute)        │
│ - DES 事件队列        │  - 空间哈希网格构建        │
│ - Agent 状态机        │  - 社会力/ORCA 局部避障    │
│ - 消费/排队/疏散决策   │  - Flow Field 全局导航    │
│ - 商铺/服务台/闸机模型 │  - 位置积分               │
│        └── SharedArrayBuffer 双向同步 ──┘        │
├─────────────────────────────────────────────────┤
│  渲染层 Three.js WebGPURenderer                  │
│  Instanced agents │ 场景几何 │ 热力图纹理          │
└─────────────────────────────────────────────────┘
```

**关键数据流**：

- GPU 负责”怎么走”（每帧）：位置、速度、避障
- WASM 负责”去哪、做什么”（低频，10Hz 决策 tick）：写入每个 agent 的目标点/目标 Flow Field ID
- 同步通道：SharedArrayBuffer 存 agent 状态数组（position, velocity, targetFieldId, behaviorState, agentType…），结构化为 SoA（Structure of Arrays）

**核心数据结构（SoA，Float32/Uint32 TypedArray）**：

```
positions[2N], velocities[2N], targetField[N], state[N],
agentType[N], speed[N], radius[N], flags[N]
```

-----

## 4. 功能模块（按优先级）

### P0 — MVP 必须有

1. **场景编辑器（2D 俯视）**：画墙（线段/多边形）、出入口（生成/消失点）、可行走区域、目标点；网格吸附；撤销重做；保存/加载 .csim.json
1. **仿真核心**：社会力模型避障 + Flow Field 导航；出入口按到达率（泊松过程）生成 agent；支持 1万 agent @60fps
1. **仿真控制**：开始/暂停/重置、倍速（1x~16x）、仿真时钟
1. **疏散模式**：一键触发疏散事件，所有 agent 切换至最近出口，统计疏散完成时间曲线
1. **基础看板**：实时人数、密度热力图（GPU 累积）、疏散时间分布

### P1 — 核心商业价值

1. **消费行为模型**：商铺对象（吸引力、停留时间分布、容量）；agent 画像（目的型/闲逛型/通勤型）；兴趣驱动的逛店路径
1. **排队系统**：服务台/收银/闸机对象，FIFO 队列几何排布，服务时间分布（指数/正态）
1. **DES 事件系统**：时间表事件（如 18:00 客流高峰）、条件触发事件（密度超阈值→广播）
1. **分析增强**：断面流量计数线、商铺进店率/转化漏斗、agent 轨迹回放

### P2 — 差异化

1. **AI 场景助手**：自然语言 → 场景配置/事件脚本（Claude API）
1. **GeoJSON/图片底图导入**：描真实平面图
1. **3D 视图**：同一数据切换 3D 展示
1. **多楼层、楼梯/扶梯**

-----

## 5. 项目边界（明确不做 — 给 Claude Code 的硬约束)

- ❌ 不做后端/账号系统/云存储 —— v1 纯前端，场景文件本地导入导出
- ❌ 不做 WebGL 回退 —— 仅 WebGPU
- ❌ 不做车辆/轨道仿真 —— 只做行人
- ❌ 不做 3D 建模能力 —— 编辑器是 2D 俯视，3D 仅为展示（且在 P2）
- ❌ 不追求学术级精确校准 —— 行为参数可配置即可，不内置标定工具
- ❌ 不做移动端适配 —— 桌面浏览器优先
- ❌ MVP 阶段不接任何 AI API
- ❌ 单场景 agent 上限 v1 定为 10万，不做分布式/多GPU

-----

## 6. Monorepo 结构

```
crowdsim/
├── CLAUDE.md
├── PROJECT_PLAN.md          # 本文档
├── packages/
│   ├── core-gpu/            # WGSL shaders + WebGPU pipeline 封装 (TS)
│   │   ├── shaders/         # hashGrid.wgsl, socialForce.wgsl, integrate.wgsl, flowField.wgsl, heatmap.wgsl
│   │   └── src/
│   ├── core-behavior/       # Rust crate → wasm-pack 构建
│   │   ├── src/             # des.rs, agent_fsm.rs, shop.rs, queue.rs, evacuation.rs
│   │   └── Cargo.toml
│   ├── scene-schema/        # .csim.json 的 zod schema + 类型，TS/Rust 共享定义
│   ├── engine/              # Orchestrator：组装 GPU + WASM + 时钟 + SAB
│   └── app/                 # React 应用：编辑器、控制台、看板、渲染视图
├── docs/
│   ├── ARCHITECTURE.md
│   └── adr/                 # 架构决策记录
└── e2e/                     # Playwright
```

-----

## 7. 里程碑与任务分解（Claude Code 执行清单）

> 规则：每个任务一个分支/一次会话，完成需附带测试与 demo 页面验证。按顺序执行，不跳步。

### M0 工程脚手架（~3 任务）

- [x] T0.1 初始化 pnpm monorepo + Vite + React + TS + Vitest + ESLint/Prettier；CI 跑 lint+test
- [x] T0.2 配置 Rust + wasm-pack 构建管线，core-behavior 输出 wasm 到 app；写一个 add(a,b) 冒烟测试
- [x] T0.3 WebGPU 能力检测页：申请 device、跑一个最小 compute shader（数组×2），渲染结果到页面

### M1 GPU 仿真核心（~6 任务）

- [x] T1.1 scene-schema：定义 .csim.json（墙/出入口/区域/目标），zod 校验 + 单测
- [x] T1.2 core-gpu：agent SoA buffer 管理 + 空间哈希网格 compute pass（建格、排序、cell 索引），写 GPU 单测（readback 校验）
- [x] T1.3 core-gpu：社会力模型 pass（agent-agent 斥力、墙体斥力、期望速度驱动）+ 位置积分 pass
- [x] T1.4 core-gpu：Flow Field 生成（CPU 端 BFS/Dijkstra 栅格化场景 → 上传纹理），agent 采样流场获得期望方向
- [x] T1.5 渲染：Three.js WebGPURenderer instanced 渲染 agent + 场景墙体；目标 1万 agent 60fps
- [x] T1.6 engine：仿真循环（固定步长 + 倍速）、出入口泊松生成/出口消失、开始/暂停/重置

### M2 编辑器 + 疏散 MVP（~5 任务）

- [x] T2.1 编辑器画布：绘制墙（折线）、出入口、目标点；选择/移动/删除；网格吸附；撤销重做
- [x] T2.2 场景保存/加载/导入导出 .csim.json；示例场景×3（地铁站厅、商场中庭、演出散场）
- [x] T2.3 疏散模式：触发按钮 → WASM 端切换全员状态 → 重算至最近出口的 Flow Field → 统计疏散曲线
- [x] T2.4 热力图：GPU 累积密度纹理 + 叠加渲染 + 时间窗口控制
- [x] T2.5 看板 v1：实时人数曲线、疏散完成时间、密度峰值；E2E：加载示例场景→跑疏散→断言统计输出
- **✅ MVP 验收**：浏览器加载示例商场，1万 agent，触发疏散，60fps，输出疏散时间报告

### M3 消费行为 + DES（~6 任务）

- [x] T3.1 core-behavior：DES 事件队列（二叉堆）、仿真时钟对接、定时/条件事件
- [x] T3.2 agent 状态机：Idle→Navigate→Browse→Queue→Service→Leave + 疏散覆盖态；SAB 协议定稿并写入 docs
- [x] T3.3 商铺模型：吸引力/容量/停留时间分布；agent 画像（目的型/闲逛型/通勤型）与逛店决策（softmax over 吸引力×距离）
- [x] T3.4 排队系统：队列几何排布、FIFO、服务时间分布、闸机通行能力
- [x] T3.5 编辑器：商铺/服务台/闸机对象与参数面板；计数线对象
- [x] T3.6 看板 v2：商铺进店率、排队长度曲线、断面流量、轨迹回放

### M4 打磨与差异化（按需排期）

- [x] T4.1 性能：冲刺 10万 agent（workgroup 调优、减少 readback）
- [x] T4.2 GeoJSON/底图图片导入描图
- [x] T4.3 AI 场景助手（Claude API，结构化输出场景 JSON）
- [x] T4.4 3D 视图切换

-----

## 8. 关键技术决策（ADR 摘要，Claude Code 不得擅自更改）

1. **SoA 而非 AoS**：所有 agent 数据用 TypedArray 列存储，GPU/WASM/JS 三方共享
1. **决策与移动分频**：GPU 每帧（60Hz）算移动；WASM 10Hz 算决策。两者通过 SAB 中的 targetField/state 解耦
1. **固定步长仿真**：dt = 1/60 仿真秒，倍速 = 每渲染帧执行多个仿真步，保证确定性可复现（固定随机种子）
1. **Flow Field 而非每-agent A***：导航成本与 agent 数量解耦，目标点数量有限（出口/商铺各一张场）
1. **场景文件即真相**：UI 状态可丢，.csim.json 必须完整描述可复现的仿真

-----

## 9. CLAUDE.md 模板（复制为仓库根目录 CLAUDE.md）

```markdown
# CrowdSim Web

全网页端多智能体客流仿真引擎。完整规划见 PROJECT_PLAN.md（必读）。

## 命令
- pnpm i && pnpm dev          # 启动 app
- pnpm test                   # Vitest 全量
- pnpm build:wasm             # 构建 Rust→WASM
- pnpm e2e                    # Playwright

## 架构速览
- packages/core-gpu: WGSL + WebGPU 管线（移动/避障/热力图）
- packages/core-behavior: Rust→WASM（DES、状态机、消费/排队/疏散决策）
- packages/engine: 主线程编排，SharedArrayBuffer 同步
- packages/app: React 编辑器/看板/渲染
- packages/scene-schema: .csim.json schema（zod），TS/Rust 类型同源

## 硬性约束
- 仅 WebGPU，无 WebGL 回退；无后端；仅行人仿真
- agent 数据一律 SoA TypedArray；仿真固定步长可复现（固定种子）
- GPU 管 60Hz 移动，WASM 管 10Hz 决策，不得混层
- 不引入新的重型依赖前先在 PR 描述中说明理由
- 每个任务必须带测试；改 WGSL 必须带 readback 校验测试
- PROJECT_PLAN.md 第5节边界与第8节 ADR 不得违反；需要变更先停下来问

## 当前进度
按 PROJECT_PLAN.md 第7节任务清单顺序执行，完成一项勾选一项。
```

-----

## 10. 风险与应对

|风险                                   |应对                                                         |
|-------------------------------------|-----------------------------------------------------------|
|SharedArrayBuffer 需要跨源隔离（COOP/COEP 头）|Vite dev server 与部署均配置好响应头，T0.1 就处理                        |
|GPU readback 拖慢帧率                    |统计数据异步 readback，隔 N 帧一次；热力图全程留在 GPU                        |
|Safari WebGPU 行为差异                   |M1 起 CI 外加手动三浏览器冒烟清单                                       |
|社会力参数难调（抖动/穿模）                       |提供调参面板 + 录制对比；必要时 M4 换 ORCA                                |
|WASM/GPU 状态不一致                       |SAB 协议文档化（T3.2），状态字段单向所有权：state 只许 WASM 写，position 只许 GPU 写|
