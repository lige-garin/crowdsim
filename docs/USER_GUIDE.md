# CrowdSim 用户手册 · User Guide

> 适用版本 v0.1.0（手册更新 2026-10-08）。界面为中英双语，本手册以中文为主，末尾附英文快速上手。

## 1. 新建项目：选一个位置

首页的项目列表是本地的——存在这台浏览器里，不上传。第一次打开是空的，点「新建项目」走三步：

1. **选点** — 在地图上点，或者直接填经纬度和半径。没配高德 key 时没有底图，但坐标输入照常能用：选址真正要的是经纬度，地图只是帮你挑位置。
2. **填写** — 项目名、业态、楼层数、面积，以及**平面从哪来**，四选一：

   | 来源        | 会生成什么                                                                 |
   | ----------- | -------------------------------------------------------------------------- |
   | 手绘平面图  | 什么都不会自动生成；进编辑器逐段画墙。最费事，但每一条墙都是你定的         |
   | DXF 导入    | 抽出墙体和轮廓；**门要在导入后自己补**（门洞认不出来）                     |
   | 按楼层生成  | 填每层用途，自动生成墙、店铺、扶梯和首层的门；**扶梯位置是猜的**，不是算出来的 |
   | 导入 GLB    | 只有外观。人能在模型里走动，但仿真不知道墙在哪——**不产生墙体**             |

   下面还有一块「周边实测」：配了 key 后可以查这个半径内有多少住宅小区、学校、写字楼、商场、地铁站、公交站、同类店铺。**这些是地点条目数，不是人数**——把条目变成人数需要标定过的系数，现在还没有，所以它们不参与仿真，只帮你判断这个位置像什么。没查过时面板写「还没有查询过」而不是显示 0，因为「没问过」和「问了是零」是两件事。

3. **打开** — 存进列表，点开进工作台。

四种来源都会放一个**占位店铺**（一个盒子，带说明字段标记它是占位的），因为引擎需要一个非空场景才能跑。它不是你量过的店，别照着它填数据。

## 2. 快速开始：四步做完一次仿真

普通模式（默认）把整个流程做成首页的四个步骤：

1. **选模板** — 首页画廊里有商场、车站、医院等行业模板，点击任一卡片。
2. **跑起来** — 选中模板即加载场景并**自动开始仿真**，无需再按播放。
3. **看驾驶舱** — 实时分析窗口随模板自动打开，人数、流量、停留随仿真滚动。
4. **出报告** — 右侧「导出报告」按钮一键打开本场景的验证报告。

需要完整工具集时，点首页右上角「切到专家模式」进入运营台。

## 3. 运营台界面（专家模式）

| 区域                  | 作用                                                                           |
| --------------------- | ------------------------------------------------------------------------------ |
| 左上场景名 + 视图切换 | 3D 城市 / 2D 平面 / 接触网络三种视图                                           |
| 底部运行控制          | 播放/暂停、重置、倍速（1×/2×/4×）                                              |
| HUD 计数              | 实时人数、已出场人数、仿真时钟                                                 |
| 左侧建造栏            | 建造/商业/人流/扰动四组工具，可直接在 3D 城市里点击地面放置                    |
| 右侧信息栏            | 五个图层开关（人群/行为/热力/流向/风险）+ 两个浮动窗口（实时分析、工具与实验） |
| 编辑页签              | 打开 2D 场景编辑器                                                             |

## 4. 看结果

- **实时分析窗口**：人口走势、计数线流量、旅程时间分布、停留与排队排名、Fruin 服务水平。数据从**正在运行的仿真**实时采样——面板顶部标「样例数据」的除外（会明说与本场景无关）。
- **热力图**：信息栏打开热力图层后，可选择统计时间窗；图例标注密度分级（P/m²）。
- **计数线**：想测某个通道的人流量？用「人流 → 计数线」工具在图上拖一条线（任意角度），命名后它的人/分钟流量会进实时分析。
- **轨迹回放**：仿真全程自动录制。打开回放条暂停实时仿真，拖进度条回看任意时刻的人群，再按播放交还实时。

## 5. 编辑场景

- **2D 编辑器**（编辑页签）：17 种工具、吸附网格、参数面板（选中任何对象即可改它的属性：容量、吸引力、服务时长……）。
- **3D 直接建模**：在 3D 视图手持工具点击地面即可放置；撤销按钮在建造栏。
- **多楼层**：楼层条可加层、切层；电梯/扶梯等竖向连接已建模，运行摘要会分楼层统计。
- **改完要点「应用到仿真」**：编辑不会自动生效——这是刻意的（避免每画一笔就重启仿真）。应用后仿真在**新几何上继续跑**，时钟不清零。
- **键盘快捷键**（画布聚焦时）：

  | 按键                       | 作用         |
  | -------------------------- | ------------ |
  | `Delete` / `Backspace`     | 删除选中对象 |
  | `Ctrl+Z`                   | 撤销         |
  | `Ctrl+Y` 或 `Ctrl+Shift+Z` | 重做         |

  在输入框里打字不受影响——快捷键只挂在画布上。

## 6. 导入与保存

- **导入**：编辑器「文件」菜单支持 DXF（墙线）、GeoJSON、IFC（约 3.4MB 模块，首次导入时才下载）、底图图片。
  - 诚实说明：底图**不会自动识别几何**，只作视觉参照；「描图示例」是内置演示数据，不是对您的图跑识别。
