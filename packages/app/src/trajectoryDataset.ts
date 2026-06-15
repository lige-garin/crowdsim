export type TrajectoryDatasetMetadata = {
  id: string;
  name: string;
  source: string;
};

export type TrajectorySample = {
  pedestrianId: string;
  timeSeconds: number;
  xMeters: number;
  yMeters: number;
};

export type TrajectoryTrack = {
  pedestrianId: string;
  samples: readonly TrajectorySample[];
};

export type TrajectoryDataset = TrajectoryDatasetMetadata & {
  sampleCount: number;
  tracks: readonly TrajectoryTrack[];
};

export type TrajectoryCalibrationTarget = {
  densityEstimatePerSquareMeter: number;
  durationSeconds: number;
  targetMeanSpeedMetersPerSecond: number;
  targetThroughputPerMinute: number;
  trackCount: number;
};

const requiredColumns = {
  pedestrianId: ["pedestrian_id", "pedestrianId", "id"],
  timeSeconds: ["time_s", "timeSeconds", "t"],
  xMeters: ["x_m", "xMeters", "x"],
  yMeters: ["y_m", "yMeters", "y"],
};

export const demoTrajectoryCsv = [
  "pedestrian_id,time_s,x_m,y_m",
  "p1,0,0,1.0",
  "p1,1,1.2,1.0",
  "p1,2,2.4,1.1",
  "p1,3,3.7,1.1",
  "p2,0,0,2.1",
  "p2,1,1.0,2.1",
  "p2,2,2.1,2.2",
  "p2,3,3.2,2.2",
  "p3,0,0,3.0",
  "p3,1,0.8,3.1",
  "p3,2,1.7,3.1",
  "p3,3,2.8,3.2",
].join("\n");

export function parseTrajectoryDatasetCsv(
  csv: string,
  metadata: TrajectoryDatasetMetadata,
): TrajectoryDataset {
  const rows = parseCsv(csv);

  if (rows.length < 2) {
    throw new Error("Trajectory CSV must include a header and at least one sample");
  }

  const headers = rows[0].map((header) => header.trim());
  const columnIndexes = resolveColumnIndexes(headers);
  const tracks = new Map<string, TrajectorySample[]>();

  for (const [rowIndex, row] of rows.slice(1).entries()) {
    if (row.length === 0 || row.every((cell) => cell.trim().length === 0)) {
      continue;
    }

    const sample = parseSample(row, columnIndexes, rowIndex + 2);
    const samples = tracks.get(sample.pedestrianId) ?? [];
    samples.push(sample);
    tracks.set(sample.pedestrianId, samples);
  }

  const sortedTracks = [...tracks.entries()].map(([pedestrianId, samples]) => ({
    pedestrianId,
    samples: [...samples].sort((left, right) => left.timeSeconds - right.timeSeconds),
  }));

  return {
    ...metadata,
    sampleCount: sortedTracks.reduce((count, track) => count + track.samples.length, 0),
    tracks: sortedTracks,
  };
}

export function deriveTrajectoryCalibrationTarget(
  dataset: TrajectoryDataset,
): TrajectoryCalibrationTarget {
  const speeds: number[] = [];
  const allSamples = dataset.tracks.flatMap((track) => [...track.samples]);

  for (const track of dataset.tracks) {
    for (let index = 1; index < track.samples.length; index++) {
      const previous = track.samples[index - 1];
      const current = track.samples[index];
      const dt = current.timeSeconds - previous.timeSeconds;

      if (dt > 0) {
        speeds.push(
          Math.hypot(
            current.xMeters - previous.xMeters,
            current.yMeters - previous.yMeters,
          ) / dt,
        );
      }
    }
  }

  const minTime = Math.min(...allSamples.map((sample) => sample.timeSeconds));
  const maxTime = Math.max(...allSamples.map((sample) => sample.timeSeconds));
  const durationSeconds = Math.max(0, maxTime - minTime);
  const bounds = calculateBounds(allSamples);
  const boundingArea = Math.max(1, bounds.width * bounds.height);

  return {
    densityEstimatePerSquareMeter: round(dataset.tracks.length / boundingArea),
    durationSeconds: round(durationSeconds),
    targetMeanSpeedMetersPerSecond: round(mean(speeds)),
    targetThroughputPerMinute:
      durationSeconds > 0 ? round((dataset.tracks.length / durationSeconds) * 60) : 0,
    trackCount: dataset.tracks.length,
  };
}

function parseSample(
  row: readonly string[],
  columnIndexes: Record<keyof typeof requiredColumns, number>,
  rowNumber: number,
): TrajectorySample {
  const pedestrianId = row[columnIndexes.pedestrianId]?.trim();

  if (!pedestrianId) {
    throw new Error(`Trajectory row ${rowNumber} is missing pedestrian id`);
  }

  return {
    pedestrianId,
    timeSeconds: parseFiniteNumber(row[columnIndexes.timeSeconds], rowNumber, "time"),
    xMeters: parseFiniteNumber(row[columnIndexes.xMeters], rowNumber, "x"),
    yMeters: parseFiniteNumber(row[columnIndexes.yMeters], rowNumber, "y"),
  };
}

function resolveColumnIndexes(headers: readonly string[]) {
  return Object.fromEntries(
    Object.entries(requiredColumns).map(([field, aliases]) => {
      const index = aliases.findIndex((alias) => headers.includes(alias));
      const header = aliases[index];

      if (!header) {
        throw new Error(`Trajectory CSV is missing '${aliases[0]}' column`);
      }

      return [field, headers.indexOf(header)];
    }),
  ) as Record<keyof typeof requiredColumns, number>;
}

function parseCsv(csv: string) {
  return csv
    .trim()
    .split(/\r?\n/)
    .map((line) => splitCsvLine(line));
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function parseFiniteNumber(
  value: string | undefined,
  rowNumber: number,
  field: string,
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(`Trajectory row ${rowNumber} has invalid ${field} value`);
  }

  return number;
}

function calculateBounds(samples: readonly TrajectorySample[]) {
  const xs = samples.map((sample) => sample.xMeters);
  const ys = samples.map((sample) => sample.yMeters);

  return {
    height: Math.max(...ys) - Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
  };
}

function mean(values: readonly number[]) {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function round(value: number) {
  return Number(value.toFixed(4));
}
