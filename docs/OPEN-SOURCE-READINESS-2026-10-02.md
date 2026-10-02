# 开源就绪审查（2026-10-02）

> 对象：`E:\crowdsim` @ `90f0b14`。GitHub 远端 `lige-garin/crowdsim` 当前 **PRIVATE**，默认分支 `city-sim-engine`，共 279 个提交。
> 本次为**只读审查**：全部结论来自 git ls-files / git log -S / 工作区扫描，未改任何文件。
> 背景：`docs/superpowers/plans/2026-09-24-open-source-and-ux-overhaul-plan.md` 已执行过一轮开源整治，本报告核对其残余。

---

## 1. 结论

**仓库离公开只差 1 个硬阻塞 + 2 个诚信阻塞 + 4 个待拍板项。**
无密钥泄漏、无 PII、无敏感数据集——安全面是干净的，这轮可以直接给绿灯。

## 2. 已就绪（核实过）

| 项                                                           | 状态                                                                                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LICENSE / NOTICE / CONTRIBUTING / SECURITY / CODE_OF_CONDUCT | ✓ 齐备，Apache-2.0，web-ifc MPL-2.0 已在 NOTICE 声明                                                                                                                 |
| **全历史密钥扫描**                                           | ✓ 干净。`git log --all -S` 扫 ghp\_/AKIA/已知密钥串：唯一命中是 `apiKeySafety.test.ts` 自己的假样本与正则模式；已删除的 backend 里只有 `"demo-read-only"` 固定 token |
| **PII 扫描**                                                 | ✓ CLAUDE.md / CLAIMS_LEDGER / README 无电话、无邮箱、无个人姓名                                                                                                      |
| **第三方数据集**                                             | ✓ eth-biwi-eth.txt 已从分发中移除（.gitignore + 按需下载 + sha256 校验，`docs/calibration/data/README.md` 写得很规范）                                               |
| 敏感目录                                                     | ✓ `.gitignore` 覆盖 `.workbuddy/ .claude/ dev-server.log output/ test-results/ e2e-fs-patch.cjs`，均未跟踪                                                           |
| CC0 角色资产                                                 | ✓ Quaternius 资产有高质量许可档案                                                                                                                                    |
| CI                                                           | ✓ 触发分支已含 `city-sim-engine`，八道门禁                                                                                                                           |

## 3. 公开前必须修（不修不能按）

### 硬阻塞：无许可档案的第三方资产

`packages/app/public/assets/demo-scene/rain-market-streetscape.glb`（1.7 MB，已跟踪，
随 dist 分发，默认演示场景依赖它）**全仓库无任何来源/许可记录**。Apache-2.0 再分发
第三方资产必须有据，这是合规面唯一的实质窟窿。处置选项见第 5 节问题 1。

### 诚信阻塞（本项目命门，发布当天被读者发现就是最差开局）

1. **README L29-35 已过时为假**：「100k GPU 核未接线 / zero importers from app」——
   ADR-0033 stage 1-4 已完成真实接线（真机验证 webgpu active、交叉点 750–1000 人）。
   正确口径：「已接线、默认关闭、当前规模下 750–1000 人以下 CPU 更快」。
2. **docs/ARCHITECTURE.md 更旧**：仍列 9-24 已删除的 backend/collab 包；仍写
   「CPU 直线移动是默认」（9-14 起已是社会力模型）。
3. **（建议同批修）模板 max 4500 vs 引擎 2000 硬顶静默截断**——开源用户同样会踩，
   且会被 issue 打脸。

## 4. 发布动作清单（拍板后执行，约 1 天）

1. 修 README + ARCHITECTURE 宣称对齐；模板 maxAgents 对齐或 UI 明示上限。
2. glb 按拍板处置。
3. `/ponytail-review` → `PONYTAIL_REVIEWED=1 git commit` → push。
4. GitHub 仓库设置：description、topics、social preview 图、Issues/Discussions 开关。
5. `gh repo edit --visibility public`（或你在网页上手动切）。
6. 发布冒烟：fresh clone → `pnpm install` → `pnpm dev` → 跑通模板流程；确认 CI 绿。

