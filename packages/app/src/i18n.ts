import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Language = "zh" | "en";

export type LocalizedText = Record<Language, string>;

type TranslationValues = Record<string, number | string>;

export const messages = {
  active: { zh: "进行中", en: "Active" },
  agentState: { zh: "Agent 状态", en: "Agent state" },
  agentStateMachineVerified: {
    zh: "状态机已验证",
    en: "Agent state machine verified",
  },
  agents: { zh: "人数", en: "Agents" },
  agentsUnit: { zh: "行人", en: "agents" },
  aiDraft: { zh: "AI 草稿", en: "AI draft" },
  aiDraftReady: { zh: "AI 草稿已就绪", en: "AI draft ready" },
  appName: { zh: "CrowdSim Web", en: "CrowdSim Web" },
  attraction: { zh: "吸引力", en: "Attraction" },
  basemap: { zh: "底图", en: "Basemap" },
  basemapHidden: { zh: "底图隐藏", en: "Basemap hidden" },
  basemapImageDistance: { zh: "图上距离", en: "Image distance" },
  basemapInvalid: { zh: "底图无效", en: "Basemap invalid" },
  basemapLocked: { zh: "底图已锁定", en: "Basemap locked" },
  basemapOpacity: { zh: "底图透明度", en: "Basemap opacity" },
  basemapRealDistance: { zh: "真实距离", en: "Real distance" },
  basemapRotation: { zh: "底图旋转", en: "Basemap rotation" },
  basemapScale: { zh: "底图缩放", en: "Basemap scale" },
  basemapUnlocked: { zh: "底图未锁定", en: "Basemap unlocked" },
  basemapVisible: { zh: "底图显示", en: "Basemap visible" },
  basemapX: { zh: "底图 X", en: "Basemap X" },
  basemapY: { zh: "底图 Y", en: "Basemap Y" },
  benchmarking: { zh: "性能测试", en: "Benchmarking" },
  behaviorAnalytics: { zh: "行为分析", en: "Behavior Analytics" },
  brandAttraction: { zh: "品牌吸引", en: "Brand pull" },
  cancelWall: { zh: "取消墙体", en: "Cancel wall" },
  capacity: { zh: "容量", en: "Capacity" },
  capacityPerMinute: { zh: "每分钟容量", en: "Capacity/min" },
  cells: { zh: "网格", en: "cells" },
  checking: { zh: "检查中", en: "Checking" },
  clear: { zh: "清除", en: "Clear" },
  computeProbe: { zh: "计算探针", en: "Compute Probe" },
  computeShaderComplete: {
    zh: "计算着色器完成",
    en: "Compute shader complete",
  },
  controlRoom: { zh: "控制台", en: "Control Room" },
  countLine: { zh: "计数线", en: "Count line" },
  countLineShort: { zh: "计数", en: "COUNT" },
  countLines: { zh: "计数线", en: "Count lines" },
  counter: { zh: "收银台", en: "Counter" },
  counterShort: { zh: "台", en: "CTR" },
  dashboard: { zh: "看板", en: "Dashboard" },
  dashboardMetrics: { zh: "看板指标", en: "Dashboard metrics" },
  dashboardV1: { zh: "看板 v1", en: "Dashboard v1" },
  dashboardV2: { zh: "看板 v2", en: "Dashboard v2" },
  dashboardV2Metrics: { zh: "看板 v2 指标", en: "Dashboard v2 metrics" },
  delete: { zh: "删除", en: "Delete" },
  densityHeatmap: { zh: "密度热力图", en: "Density heatmap" },
  decisionBackend: { zh: "决策后端", en: "Decision backend" },
  desQueue: { zh: "DES 队列", en: "DES queue" },
  desQueueVerified: { zh: "DES 队列已验证", en: "DES queue verified" },
  dwell: { zh: "停留", en: "Dwell" },
  editableSceneCanvas: { zh: "可编辑场景画布", en: "Editable scene canvas" },
  editorStatus: { zh: "编辑器状态", en: "Editor status" },
  editorTools: { zh: "编辑工具", en: "Editor tools" },
  engine: { zh: "引擎", en: "Engine" },
  entrances: { zh: "出入口", en: "Entrances" },
  evacuation: { zh: "疏散", en: "Evacuation" },
  evacuationCurve: { zh: "疏散曲线", en: "Evacuation curve" },
  evacuationExit: { zh: "疏散出口", en: "Evacuation exit" },
  evacuationRemainingCurve: {
    zh: "疏散剩余人数曲线",
    en: "Evacuation remaining curve",
  },
  evacuationTime: { zh: "疏散时间", en: "Evacuation time" },
  evacuate: { zh: "疏散", en: "Evacuate" },
  evacuating: { zh: "疏散中", en: "Evacuating" },
  events: { zh: "事件", en: "events" },
  exampleScene: { zh: "示例场景", en: "Example scene" },
  exited: { zh: "离开", en: "Exited" },
  export: { zh: "导出", en: "Export" },
  exportedScene: { zh: "已导出 .csim.json", en: "Exported .csim.json" },
  finishWall: { zh: "完成墙体", en: "Finish wall" },
  flow: { zh: "断面流量", en: "Flow" },
  flowField: { zh: "流场", en: "Flow field" },
  flowFieldVerified: { zh: "流场已验证", en: "Flow field verified" },
  gate: { zh: "闸机", en: "Gate" },
  gateShort: { zh: "闸", en: "GATE" },
  geoJsonImport: { zh: "导入 GeoJSON", en: "Import GeoJSON" },
  geoJsonInvalid: { zh: "GeoJSON 无效", en: "GeoJSON invalid" },
  generateStores: { zh: "生成店铺", en: "Generate stores" },
  gpuHeatmap: { zh: "GPU 热力图", en: "GPU heatmap" },
  gpuOnly: { zh: "仅 GPU", en: "GPU-only" },
  gridReadbackVerified: {
    zh: "网格回读已验证",
    en: "Grid readback verified",
  },
  hashGrid: { zh: "哈希网格", en: "Hash grid" },
  heatmap: { zh: "热力图", en: "Heatmap" },
  heatmapDensityVerified: {
    zh: "热力图密度已验证",
    en: "Heatmap density verified",
  },
  heatmapTimeWindow: { zh: "热力图时间窗口", en: "Heatmap time window" },
  height: { zh: "高度", en: "Height" },
  import: { zh: "导入", en: "Import" },
  importInvalid: { zh: "导入无效", en: "Import invalid" },
  importedFile: { zh: "已导入 {name}", en: "Imported {name}" },
  initializing: { zh: "初始化", en: "Initializing" },
  language: { zh: "语言", en: "Language" },
  liveAnalytics: { zh: "实时分析", en: "Live Analytics" },
  loadSaved: { zh: "加载存档", en: "Load saved" },
  loadedSavedScene: { zh: "已加载存档", en: "Loaded saved scene" },
  loadedScene: { zh: "已加载 {name}", en: "Loaded {name}" },
  loading: { zh: "加载中", en: "Loading" },
  milestoneQueue: { zh: "里程碑队列", en: "Milestone queue" },
  movementBackend: { zh: "移动后端", en: "Movement backend" },
  noCurve: { zh: "无曲线", en: "No curve" },
  noDecision: { zh: "无决策", en: "No decision" },
  noEvents: { zh: "无事件", en: "No events" },
  noEvacuationActive: { zh: "未触发疏散", en: "No evacuation active" },
  noObjectSelected: { zh: "未选择对象", en: "No object selected" },
  noQueue: { zh: "无队列", en: "No queue" },
  noReadback: { zh: "无回读", en: "No readback" },
  noSamples: { zh: "无样本", en: "No samples" },
  noSavedScene: { zh: "没有已存场景", en: "No saved scene" },
  noStates: { zh: "无状态", en: "No states" },
  noTracks: { zh: "无轨迹", en: "No tracks" },
  noWebGpuAdapter: { zh: "无 WebGPU 适配器", en: "No WebGPU adapter" },
  none: { zh: "无", en: "None" },
  normal: { zh: "正常", en: "Normal" },
  objectParameterPanel: { zh: "对象参数面板", en: "Object parameter panel" },
  parameters: { zh: "参数", en: "Parameters" },
  pause: { zh: "暂停", en: "Pause" },
  paused: { zh: "已暂停", en: "Paused" },
  peakDensity: { zh: "密度峰值", en: "Peak density" },
  populationCurve: { zh: "实时人数曲线", en: "Realtime population curve" },
  queued: { zh: "排队", en: "Queued" },
  queueLengthCurve: { zh: "队列长度曲线", en: "Queue length curve" },
  queuePeak: { zh: "队列峰值", en: "Queue peak" },
  queueSystem: { zh: "队列系统", en: "Queue system" },
  queueSystemVerified: { zh: "队列系统已验证", en: "Queue system verified" },
  readbackOk: { zh: "回读正常", en: "Readback ok" },
  ready: { zh: "就绪", en: "Ready" },
  redo: { zh: "重做", en: "Redo" },
  renderFailed: { zh: "渲染失败", en: "Render failed" },
  renderBenchmark: { zh: "WebGPU 渲染压测", en: "WebGPU render benchmark" },
  rendererFailed: { zh: "渲染器失败", en: "Renderer failed" },
  rendering: { zh: "渲染中", en: "Rendering" },
  renderStatus: { zh: "渲染状态", en: "Render status" },
  requestingGpu: { zh: "请求 GPU", en: "Requesting GPU" },
  reset: { zh: "重置", en: "Reset" },
  run: { zh: "进行中", en: "run" },
  running: { zh: "运行中", en: "Running" },
  save: { zh: "保存", en: "Save" },
  savedLocally: { zh: "已本地保存", en: "Saved locally" },
  savedSceneInvalid: { zh: "已存场景无效", en: "Saved scene invalid" },
  scaffold: { zh: "脚手架", en: "Scaffold" },
  scene: { zh: "场景", en: "Scene" },
  sceneEditor: { zh: "场景编辑器", en: "Scene editor" },
  sceneFileControls: { zh: "场景文件控制", en: "Scene file controls" },
  sceneSchema: { zh: "场景 Schema", en: "Scene schema" },
  select: { zh: "选择", en: "Select" },
  selected: { zh: "已选", en: "Selected" },
  service: { zh: "服务", en: "Service" },
  serviceDuration: { zh: "服务时长", en: "Service" },
  shop: { zh: "商铺", en: "Shop" },
  shopDecision: { zh: "商铺决策", en: "Shop decision" },
  shopDecisionVerified: {
    zh: "商铺决策已验证",
    en: "Shop decision verified",
  },
  shopEntry: { zh: "进店率", en: "Shop entry" },
  shopShort: { zh: "店", en: "SHOP" },
  shops: { zh: "商铺", en: "Shops" },
  simulationAgentLimit: { zh: "真实仿真上限", en: "Simulation agent limit" },
  simulationClock: { zh: "仿真时钟", en: "Simulation clock" },
  simulationControls: { zh: "仿真控制", en: "Simulation controls" },
  simulationSpeed: { zh: "仿真速度", en: "Simulation speed" },
  simulationViewport: { zh: "仿真视口", en: "Simulation viewport" },
  sink: { zh: "出口", en: "Exit" },
  sinkShort: { zh: "出", en: "OUT" },
  snap: { zh: "吸附", en: "Snap" },
  socialForce: { zh: "社会力", en: "Social force" },
  socialForceVerified: {
    zh: "社会力已验证",
    en: "Social force verified",
  },
  source: { zh: "入口", en: "Source" },
  sourceShort: { zh: "入", en: "IN" },
  speed: { zh: "速度", en: "Speed" },
  spawned: { zh: "生成", en: "Spawned" },
  standby: { zh: "待命", en: "Standby" },
  start: { zh: "开始", en: "Start" },
  starting: { zh: "启动中", en: "Starting" },
  systemSignals: { zh: "系统信号", en: "System signals" },
  target: { zh: "目标", en: "Target" },
  targetShort: { zh: "目", en: "T" },
  targets: { zh: "目标", en: "Targets" },
  tool: { zh: "工具", en: "Tool" },
  undo: { zh: "撤销", en: "Undo" },
  unavailable: { zh: "不可用", en: "Unavailable" },
  unknown: { zh: "未知", en: "Unknown" },
  valid: { zh: "有效", en: "valid" },
  view2d: { zh: "2D 视图", en: "2D view" },
  view2d5: { zh: "2.5D 视图", en: "2.5D view" },
  view2dPlan: { zh: "2D 平面", en: "2D plan" },
  view3d: { zh: "3D 视图", en: "3D view" },
  view3dPerspective: { zh: "3D 透视", en: "3D perspective" },
  viewMode: { zh: "视图模式", en: "View mode" },
  visualAgents: { zh: "视觉行人", en: "visual agents" },
  wall: { zh: "墙", en: "Wall" },
  walls: { zh: "墙", en: "Walls" },
  wasmAdd: { zh: "WASM 加法", en: "WASM add" },
  wasmBridge: { zh: "WASM 桥接", en: "WASM bridge" },
  webgpuProbe: { zh: "WebGPU 探针", en: "WebGPU probe" },
  webgpuProbeFailed: { zh: "WebGPU 探针失败", en: "WebGPU probe failed" },
  webgpuUnavailable: { zh: "WebGPU 不可用", en: "WebGPU unavailable" },
  width: { zh: "宽度", en: "Width" },
  zone: { zh: "区域", en: "Zone" },
  zoneBlocked: { zh: "不可通行", en: "Blocked" },
  zoneCategory: { zh: "区域类型", en: "Zone type" },
  zoneWalkable: { zh: "可通行", en: "Walkable" },
  zones: { zh: "区域", en: "Zones" },
} as const satisfies Record<string, LocalizedText>;

