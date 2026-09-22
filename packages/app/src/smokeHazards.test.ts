import { describe, expect, it } from "vitest";
import {
  doseSecondsAtFullExposure,
  exposureSpeedFactor,
  fedDoseThisTick,
  fedIncapacitationDose,
  hazardAvoidanceAccelerationMetersPerSecondSquared,
  hazardAvoidancePush,
  localExposure,
  mostExposingHazard,
  smokeRadiusAt,
  type SimulationHazard,
} from "./smokeHazards";

function fire(overrides: Partial<SimulationHazard> = {}): SimulationHazard {
  return {
    id: "fire-1",
    floorId: undefined,
    position: { x: 0, y: 0 },
    radiusMeters: 10,
    growthSeconds: 100,
    startsAtSeconds: 0,
    severity: 0.8,
    speedMultiplier: 0.3,
    visibilityMultiplier: 0.4,
    riskScore: 0.6,
    ...overrides,
  };
}

describe("smokeRadiusAt", () => {
  it("is zero before it starts", () => {
    expect(smokeRadiusAt(fire({ startsAtSeconds: 60 }), 30)).toBe(0);
  });

  it("grows linearly from 0 to radiusMeters over growthSeconds", () => {
    const hazard = fire({ growthSeconds: 100, radiusMeters: 10 });
    expect(smokeRadiusAt(hazard, 0)).toBe(0);
    expect(smokeRadiusAt(hazard, 50)).toBeCloseTo(5, 6);
    expect(smokeRadiusAt(hazard, 100)).toBeCloseTo(10, 6);
  });

  it("holds at radiusMeters after growthSeconds, does not keep growing", () => {
    expect(smokeRadiusAt(fire({ growthSeconds: 100, radiusMeters: 10 }), 500)).toBe(10);
  });

  it("is zero from endsAtSeconds on", () => {
    expect(smokeRadiusAt(fire({ endsAtSeconds: 200 }), 199)).toBeGreaterThan(0);
    expect(smokeRadiusAt(fire({ endsAtSeconds: 200 }), 200)).toBe(0);
  });
});

describe("localExposure", () => {
  it("is the hazard's own severity at its centre", () => {
    const hazard = fire({ severity: 0.8, growthSeconds: 1, radiusMeters: 10 });
    expect(localExposure(hazard, { x: 0, y: 0 }, 10)).toBeCloseTo(0.8, 6);
  });

  it("falls off linearly to zero at the current radius", () => {
    const hazard = fire({ severity: 0.8, growthSeconds: 1, radiusMeters: 10 });
    expect(localExposure(hazard, { x: 5, y: 0 }, 10)).toBeCloseTo(0.4, 6);
    expect(localExposure(hazard, { x: 10, y: 0 }, 10)).toBeCloseTo(0, 6);
  });

  it("is zero outside the current radius", () => {
    const hazard = fire({ severity: 0.8, growthSeconds: 1, radiusMeters: 10 });
    expect(localExposure(hazard, { x: 20, y: 0 }, 10)).toBe(0);
  });

  it("is zero before the hazard has grown any radius at all", () => {
    expect(localExposure(fire({ startsAtSeconds: 60 }), { x: 0, y: 0 }, 30)).toBe(0);
  });
});

describe("mostExposingHazard", () => {
  const near = fire({
    id: "near",
    position: { x: 0, y: 0 },
    severity: 0.5,
    growthSeconds: 1,
  });
  const far = fire({
    id: "far",
    position: { x: 5, y: 0 },
    severity: 0.9,
    growthSeconds: 1,
  });

  it("picks whichever hazard exposes the point worst, not whichever is nearest", () => {
    // At (5,0): "near" gives 0.5*(1-5/10)=0.25, "far" gives 0.9 (its own centre).
    const worst = mostExposingHazard([near, far], undefined, { x: 5, y: 0 }, 10);
    expect(worst?.hazard.id).toBe("far");
    expect(worst?.exposure).toBeCloseTo(0.9, 6);
  });

  it("ignores hazards on a different floor", () => {
    const upstairs = fire({
      id: "upstairs",
      floorId: "upper",
      position: { x: 0, y: 0 },
    });
    const worst = mostExposingHazard([upstairs], "ground", { x: 0, y: 0 }, 10);
    expect(worst).toBeUndefined();
  });

  it("is undefined when nothing exposes the point", () => {
    expect(
      mostExposingHazard([near], undefined, { x: 100, y: 100 }, 10),
    ).toBeUndefined();
  });
});

describe("exposureSpeedFactor", () => {
  it("is 1 (no slowdown) at zero exposure", () => {
    expect(exposureSpeedFactor(0, 0.3)).toBe(1);
  });

  it("is the hazard's own speedMultiplier at full exposure", () => {
    expect(exposureSpeedFactor(1, 0.3)).toBeCloseTo(0.3, 6);
  });

  it("is linear in between", () => {
    expect(exposureSpeedFactor(0.5, 0.2)).toBeCloseTo(0.6, 6);
  });
});

describe("fedDoseThisTick", () => {
  it("is zero with no exposure or no risk", () => {
    expect(fedDoseThisTick(0, 0.6, 1)).toBe(0);
    expect(fedDoseThisTick(0.8, 0, 1)).toBe(0);
  });

  it("reaches exactly fedIncapacitationDose after doseSecondsAtFullExposure at full exposure and risk", () => {
    let dose = 0;
    const dt = 1;
    for (let t = 0; t < doseSecondsAtFullExposure; t += dt) {
      dose += fedDoseThisTick(1, 1, dt);
    }
    expect(dose).toBeCloseTo(fedIncapacitationDose, 6);
  });

  it("takes proportionally longer at half the exposure", () => {
    let dose = 0;
    const dt = 1;
    for (let t = 0; t < doseSecondsAtFullExposure; t += dt) {
      dose += fedDoseThisTick(0.5, 1, dt);
    }
    expect(dose).toBeCloseTo(fedIncapacitationDose / 2, 6);
  });
});

describe("hazardAvoidancePush", () => {
  it("points straight away from the hazard's own centre", () => {
    const hazard = fire();
    const [ax, ay] = hazardAvoidancePush(hazard, { x: 5, y: 0 }, 1);
    expect(ax).toBeGreaterThan(0);
    expect(ay).toBeCloseTo(0, 6);
  });

  it("is zero right at the hazard's own centre — no direction to call away", () => {
    const hazard = fire();
    expect(hazardAvoidancePush(hazard, { x: 0, y: 0 }, 1)).toEqual([0, 0]);
  });

  it("scales with exposure and with how well it can be seen", () => {
    const hazard = fire({ visibilityMultiplier: 0.5 });
    const [ax] = hazardAvoidancePush(hazard, { x: 5, y: 0 }, 1);
    expect(ax).toBeCloseTo(
      hazardAvoidanceAccelerationMetersPerSecondSquared * 1 * 0.5,
      6,
    );
  });
});
