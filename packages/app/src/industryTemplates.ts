import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { exampleScenes } from "./exampleScenes";

export type IndustryTemplate = {
  description: {
    en: string;
    zh: string;
  };
  id: string;
  recommended: {
    arrivalRatePerMinute: number;
    maxAgents: number;
    speedMetersPerSecond: number;
  };
  scene: CrowdSimScene;
};

export const industryTemplates: readonly IndustryTemplate[] = [
  {
    description: {
      en: "Rail station concourse with platform and ticket barrier flows.",
      zh: "地铁站厅，包含站台与闸机客流。",
    },
    id: "metro-station-hall",
    recommended: {
      arrivalRatePerMinute: 180,
      maxAgents: 2_500,
      speedMetersPerSecond: 1.28,
    },
    scene: exampleScenes[0],
  },
  {
    description: {
      en: "Retail atrium with shopfront obstacles and cross-mall movement.",
      zh: "商场中庭，包含店铺界面与横向客流。",
    },
    id: "mall-atrium",
    recommended: {
      arrivalRatePerMinute: 150,
      maxAgents: 2_000,
      speedMetersPerSecond: 1.18,
    },
    scene: exampleScenes[1],
  },
  {
    description: {
      en: "Performance venue ingress and evacuation with multiple exits.",
      zh: "演出场馆进场与疏散，多出口布局。",
    },
    id: "performance-venue",
    recommended: {
      arrivalRatePerMinute: 240,
      maxAgents: 3_200,
      speedMetersPerSecond: 1.22,
    },
    scene: exampleScenes[2],
  },
  {
    description: {
      en: "Airport security hall with queue lanes and gate capacity controls.",
      zh: "机场安检大厅，包含排队通道与闸口能力。",
    },
    id: "airport-security",
    recommended: {
      arrivalRatePerMinute: 210,
      maxAgents: 2_800,
      speedMetersPerSecond: 1.12,
    },
    scene: parseScene({
      schemaVersion: "1.0.0",
      id: "airport-security",
      name: "Airport Security Checkpoint",
      seed: 404,
      world: { width: 104, height: 58 },
      walls: [
        {
          id: "queue-rail-a",
          geometry: {
            type: "polyline",
            points: [
              { x: 18, y: 18 },
              { x: 82, y: 18 },
            ],
          },
        },
        {
          id: "queue-rail-b",
          geometry: {
            type: "polyline",
            points: [
              { x: 18, y: 30 },
              { x: 82, y: 30 },
            ],
          },
        },
      ],
      entrances: [
        {
          id: "terminal-entry",
          kind: "source",
          position: { x: 8, y: 46 },
          width: 8,
          arrivalRatePerMinute: 210,
        },
        {
          id: "secure-side",
          kind: "sink",
          position: { x: 96, y: 12 },
          width: 6,
        },
      ],
      areas: [floorArea("security-floor", 104, 58)],
      servicePoints: [
        {
          id: "lane-a",
          kind: "gate",
          position: { x: 76, y: 22 },
          width: 4,
          serviceMeanSeconds: 18,
          capacityPerMinute: 95,
        },
      ],
      // Admin block in the top-left corner, clear of both queue rails
      // (x starts at 18) and both entrances. Kind "transit" biases the
      // generated city toward a denser interchange skyline.
      buildings: [
        {
          id: "check-in-hall",
          name: "Check-in Hall",
          kind: "transit",
          footprint: {
            type: "polygon",
            points: [
              { x: 2, y: 2 },
              { x: 16, y: 2 },
              { x: 16, y: 16 },
              { x: 2, y: 16 },
            ],
          },
          floors: 2,
          heightMeters: 9,
          visual: { style: "transit-office" },
        },
      ],
      shops: [
        {
          id: "duty-free-kiosk",
          name: "Duty-Free Kiosk",
          position: { x: 90, y: 40 },
          entrancePosition: { x: 90, y: 36 },
          size: { width: 8, height: 7 },
          attraction: 1.0,
          dwellMeanSeconds: 120,
          brand: {
            profileId: "duty-free-kiosk",
            category: "luxury",
            visibility: 0.6,
          },
        },
      ],
    }),
  },
  {
    description: {
      en: "Hospital outpatient clinic with triage, waiting, and care counters.",
      zh: "医院门诊，包含分诊、候诊与服务台。",
    },
    id: "hospital-outpatient",
    recommended: {
      arrivalRatePerMinute: 90,
      maxAgents: 1_400,
      speedMetersPerSecond: 1.05,
    },
    scene: parseScene({
      schemaVersion: "1.0.0",
      id: "hospital-outpatient",
      name: "Hospital Outpatient Clinic",
      seed: 505,
      world: { width: 82, height: 54 },
      walls: [
        {
          id: "clinic-corridor",
          geometry: {
            type: "polyline",
            points: [
              { x: 18, y: 16 },
              { x: 64, y: 16 },
              { x: 64, y: 36 },
            ],
          },
        },
      ],
      entrances: [
        {
          id: "main-entry",
          kind: "source",
          position: { x: 6, y: 44 },
          width: 5,
          arrivalRatePerMinute: 90,
        },
        {
          id: "clinic-exit",
          kind: "sink",
          position: { x: 76, y: 10 },
          width: 5,
        },
      ],
      areas: [floorArea("clinic-floor", 82, 54)],
      servicePoints: [
        {
          id: "triage",
          kind: "counter",
          position: { x: 28, y: 32 },
          width: 4,
          serviceMeanSeconds: 45,
          capacityPerMinute: 55,
        },
      ],
      targets: [{ id: "waiting", position: { x: 42, y: 38 }, radius: 3 }],
      // Ward wing tucked into the bottom-right corner, clear of the
      // clinic-corridor wall, the entry/exit pair, and triage/waiting. Kind
      // "civic" biases the generated city toward a calmer institutional
      // skyline rather than a downtown mall's towers.
      buildings: [
        {
          id: "ward-wing",
          name: "Ward Wing",
          kind: "civic",
          footprint: {
            type: "polygon",
            points: [
              { x: 66, y: 40 },
              { x: 80, y: 40 },
              { x: 80, y: 52 },
              { x: 66, y: 52 },
            ],
          },
          floors: 3,
          heightMeters: 11,
          visual: { style: "venue-civic" },
        },
      ],
    }),
  },
  {
    description: {
      en: "Stadium concourse with gate inflow and radial exit choices.",
      zh: "体育场环廊，包含闸口进场与多出口选择。",
    },
    id: "stadium-concourse",
    recommended: {
      arrivalRatePerMinute: 320,
      maxAgents: 4_500,
      speedMetersPerSecond: 1.24,
    },
    scene: parseScene({
      schemaVersion: "1.0.0",
      id: "stadium-concourse",
      name: "Stadium Concourse",
      seed: 606,
      world: { width: 108, height: 72 },
      walls: [
        {
          id: "inner-bowl",
          geometry: {
            type: "polygon",
            points: [
              { x: 34, y: 22 },
              { x: 74, y: 22 },
              { x: 78, y: 50 },
              { x: 30, y: 50 },
            ],
          },
        },
      ],
      entrances: [
        {
          id: "south-gate",
          kind: "source",
          position: { x: 54, y: 68 },
          width: 12,
          arrivalRatePerMinute: 320,
        },
        {
          id: "west-exit",
          kind: "sink",
          position: { x: 6, y: 34 },
          width: 8,
        },
        {
          id: "east-exit",
          kind: "sink",
          position: { x: 102, y: 34 },
          width: 8,
        },
      ],
      areas: [floorArea("stadium-floor", 108, 72)],
      countLines: [
        {
          id: "concourse-flow",
          geometry: {
            type: "polyline",
            points: [
              { x: 20, y: 58 },
              { x: 88, y: 58 },
            ],
          },
        },
      ],
      // A concourse structure north of the bowl (bowl's own top edge is
      // y=22, so this leaves an 8m gap), clear of south-gate and both
      // exits. Kind "civic" fits a large public venue's calmer surroundings.
      buildings: [
        {
          id: "concourse-pavilion",
          name: "Concourse Pavilion",
          kind: "civic",
          footprint: {
            type: "polygon",
            points: [
              { x: 44, y: 2 },
              { x: 64, y: 2 },
              { x: 64, y: 12 },
              { x: 44, y: 12 },
            ],
          },
          floors: 1,
          heightMeters: 7,
          visual: { style: "venue-civic" },
        },
      ],
      shops: [
        {
          id: "concession-east",
          name: "Concession Stand",
          position: { x: 94, y: 44 },
          entrancePosition: { x: 90, y: 44 },
          size: { width: 8, height: 6 },
          attraction: 1.0,
          dwellMeanSeconds: 100,
          brand: {
            profileId: "concession-east",
            category: "dining",
            visibility: 0.6,
          },
        },
        {
          id: "team-store",
          name: "Team Store",
          position: { x: 94, y: 28 },
          entrancePosition: { x: 90, y: 28 },
          size: { width: 8, height: 8 },
          attraction: 1.1,
          dwellMeanSeconds: 150,
          brand: {
            profileId: "team-store",
            category: "entertainment",
            visibility: 0.65,
          },
        },
      ],
    }),
  },
];

export const templateScenes = industryTemplates.map((template) => template.scene);

function floorArea(id: string, width: number, height: number) {
  return {
    id,
    geometry: {
      type: "polygon" as const,
      points: [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ],
    },
  };
}
