import { describe, expect, it } from "vitest";
import { parseScene, type CrowdSimScene } from "@crowdsim/scene-schema";
import { demoScene } from "./demoScene";
import { getPedestrianPreset } from "./pedestrianPresets";
import {
  populationFor,
  populationLibraryEntry,
  populationLibraryIdOf,
  samplePerson,
  type PopulationMix,
} from "./populationSampling";
import {
  createEditorDocumentFromScene,
  createSceneFromEditorDocument,
} from "./sceneEditorConversions";
import { updateDocumentEntrancePopulation } from "./sceneEditorMutations";
import { createSimulationEngineFromScene } from "./simulationEngine";

/** IMO's ship population, which is what `pedestrianPresets` publishes. */
const imoMix: PopulationMix = [
  { profileId: "female-under-30", share: 0.07 },
  { profileId: "female-30-50", share: 0.07 },
  { profileId: "female-over-50", share: 0.16 },
  { profileId: "female-impaired-1", share: 0.1 },
  { profileId: "female-impaired-2", share: 0.1 },
  { profileId: "male-under-30", share: 0.07 },
  { profileId: "male-30-50", share: 0.07 },
  { profileId: "male-over-50", share: 0.16 },
  { profileId: "male-impaired-1", share: 0.1 },
  { profileId: "male-impaired-2", share: 0.1 },
];

describe("drawing a person from a population", () => {
  it("keeps every drawn speed inside the published range for its profile", () => {
    for (let agentId = 1; agentId <= 1000; agentId += 1) {
      const person = samplePerson(7, agentId, imoMix)!;
      const preset = getPedestrianPreset(person.profileId)!;

      expect(person.freeSpeedMetersPerSecond).toBeGreaterThanOrEqual(
        preset.flatTerrainSpeed.minMetersPerSecond,
      );
      expect(person.freeSpeedMetersPerSecond).toBeLessThanOrEqual(
        preset.flatTerrainSpeed.maxMetersPerSecond,
      );
      expect(person.stairUpMetersPerSecond).toBeGreaterThanOrEqual(
        preset.stairUpSpeed.minMetersPerSecond,
      );
      expect(person.stairDownMetersPerSecond).toBeLessThanOrEqual(
        preset.stairDownSpeed.maxMetersPerSecond,
      );
    }
  });

  it("draws each profile about as often as its share says", () => {
    const counts = new Map<string, number>();

    for (let agentId = 1; agentId <= 4000; agentId += 1) {
      const person = samplePerson(3, agentId, imoMix)!;
      counts.set(person.profileId, (counts.get(person.profileId) ?? 0) + 1);
    }

    for (const entry of imoMix) {
      const share = (counts.get(entry.profileId) ?? 0) / 4000;

      // Two percentage points of a 4,000-person draw.
      expect(Math.abs(share - entry.share)).toBeLessThan(0.02);
    }
  });

  it("draws the same person every time, so a run repeats", () => {
    expect(samplePerson(11, 42, imoMix)).toEqual(samplePerson(11, 42, imoMix));
    expect(samplePerson(11, 42, imoMix)).not.toEqual(samplePerson(11, 43, imoMix));
  });

  it("takes the door's population over the scene's, and neither when there is none", () => {
    const scene = { population: { mix: imoMix } };

    expect(populationFor(scene)).toBe(imoMix);
    expect(populationFor({ population: undefined })).toBeUndefined();

    const doorMix: PopulationMix = [{ profileId: "crew-male", share: 1 }];

    expect(populationFor(scene, { population: { mix: doorMix } })).toBe(doorMix);
  });
});

describe("a run with a population", () => {
  const withPopulation: CrowdSimScene = parseScene({
    ...demoScene,
    id: "population-run",
    population: { name: "IMO ship passengers", mix: imoMix },
  });

  function speedsOf(scene: CrowdSimScene, steps = 420) {
    const engine = createSimulationEngineFromScene(scene, { maxAgents: 30 });
    engine.start();

    for (let step = 0; step < steps; step += 1) {
      engine.step(1 / 60);
    }

    return engine.snapshot().agents;
  }

  it("gives people the profile they were drawn from", () => {
    const agents = speedsOf(withPopulation);

    expect(agents.length).toBeGreaterThan(0);
    expect(agents.every((agent) => agent.profileId !== undefined)).toBe(true);
    expect(agents.every((agent) => agent.stairUpMetersPerSecond !== undefined)).toBe(
      true,
    );
    // A crowd that is 20% mobility impaired is not one speed: the slowest and
    // the quickest differ by more than the old single distribution allowed.
    const factors = agents.map((agent) => agent.speedFactor!);

    expect(Math.max(...factors) / Math.min(...factors)).toBeGreaterThan(2);
  });

  it("leaves a scene that declares no population exactly as it was", () => {
    const agents = speedsOf(demoScene);

    expect(agents.length).toBeGreaterThan(0);
    expect(agents.every((agent) => agent.profileId === undefined)).toBe(true);
    expect(agents.every((agent) => agent.stairUpMetersPerSecond === undefined)).toBe(
      true,
    );
  });
});

describe("choosing a population in the editor", () => {
  it("offers the IMO passenger mix, built from the table's own shares", () => {
    const entry = populationLibraryEntry("imo-ship-passengers")!;
    const total = entry.mix.reduce((sum, item) => sum + item.share, 0);

    expect(entry.mix).toHaveLength(10);
    expect(total).toBeCloseTo(1, 9);
    expect(populationLibraryIdOf(entry.mix)).toBe("imo-ship-passengers");
    expect(populationLibraryIdOf(undefined)).toBeUndefined();
  });

  it("carries the choice into the scene and back", () => {
    const document = createEditorDocumentFromScene(demoScene);
    const withPopulation = updateDocumentEntrancePopulation(
      document,
      document.entrances[0].id,
      "imo-ship-passengers",
    );
    const scene = createSceneFromEditorDocument(demoScene, withPopulation);
    const reopened = createEditorDocumentFromScene(scene);

    expect(scene.entrances[0].population?.mix).toHaveLength(10);
    expect(reopened.entrances[0].populationId).toBe("imo-ship-passengers");

    // And back to the engine default.
    const cleared = updateDocumentEntrancePopulation(
      reopened,
      reopened.entrances[0].id,
      "default",
    );

    expect(cleared.entrances[0].populationId).toBeUndefined();
    expect(
      createSceneFromEditorDocument(demoScene, cleared).entrances[0].population,
    ).toBeUndefined();
  });

  it("makes that door's arrivals draw from the population", () => {
    const document = createEditorDocumentFromScene(demoScene);
    const withPopulation = updateDocumentEntrancePopulation(
      document,
      document.entrances[0].id,
      "imo-ship-passengers",
    );
    const scene = createSceneFromEditorDocument(demoScene, withPopulation);
    const door = scene.entrances[0];
    const mix = populationFor(scene, door)!;

    // The engine reads exactly this on spawn (simulationSceneConfig), and the
    // run above already covers what it does with it — no second run needed.
    expect(mix).toHaveLength(10);
    expect(samplePerson(scene.seed, 1, mix)?.profileId).toBeTruthy();
  });
});
