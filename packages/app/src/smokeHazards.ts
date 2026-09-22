import type { ScenePoint } from "@crowdsim/scene-schema";

/**
 * Fire and smoke (ADR-0012): a disturbance a crowd can be slowed and
 * eventually incapacitated by, not just a shape drawn on the map.
 *
 * **This is not CFD.** There is no gas transport, no buoyancy, no doorway
 * venting — a hazard is a point that grows a circular affected radius over
 * time (`smokeRadiusAt`), and everything inside that radius is treated the
 * same modulo distance falloff. Real smoke banks under a ceiling, pours
 * through doorways, and is shaped by ventilation in ways a circle cannot
 * represent; this model answers "roughly how much of the building is
 * affected, and by when", not "what does the smoke layer look like".
 *
 * Two things ride on a hazard's own scene-authored fields, already present
 * on `hazardSchema` but unread by the engine before this: `speedMultiplier`
 * (how much a person's free speed is scaled at the hazard's own centre,
 * scaled toward 1 with distance) and `riskScore` (how fast a fractional
 * dose accumulates toward incapacitation). Both are the scene author's own
 * numbers — this module supplies the falloff and accumulation shape around
 * them, not the numbers themselves.
 */

export type SimulationHazard = {
  id: string;
  /** The floor it is on; absent in a scene with one floor. */
  floorId?: string;
  position: ScenePoint;
  radiusMeters: number;
  growthSeconds: number;
  startsAtSeconds: number;
  endsAtSeconds?: number;
  severity: number;
  speedMultiplier: number;
  /**
   * How much of normal visibility remains at the hazard's own centre, 0..1
   * — the scene author's own number, used here to scale how effectively
   * someone can steer around the hazard (`crowdMovement`'s avoidance push):
   * full visibility steers cleanly, poor visibility means slowing down is
   * what exposure mostly does, not clean navigation around it.
   */
  visibilityMultiplier: number;
  riskScore: number;
};

/**
 * The affected radius at `elapsedSeconds`: 0 before it starts (or after it
 * ends), growing linearly from 0 to `radiusMeters` over `growthSeconds`,
 * holding there for the rest of its life. Linear growth is a self-chosen
 * shape, not a fitted fire curve — real fires grow roughly quadratically
 * early on (the standard "t-squared" fire, NFPA 92 among others), but this
 * project has no fire test data to fit that curve's own growth constant to,
 * and a straight line is the plainer thing to not have fitted.
 */
export function smokeRadiusAt(
  hazard: Pick<
    SimulationHazard,
    "radiusMeters" | "growthSeconds" | "startsAtSeconds" | "endsAtSeconds"
  >,
  elapsedSeconds: number,
): number {
  if (elapsedSeconds < hazard.startsAtSeconds) {
    return 0;
  }
  if (hazard.endsAtSeconds !== undefined && elapsedSeconds >= hazard.endsAtSeconds) {
    return 0;
  }
  const grown = (elapsedSeconds - hazard.startsAtSeconds) / hazard.growthSeconds;
  return hazard.radiusMeters * Math.min(1, Math.max(0, grown));
}

/**
 * How exposed `point` is to this one hazard right now: 0 outside its
 * current radius, rising linearly to the hazard's own `severity` at its
 * centre. Linear falloff is self-chosen — real smoke has a sharper edge
 * than that near a doorway or a ceiling layer's own boundary — but this
 * model has no venting geometry to make a sharper edge mean anything.
 */
export function localExposure(
  hazard: SimulationHazard,
  point: ScenePoint,
  elapsedSeconds: number,
): number {
  const radius = smokeRadiusAt(hazard, elapsedSeconds);
  if (radius <= 0) {
    return 0;
  }
  const dx = point.x - hazard.position.x;
  const dy = point.y - hazard.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance >= radius) {
    return 0;
  }
  return hazard.severity * (1 - distance / radius);
}

/**
 * Whichever fire/smoke hazard exposes this point worst right now, and by how
 * much — the max across hazards, not the sum, since two overlapping fires do
 * not make someone twice as unable to see or breathe. Returns both the
 * hazard and its exposure together (rather than two separate lookups) so a
 * caller who needs the hazard's own `speedMultiplier`/`riskScore` to react
 * to it (`simulationEngine`'s exposure/dose pass, `crowdMovement`'s
 * avoidance push) is not scanning the hazard list twice for one decision.
 */