export type TranslationKey = keyof typeof messages;

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
  text: (value: LocalizedText) => string;
  toggleLanguage: () => void;
};

const languageStorageKey = "crowdsim.language";
const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  useEffect(() => {
    localStorage.setItem(languageStorageKey, language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
  }, []);

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) =>
      interpolate(getMessage(language, key), values),
    [language],
  );

  const text = useCallback((value: LocalizedText) => value[language], [language]);

  const toggleLanguage = useCallback(() => {
    setLanguageState((current) => (current === "zh" ? "en" : "zh"));
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      text,
      toggleLanguage,
    }),
    [language, setLanguage, t, text, toggleLanguage],
  );

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }

  return context;
}

export function translate(
  language: Language,
  key: TranslationKey,
  values?: TranslationValues,
) {
  return interpolate(getMessage(language, key), values);
}

export function localize(language: Language, value: LocalizedText) {
  return value[language];
}

export function formatProbeMessage(message: string, language: Language) {
  const key = probeMessageKeys[message];

  return key ? translate(language, key) : message;
}

export function formatBehaviorModeLabel(label: string, language: Language) {
  if (label === "Evacuating") {
    return translate(language, "evacuating");
  }

  if (label === "Normal") {
    return translate(language, "normal");
  }

  return label;
}

