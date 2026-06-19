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

export const bioCityEvidencePanelLabels = [
  "BioCity visual acceptance",
  "BioCity analytics acceptance",
  "BioCity workspace acceptance",
  "BioCity final UI acceptance",
] as const;