export function mostExposingHazard(
  hazards: readonly SimulationHazard[],
  floorId: string | undefined,
  point: ScenePoint,
  elapsedSeconds: number,
): { hazard: SimulationHazard; exposure: number } | undefined {
  let worst: { hazard: SimulationHazard; exposure: number } | undefined;
  for (const hazard of hazards) {
    if ((hazard.floorId ?? undefined) !== floorId) {
      continue;
    }
    const exposure = localExposure(hazard, point, elapsedSeconds);
    if (exposure > 0 && (worst === undefined || exposure > worst.exposure)) {
      worst = { hazard, exposure };
    }
  }
  return worst;
}

/**
 * Free-speed multiplier from `exposure` (0 = clear, 1 = a hazard's own
 * centre): 1 at no exposure, easing down to the hazard's own
 * `speedMultiplier` at full exposure — the scene author's own number, not
 * one this module invents, applied through a self-chosen (linear) curve
 * between "not exposed" and "at the centre".
 */
export function exposureSpeedFactor(exposure: number, speedMultiplier: number): number {
  const clamped = Math.min(1, Math.max(0, exposure));
  return 1 - clamped * (1 - speedMultiplier);
}

/**
 * Fractional dose accumulated this tick, self-authored in the *shape* of
 * fractional-effective-dose reasoning used for fire toxicity (dose
 * accumulates with time and severity; 1.0 is incapacitation) — not a
 * reproduction of any specific published CO/HCN FED formula or its fitted
 * coefficients (e.g. Purser's), which this project has not independently
 * verified and so does not claim to implement. `riskScore` (the scene
 * author's own number, already on `hazardSchema`) sets how many seconds of
 * full exposure (`exposure` = the hazard's own `severity`, i.e. standing at
 * its centre) it takes to reach a dose of 1: `doseSecondsAtFullExposure`
 * below is the self-chosen anchor for "full severity, full risk score" —
 * everything else scales off it.
 */
export const doseSecondsAtFullExposure = 180;

export function fedDoseThisTick(
  exposure: number,
  riskScore: number,
  dtSeconds: number,
): number {
  if (exposure <= 0 || riskScore <= 0) {
    return 0;
  }
  const rate = (exposure * riskScore) / doseSecondsAtFullExposure;
  return rate * dtSeconds;
}

/** A dose at or past this is incapacitation. */
export const fedIncapacitationDose = 1;

/**
 * Peak steering push straight away from a hazard's own centre, m/s² —
 * "avoid the smoke" as a local repulsion in the movement step
 * (`crowdMovement`), not a router cost: the router's grid is built once from
 * the scene and is not rebuilt every tick a hazard's radius grows, so
 * re-costing it per tick was not attempted here. Self-chosen, the same rough
 * order as the wall push (`socialForceParameters.wallStrength`) this
 * shares a model with — someone should react to a fire about as firmly as
 * they react to a wall, not weaker.
 */
export const hazardAvoidanceAccelerationMetersPerSecondSquared = 3;

/**
 * The steering push this one hazard exerts on someone standing at `point`,
 * away from its own centre — scaled by how exposed they are and by how well
 * they can actually see it (`hazard.visibilityMultiplier`: poor visibility
 * means slowing down is what exposure mostly does, not clean navigation
 * around it, per this module's own doc comment). Zero at the centre itself,
 * where there is no direction to call "away".
 */
export function hazardAvoidancePush(
  hazard: SimulationHazard,
  point: ScenePoint,
  exposure: number,
): readonly [number, number] {
  const dx = point.x - hazard.position.x;
  const dy = point.y - hazard.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance < 1e-6) {
    return [0, 0];
  }
  const magnitude =
    hazardAvoidanceAccelerationMetersPerSecondSquared *
    exposure *
    Math.min(1, Math.max(0, hazard.visibilityMultiplier));
  return [(dx / distance) * magnitude, (dy / distance) * magnitude];
}