export function formatEditorTool(tool: string, language: Language) {
  const key = editorToolKeys[tool];

  return key ? translate(language, key) : tool;
}

function getMessage(language: Language, key: TranslationKey) {
  return language === "zh" ? (zhOverrides[key] ?? messages[key].zh) : messages[key].en;
}

export function formatSceneName(
  scene: { id: string; name: string },
  language: Language,
) {
  const knownName = sceneNames[scene.id];

  if (knownName) {
    return language === "zh" ? (zhSceneNames[scene.id] ?? knownName.zh) : knownName.en;
  }

  if (scene.name === "AI Mall Draft") {
    return language === "zh" ? "AI 商场草稿" : scene.name;
  }

  if (scene.name === "AI Scene Draft") {
    return language === "zh" ? "AI 场景草稿" : scene.name;
  }

  return scene.name;
}

const zhSceneNames: Record<string, string> = {
  "atrium-demo": "中庭示例",
  "mall-atrium": "商场中庭",
  "metro-station-hall": "地铁站厅",
  "performance-venue": "演出场馆疏散",
};

function readStoredLanguage(): Language {
  if (typeof localStorage === "undefined") {
    return "zh";
  }

  const stored = localStorage.getItem(languageStorageKey);

  return stored === "en" || stored === "zh" ? stored : "zh";
}

