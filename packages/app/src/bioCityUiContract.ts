export const bioCityStudioTitle = "CrowdSim BioCity Studio";

export const bioCityTopbarMetricLabels = [
  "Simulation",
  "Time",
  "Weather",
  "Footfall",
  "Online",
  "Sales",
  "Satisfaction",
  "Kernel",
] as const;

export const bioCityTopbarMetricText = [
  { en: "Simulation", zh: "仿真" },
  { en: "Time", zh: "时间" },
  { en: "Weather", zh: "天气" },
  { en: "Footfall", zh: "客流" },
  { en: "Online", zh: "在线" },
  { en: "Sales (est.)", zh: "销售·估" },
  { en: "Satisfaction (est.)", zh: "满意度·估" },
  { en: "Kernel", zh: "内核" },
] as const;

export const bioCityPlanningToolGroups = [
  {
    title: "Planning tools",
    tools: [
      ["Roads", "RD"],
      ["Terrain", "TR"],
      ["Districts", "DT"],
      ["Buildings", "BL"],
    ],
  },
  {
    title: "People & transit",
    tools: [
      ["Agents", "AG"],
      ["Flows", "FL"],
      ["Transit", "BU"],
      ["Parking", "PK"],
    ],
  },
  {
    title: "Analysis tools",
    tools: [
      ["Heatmap", "HM"],
      ["Sight", "VI"],
      ["Wind", "WD"],
      ["Commerce", "$"],
    ],
  },
  {
    title: "Amenities",
    tools: [
      ["Facilities", "PO"],
      ["Landscape", "LS"],
      ["Lighting", "LG"],
      ["Hazards", "R!"],
    ],
  },
] as const;

export const bioCityLayerNames = [
  "Heatmap",
  "Flow lines",
  "Wind",
  "POI",
  "Risk",
] as const;

export const bioCityPlanningToolGroupText = [
  {
    title: { en: "Planning tools", zh: "规划工具" },
    tools: [
      { icon: "RD", label: { en: "Roads", zh: "道路" } },
      { icon: "TR", label: { en: "Terrain", zh: "地形" } },
      { icon: "DT", label: { en: "Districts", zh: "地块" } },
      { icon: "BL", label: { en: "Buildings", zh: "建筑" } },
    ],
  },
  {
    title: { en: "People & transit", zh: "人群与交通" },
    tools: [
      { icon: "AG", label: { en: "Agents", zh: "人群" } },
      { icon: "FL", label: { en: "Flows", zh: "流线" } },
      { icon: "BU", label: { en: "Transit", zh: "公交" } },
      { icon: "PK", label: { en: "Parking", zh: "停车" } },
    ],
  },
  {
    title: { en: "Analysis tools", zh: "分析工具" },
    tools: [
      { icon: "HM", label: { en: "Heatmap", zh: "热力" } },
      { icon: "VI", label: { en: "Sight", zh: "视域" } },
      { icon: "WD", label: { en: "Wind", zh: "风环境" } },
      { icon: "$", label: { en: "Commerce", zh: "商业" } },
    ],
  },
  {
    title: { en: "Amenities", zh: "设施布置" },
    tools: [
      { icon: "PO", label: { en: "Facilities", zh: "设施" } },
      { icon: "LS", label: { en: "Landscape", zh: "绿化" } },
      { icon: "LG", label: { en: "Lighting", zh: "照明" } },
      { icon: "R!", label: { en: "Hazards", zh: "灾害" } },
    ],
  },
] as const;

export const bioCityLayerText = [
  { en: "Heatmap", zh: "人流热力" },
  { en: "Flow lines", zh: "人流线" },
  { en: "Wind", zh: "风环境" },
  { en: "POI", zh: "POI" },
  { en: "Risk", zh: "风险" },
] as const;

export const bioCityEvidencePanelLabels = [
  "BioCity visual acceptance",
  "BioCity analytics acceptance",
  "BioCity workspace acceptance",
  "BioCity final UI acceptance",
] as const;
