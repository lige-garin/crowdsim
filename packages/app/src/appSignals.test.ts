import { describe, expect, it } from "vitest";
import { parseScene } from "@crowdsim/scene-schema";
import { floorSignals } from "./appSignals";
import { demoScene } from "./scenes/demoScene";
import { messages } from "./i18nMessages";

const t = (key: keyof typeof messages) => messages[key].en;

describe("the floors signal", () => {
  it("says nothing when the scene is one plane", () => {
    expect(floorSignals(demoScene, t)).toEqual([]);
  });

  it("says how many floors there are, all of which ran", () => {
    const stacked = parseScene({
      ...demoScene,
      floors: [
        { id: "ground", level: 0 },
        { id: "upper", level: 1 },
      ],
    });

    expect(floorSignals(stacked, t)).toEqual([
      { label: "Floors", value: "2 floors, all simulated" },
    ]);
  });
});
