import { hashUnit } from "./behaviorDistributions";
import {
  getPedestrianPreset,
  pedestrianPresets,
  type PedestrianPresetId,
  type PedestrianSpeedRange,
} from "./pedestrianPresets";

/**
 * Drawing a person from a declared population (ADR-0011).
 *
 * A scene can say who its crowd is made of — so many per cent from each of the
 * published walking profiles in `pedestrianPresets`. Someone drawn from one of
 * them walks at that profile's speed, on the flat and on stairs, instead of at
 * the engine's single default.
 *
 * **A scene that says nothing keeps the default**, which is what every scene
 * written before this did: one speed distribution for everybody, fitted to
 * Weidmann's free-flow figure.
 *
 * What this is not: the profiles are IMO's ship-evacuation population. Using
 * them says "this crowd walks like that population", which is a claim about
 * walking speed and nothing else — no age, no sex, no behaviour follows from
 * the label, and none of it is calibrated against this project's own scenes.
 */

export type PopulationMix = readonly { profileId: string; share: number }[];

/** What a drawn person walks like. All speeds in m/s. */
export type SampledPerson = {
  /** The profile drawn, for reporting what the run actually used. */
  profileId: PedestrianPresetId;
  freeSpeedMetersPerSecond: number;
  stairUpMetersPerSecond: number;
  stairDownMetersPerSecond: number;
};

/**
 * The population an arrival through this entrance belongs to: the door's own if
 * it declares one, otherwise the scene's, otherwise none.
 */
export function populationFor(
  scene: { population?: { mix: PopulationMix } },
  entrance?: { population?: { mix: PopulationMix } },
): PopulationMix | undefined {
  const mix = entrance?.population?.mix ?? scene.population?.mix;

  return mix && mix.length > 0 ? mix : undefined;
}

/**
 * Where in a profile's range one person sits.
 *
 * IMO publishes a range for each group and not a distribution over it, so the
 * shape inside the range is this project's choice: uniform, which adds no
 * structure the source does not have. It is a per-person constant, drawn from
 * the agent id, so the same person walks the same way for the whole run and
 * after a hot scene update.
 */
function within(range: PedestrianSpeedRange, unit: number) {
  return (
    range.minMetersPerSecond +
    unit * (range.maxMetersPerSecond - range.minMetersPerSecond)
  );
}

/**
 * Draw one person from the mix. Deterministic in (seed, agentId): the same run
 * produces the same crowd.
 *
 * Returns undefined when the mix names nothing this build knows, rather than
 * quietly falling back to a profile nobody asked for: the caller then keeps
 * the engine's own speed distribution.
 */
export function samplePerson(
  seed: number,
  agentId: number,
  mix: PopulationMix,
): SampledPerson | undefined {
  let remaining = hashUnit(seed, agentId, "population") * totalShare(mix);
  let chosen: string | undefined;

  for (const entry of mix) {
    remaining -= entry.share;

    if (remaining <= 0) {
      chosen = entry.profileId;
      break;
    }
  }

  const preset = getPedestrianPreset(
    (chosen ?? mix[mix.length - 1]?.profileId) as PedestrianPresetId,
  );

  if (!preset) {
    return undefined;
  }

  // One draw per speed, so a person who is quick on the flat is quick on the
  // stairs too — the ranges describe the same people.
  const unit = hashUnit(seed, agentId, "population-speed");

  return {
    profileId: preset.id,
    freeSpeedMetersPerSecond: within(preset.flatTerrainSpeed, unit),
    stairUpMetersPerSecond: within(preset.stairUpSpeed, unit),
    stairDownMetersPerSecond: within(preset.stairDownSpeed, unit),
  };
}

function totalShare(mix: PopulationMix) {
  return mix.reduce((sum, entry) => sum + entry.share, 0);
}

/**
 * The IMO passenger population as one ready-made mix, built from the shares in
 * the table itself (`passengerSharePercent`), so the editor can offer it
 * without anyone retyping ten percentages.
 *
 * It describes **a ship's passengers**: 40% mobility impaired and no children.
 * Choosing it for a shopping street is the scene author's decision, and the
 * validation report prints which population a run used so it stays visible.
 */
const imoShipPassengerMix: PopulationMix = pedestrianPresets
  .filter((preset) => preset.passengerSharePercent !== undefined)
  .map((preset) => ({
    profileId: preset.id,
    share: (preset.passengerSharePercent ?? 0) / 100,
  }));

/** Populations the editor can offer by name. */
export const populationLibrary = [
  { id: "imo-ship-passengers", mix: imoShipPassengerMix },
] as const;

export function populationLibraryEntry(id: string) {
  return populationLibrary.find((entry) => entry.id === id);
}

/** The library id a mix came from, when it is one of them. */
export function populationLibraryIdOf(mix?: PopulationMix): string | undefined {
  if (!mix) {
    return undefined;
  }

  return populationLibrary.find(
    (entry) =>
      entry.mix.length === mix.length &&
      entry.mix.every(
        (expected, index) =>
          mix[index]?.profileId === expected.profileId &&
          Math.abs((mix[index]?.share ?? 0) - expected.share) < 1e-9,
      ),
  )?.id;
}