- **保存**：「保存」写入浏览器本地（单槽，后存覆盖前存）；「导出场景」生成 `.csim.json` 文件，交付/备份用这个。
- **自动保存**：编辑每 2 秒自动存入独立草稿槽。下次打开若检测到「没保存过就关掉的修改」，顶部会出现恢复横幅——「恢复」找回草稿，「丢弃」同样一键。
- **保存失败不会丢工作**：本地存储配额不足（大底图常见）时，自动改为**导出场景文件**并明确提示。

## 7. 实验（工具与实验窗口）

- **参数扫描**：同一场景跑多个变体（每个变体多次），后台 worker 线程执行，**页面不卡**；结果带 95% 区间和实际次数。
- **敏感性筛查 / 场景对比 / RiMEA 回归 / 验证报告**：从工具窗口的页签进入。

## 8. 报告与导出

- **验证报告**：包含本场景的商业参数校验 + 引擎回归基准（RiMEA 命名的自拟场景，报告里明说与您的场景无关）+ 参数来源。
- **导出 PDF**：点「打印 / 另存为 PDF」后报告在新标签页打开——**PDF 由浏览器打印对话框生成**（选择「另存为 PDF」），不是本站直出 PDF 文件。
- **导出数据**：实时分析窗口可导五种 CSV（线流量/旅程/停留/服务水平/密度网格），回放条可导轨迹 CSV。

## 9. 网络请求（哪些数据出了这台机器）

默认离线。下面两处是唯一的例外，都**由你主动触发**，且都要你自己的 key：

| 用途       | 什么时候发生                                       | 走哪里                     |
| ---------- | -------------------------------------------------- | -------------------------- |
| 天气面板   | 打开天气面板时                                     | 公开天气服务               |
| 地图与周边 | 配置高德 key 后加载地图底图；在新建项目里点「查一下周边有什么」 | 高德（Amap）Web 服务 |

没有配 key 时，地图没有底图、周边查不了，**但坐标输入照常可用**——选址真正需要的是经纬度，地图只是帮你挑位置的。查询一次会消耗一次高德配额，所以它是按钮而不是自动执行的。

**关于 key**：浏览器要调用接口就必须持有 key，所以它会以明文存在这个浏览器的本地存储里，任何打开这台机器的人都能读到。控制台里请选带 **referer 白名单的「Web服务」类型**，不要用服务端 key。它不会写进你导出的项目文件里。
## 10. 出问题时

| 现象            | 处理                                                         |
| --------------- | ------------------------------------------------------------ |
| 界面白屏/报错卡 | 卡片上有「刷新页面」；旁边「复制诊断信息」可直接复制错误报告 |
| 仿真停了        | 出现「仿真已停止」卡片，点「重试」即可，场景和编辑不受影响   |
| 没有WebGPU      | 自动进入标注清楚的兼容模式；完全无法渲染时显示说明卡         |
| 反馈问题        | 实时分析 → 系统与记录 → 「复制诊断信息」，把文本贴给开发者   |
## 11. 边界

- **人数上限 2000**（引擎硬顶）。模板卡上的推荐人数都在此范围内。
- GPU 加速已接线但**默认关闭**（实验性，交叉点约 750–1000 人）；CPU 是默认路径。
- 面板里标「样例数据」的数据是演示样例，不是您的场景结果。
- 断网不影响除第 9 节那两处之外的一切功能。

---

# English quick start

**Four steps (basic mode, the default home):** pick a template card → the run starts by itself with the dashboard open → read live analytics → click **export report**. Switch to expert mode (top-right) for the full workbench: build tools (place straight into the 3D city), five view layers, the floating analytics and tools windows, and the 2D editor tab.

**Editing:** the 2D editor has 17 tools, snapping, a parameter panel, and multi-floor support. Edits take effect only when you click **应用到仿真 (apply)** — deliberately, so a run is never silently restarted; after applying, the clock carries on. Keyboard: `Delete`/`Backspace` deletes the selection, `Ctrl+Z` undo, `Ctrl+Y` / `Ctrl+Shift+Z` redo (canvas focused).

**Saving:** manual save is a single browser slot; **export scene** writes a `.csim.json` file. A debounced autosave keeps a separate draft slot and offers recovery on next load. If local storage quota is exceeded (large basemaps), the app falls back to exporting a file instead of losing your work.

**Export:** five CSV kinds from live analytics, trajectory CSV from the replay bar; the validation report prints through the browser's **Save as PDF** (the app itself ships print-optimized HTML, not a PDF file).

**Honest limits:** 2,000-agent engine cap; GPU movement is wired but default-off (`?gpumove`, experimental); panels labelled 样例数据 are fixtures, not your scene. Offline by default: the only two calls out are the weather panel and, once you supply an Amap key, the map and a manual POI lookup (§9).

**New project (§1):** project list → place (map click or type lat/lng and a radius) → name, category, floors, area and one of four plan sources → open. The 周边实测 counts are Amap *listing* counts, not people, and stay out of the simulation. Every source seeds one placeholder shop so the engine has a non-empty scene to run.

**Trouble:** a stopped simulation shows a retry card; any crash keeps a copy-diagnostics button; the Inspector's System & recording section has the same copy-diagnostics export.
