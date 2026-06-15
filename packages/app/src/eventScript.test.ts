import { describe, expect, it } from "vitest";
import { parseNaturalLanguageEventScript } from "./eventScript";

describe("natural language event script parser", () => {
  it("parses entrance closures from Chinese incident text", () => {
    expect(parseNaturalLanguageEventScript("18:05 西门突发关闭")).toEqual([
      {
        atSeconds: 65_100,
        entranceId: "west-source",
        kind: "close-entrance",
        sourceText: "18:05 西门突发关闭",
      },
    ]);
  });

  it("parses arrival surge and evacuation events", () => {
    expect(
      parseNaturalLanguageEventScript(
        "08:30 east arrival surge 3x; 08:45 fire evacuation",
      ),
    ).toEqual([
      {
        atSeconds: 30_600,
        factor: 3,
        kind: "arrival-surge",
        sourceId: "east-sink",
        sourceText: "08:30 east arrival surge 3x",
      },
      {
        atSeconds: 31_500,
        kind: "evacuation",
        reason: "fire",
        sourceText: "08:45 fire evacuation",
      },
    ]);
  });
});