## 5. 拍板结果（2026-10-02，用户已确认）

1. **glb**：移除，默认演示场景换自有/CC0 场景。
2. **内部文档**：只留 CLAIMS_LEDGER（CLAUDE.md 与 docs/superpowers/ 移除）。
3. **提交邮箱**：用 GitHub noreply 重写全历史。
4. **默认分支**：改名为 main。

## 6. 执行方案（待「开干」确认后执行）

### 批次 1：内容修改（正常 commit，先过 ponytail-review）

| #   | 动作                 | 范围                                                                                                                                                                                                                               |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | README 宣称对齐      | L29-35 GPU 段改写为「已接线、默认关、750–1000 人以下 CPU 更快」；删 L11 对 CLAUDE.md 的引用；补天气面板网络例外一句                                                                                                                |
| 2   | ARCHITECTURE.md 刷新 | 删 backend/collab 段落；改「CPU 直线移动是默认」为社会力模型现状                                                                                                                                                                   |
| 3   | 移除内部文档         | 删 CLAUDE.md、docs/superpowers/；修 CONTRIBUTING.md L62 对 CLAUDE.md 的引用                                                                                                                                                        |
| 4   | glb 摘除             | 删 rain-market-streetscape.glb（+.high/.low 若存在）；defaultDemoScene 改用不依赖 glb 的模板/程序化场景；清理渲染侧引用（sceneModelAssets / streetscapeBlueprint / sceneRenderPlan 等）；更新受影响测试（~15 个文件引用该场景 id） |
| 5   | 模板规模对齐         | 模板携带 simulation.maxAgents，或在达到上限时 UI 明示（P0-2 修复）                                                                                                                                                                 |
| 6   | 清扫文档中的邮箱     | 本文与 REVIEW-2026-10-02.md 里的 lglc930@gmail.com 字样改写（否则重写历史后又被文档泄回）                                                                                                                                          |

### 批次 2：历史重写（一次 filter-repo，一次强推完成全部三件事）

- 作者/提交者邮箱 → `{id}+lige-garin@users.noreply.github.com`（id 用 `gh api user` 取）。
- 从**全历史**剥离：CLAUDE.md、docs/superpowers/（决策 2 的彻底版——既然反正要重写，一并抹净）。
- 从**全历史**剥离 rain-market-streetscape.glb（未核许可的资产不留在历史 blob 里，顺带仓库瘦身）。
- 注意事项：279 个 commit hash 全部变化；强推后 CI 重跑；本地 .workbuddy 记忆里的旧 hash 作废（已知，可接受）；重写前先打本地备份分支+bundle。

### 批次 3：发布

1. 分支改名 city-sim-engine → main，CI 触发分支同步，远端默认分支切换。
2. GitHub 设置：description、topics（crowd-simulation, webgpu, threejs, social-force, rimea…）、social preview 图、Issues/Discussions。
3. `gh repo edit --visibility public`（或网页手动）。
4. 发布冒烟：fresh clone → pnpm install → pnpm dev 跑通模板流程；CI 全绿；确认历史里无旧邮箱、无 CLAUDE.md、无 glb。

### 顺序依赖

批次 1 → ponytail-review → commit → **然后**批次 2（重写把批次 1 的删除一并带入历史）→ force push → 批次 3。

### 待定/风险

- glb 的 CC0 替代资产若需下载第三方模型，按约定**先问你**；默认方案是改用不依赖 glb 的现有模板场景（零新资产）。
- git-filter-repo 需安装（pip 装，或单文件下载）。

---

## 附：本次扫描命令

```bash
git ls-files / du（垃圾文件与大文件核查）
git log --all -S "ghp_|AKIA|已知密钥串|手机号"（全历史密钥与 PII）
git show f67e3c6 | grep -iE "password|secret|token|..."（已删 backend 的遗留检查）
grep PII 模式 CLAUDE.md docs/CLAIMS_LEDGER.md README.md
gh repo view --json visibility
```
