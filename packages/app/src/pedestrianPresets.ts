export type PedestrianPresetId =
  | "crew-female"
  | "crew-male"
  | "female-30-50"
  | "female-impaired-1"
  | "female-impaired-2"
  | "female-over-50"
  | "female-under-30"
  | "male-30-50"
  | "male-impaired-1"
  | "male-impaired-2"
  | "male-over-50"
  | "male-under-30";

export type PedestrianSpeedRange = {
  maxMetersPerSecond: number;
  minMetersPerSecond: number;
};

export type PedestrianPreset = {
  category: "crew" | "passenger";
  flatTerrainSpeed: PedestrianSpeedRange;
  id: PedestrianPresetId;
  label: string;
  passengerSharePercent?: number;
  source: {
    label: string;
    section: string;
    url: string;
  };
  stairDownSpeed: PedestrianSpeedRange;
  stairUpSpeed: PedestrianSpeedRange;
};

const imoSource = {
  label: "IMO MSC.1/Circ.1533, Annex 3, Tables 3.1, 3.4 and 3.5",
  section: "Advanced evacuation analysis population and speed parameters",
  url: "https://edocs.imo.org/Final%20Documents/English/MSC.1-CIRC.1533%20(E).docx",
};

export const pedestrianPresets: readonly PedestrianPreset[] = [
  {
    category: "passenger",
    flatTerrainSpeed: range(0.93, 1.55),
    id: "female-under-30",
    label: "Females younger than 30 years",
    passengerSharePercent: 7,
    source: imoSource,
    stairDownSpeed: range(0.56, 0.94),
    stairUpSpeed: range(0.47, 0.79),
  },
  {
    category: "passenger",
    flatTerrainSpeed: range(0.71, 1.19),
    id: "female-30-50",
    label: "Females 30-50 years old",
    passengerSharePercent: 7,
    source: imoSource,
    stairDownSpeed: range(0.49, 0.81),
    stairUpSpeed: range(0.44, 0.74),
  },
  {
    category: "passenger",
    flatTerrainSpeed: range(0.56, 0.94),
    id: "female-over-50",
    label: "Females older than 50 years",
    passengerSharePercent: 16,
    source: imoSource,
    stairDownSpeed: range(0.45, 0.75),
    stairUpSpeed: range(0.37, 0.61),
  },
  {
    category: "passenger",
    flatTerrainSpeed: range(0.43, 0.71),
    id: "female-impaired-1",
    label: "Females older than 50, mobility impaired (1)",
    passengerSharePercent: 10,
    source: imoSource,
    stairDownSpeed: range(0.34, 0.56),
    stairUpSpeed: range(0.28, 0.46),
  },
  {
    category: "passenger",
    flatTerrainSpeed: range(0.37, 0.61),
    id: "female-impaired-2",
    label: "Females older than 50, mobility impaired (2)",
    passengerSharePercent: 10,
    source: imoSource,
    stairDownSpeed: range(0.29, 0.49),
    stairUpSpeed: range(0.23, 0.39),
  },
  {
    category: "passenger",
    flatTerrainSpeed: range(1.11, 1.85),
    id: "male-under-30",
    label: "Males younger than 30 years",
    passengerSharePercent: 7,
    source: imoSource,
    stairDownSpeed: range(0.76, 1.26),
    stairUpSpeed: range(0.5, 0.84),
  },
  {
    category: "passenger",
    flatTerrainSpeed: range(0.97, 1.62),
    id: "male-30-50",
    label: "Males 30-50 years old",
    passengerSharePercent: 7,
    source: imoSource,
    stairDownSpeed: range(0.64, 1.07),
    stairUpSpeed: range(0.47, 0.79),
  },
  {
    category: "passenger",
    flatTerrainSpeed: range(0.84, 1.4),
    id: "male-over-50",
    label: "Males older than 50 years",
    passengerSharePercent: 16,
    source: imoSource,
    stairDownSpeed: range(0.5, 0.84),
    stairUpSpeed: range(0.38, 0.64),
  },
  {
    category: "passenger",
    flatTerrainSpeed: range(0.64, 1.06),
    id: "male-impaired-1",
    label: "Males older than 50, mobility impaired (1)",
    passengerSharePercent: 10,
    source: imoSource,
    stairDownSpeed: range(0.38, 0.64),
    stairUpSpeed: range(0.29, 0.49),
  },
  {
    category: "passenger",
    flatTerrainSpeed: range(0.55, 0.91),
    id: "male-impaired-2",
    label: "Males older than 50, mobility impaired (2)",
    passengerSharePercent: 10,
    source: imoSource,
    stairDownSpeed: range(0.33, 0.55),
    stairUpSpeed: range(0.25, 0.41),
  },
  {
    category: "crew",
    flatTerrainSpeed: range(0.93, 1.55),
    id: "crew-female",
    label: "Crew females",
    source: imoSource,
    stairDownSpeed: range(0.56, 0.94),
    stairUpSpeed: range(0.47, 0.79),
  },
  {
    category: "crew",
    flatTerrainSpeed: range(1.11, 1.85),
    id: "crew-male",
    label: "Crew males",
    source: imoSource,
    stairDownSpeed: range(0.76, 1.26),
    stairUpSpeed: range(0.5, 0.84),
  },
];

export function getPedestrianPreset(id: PedestrianPresetId) {
  return pedestrianPresets.find((preset) => preset.id === id);
}

export function calculateSpeedRangeMean(range: PedestrianSpeedRange) {
  return (range.minMetersPerSecond + range.maxMetersPerSecond) / 2;
}

export function calculatePassengerShareTotal() {
  return pedestrianPresets
    .filter((preset) => preset.category === "passenger")
    .reduce((sum, preset) => sum + (preset.passengerSharePercent ?? 0), 0);
}

export function createPedestrianPresetSummary(preset: PedestrianPreset) {
  return {
    flatTerrainMeanMetersPerSecond: roundPresetValue(
      calculateSpeedRangeMean(preset.flatTerrainSpeed),
    ),
    id: preset.id,
    label: preset.label,
    sourceLabel: preset.source.label,
    stairDownMeanMetersPerSecond: roundPresetValue(
      calculateSpeedRangeMean(preset.stairDownSpeed),
    ),
    stairUpMeanMetersPerSecond: roundPresetValue(
      calculateSpeedRangeMean(preset.stairUpSpeed),
    ),
  };
}

function range(
  minMetersPerSecond: number,
  maxMetersPerSecond: number,
): PedestrianSpeedRange {
  return {
    maxMetersPerSecond,
    minMetersPerSecond,
  };
}

function roundPresetValue(value: number) {
  return Number(value.toFixed(3));
}