function interpolate(message: string, values?: TranslationValues) {
  if (!values) {
    return message;
  }

  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    message,
  );
}

const probeMessageKeys: Record<string, TranslationKey> = {
  "Agent state machine verified": "agentStateMachineVerified",
  Checking: "checking",
  "Compute shader complete": "computeShaderComplete",
  "DES queue verified": "desQueueVerified",
  "Flow field verified": "flowFieldVerified",
  "Grid readback verified": "gridReadbackVerified",
  "Heatmap density verified": "heatmapDensityVerified",
  Loading: "loading",
  "No WebGPU adapter": "noWebGpuAdapter",
  "Queue system verified": "queueSystemVerified",
  "Shop decision verified": "shopDecisionVerified",
  "Social force verified": "socialForceVerified",
  Unavailable: "unavailable",
  "WebGPU probe failed": "webgpuProbeFailed",
  "WebGPU unavailable": "webgpuUnavailable",
};

const zhOverrides: Partial<Record<TranslationKey, string>> = {
  active: "进行中",
  agentState: "Agent 状态",
  agentStateMachineVerified: "状态机已验证",
  agents: "人数",
  agentsUnit: "行人",
  aiDraft: "AI 草稿",
  aiDraftReady: "AI 草稿已就绪",
  appName: "CrowdSim Web",
  behaviorAnalytics: "行为分析",
  benchmarking: "性能测试",
  brandAttraction: "品牌吸引",
  cells: "网格",
  checking: "检查中",
  clear: "清除",
  computeProbe: "计算探针",
  computeShaderComplete: "计算着色器完成",
  controlRoom: "控制台",
  dashboard: "看板",
  dashboardMetrics: "看板指标",
  dashboardV1: "看板 v1",
  dashboardV2: "看板 v2",
  dashboardV2Metrics: "看板 v2 指标",
  decisionBackend: "决策后端",
  densityHeatmap: "密度热力图",
  desQueue: "DES 队列",
  desQueueVerified: "DES 队列已验证",
  engine: "引擎",
  evacuation: "疏散",
  evacuationCurve: "疏散曲线",
  evacuationExit: "疏散出口",
  evacuationRemainingCurve: "疏散剩余人数曲线",
  evacuationTime: "疏散时间",
  evacuate: "疏散",
  evacuating: "疏散中",
  events: "事件",
  exited: "离开",
  flow: "断面流量",
  flowField: "流场",
  flowFieldVerified: "流场已验证",
  gpuHeatmap: "GPU 热力图",
  gridReadbackVerified: "网格回读已验证",
  hashGrid: "哈希网格",
  heatmap: "热力图",
  heatmapDensityVerified: "热力图密度已验证",
  heatmapTimeWindow: "热力图时间窗口",
  initializing: "初始化",
  language: "语言",
  liveAnalytics: "实时分析",
  loading: "加载中",
  milestoneQueue: "里程碑队列",
  movementBackend: "移动后端",
  noCurve: "无曲线",
  noDecision: "无决策",
  noEvents: "无事件",
  noEvacuationActive: "未触发疏散",
  noQueue: "无队列",
  noReadback: "无回读",
  noSamples: "无样本",
  noStates: "无状态",
  noWebGpuAdapter: "无 WebGPU 适配器",
  none: "无",
  normal: "正常",
  pause: "暂停",
  paused: "已暂停",
  peakDensity: "密度峰值",
  populationCurve: "实时人数曲线",
  queued: "排队",
  queueLengthCurve: "队列长度曲线",
  queuePeak: "队列峰值",
  queueSystem: "队列系统",
  queueSystemVerified: "队列系统已验证",
  readbackOk: "回读正常",
  ready: "就绪",
  renderBenchmark: "WebGPU 渲染压测",
  renderFailed: "渲染失败",
  rendererFailed: "渲染器失败",
  rendering: "渲染中",
  renderStatus: "渲染状态",
  requestingGpu: "请求 GPU",
  reset: "重置",
  run: "运行",
  running: "运行中",
  scaffold: "脚手架",
  sceneSchema: "场景 Schema",
  shopDecision: "商铺决策",
  shopDecisionVerified: "商铺决策已验证",
  shopEntry: "进店率",
  simulationAgentLimit: "真实仿真上限",
  simulationClock: "仿真时钟",
  simulationControls: "仿真控制",
  simulationSpeed: "仿真速度",
  simulationViewport: "仿真视口",
  socialForce: "社会力",
  socialForceVerified: "社会力已验证",
  speed: "速度",
  spawned: "生成",
  standby: "待命",
  start: "开始",
  starting: "启动中",
  systemSignals: "系统信号",
  valid: "有效",
  view2d: "2D 视图",
  view2dPlan: "2D 平面",
  view3d: "3D 视图",
  view3dPerspective: "3D 透视",
  viewMode: "视图模式",
  visualAgents: "视觉行人",
  wasmAdd: "WASM 加法",
  wasmBridge: "WASM 桥接",
  webgpuProbe: "WebGPU 探针",
  webgpuProbeFailed: "WebGPU 探针失败",
  webgpuUnavailable: "WebGPU 不可用",
};

const editorToolKeys: Record<string, TranslationKey> = {
  countLine: "countLine",
  counter: "counter",
  gate: "gate",
  select: "select",
  shop: "shop",
  sink: "sink",
  source: "source",
  target: "target",
  wall: "wall",
  zone: "zone",
};

const sceneNames: Record<string, LocalizedText> = {
  "atrium-demo": { zh: "中庭示例", en: "Atrium Demo" },
  "mall-atrium": { zh: "商场中庭", en: "Mall Atrium" },
  "metro-station-hall": { zh: "地铁站厅", en: "Metro Station Hall" },
  "performance-venue": {
    zh: "演出场馆疏散",
    en: "Performance Venue Evacuation",
  },
};
