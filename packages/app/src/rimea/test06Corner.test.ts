import { describe, expect, it } from "vitest";
import { insideCorner, runCornerTest } from "./test06Corner";

describe("test 6: round a corner", () => {
  it("passes only if everyone gets round and nobody leaves the corridor", () => {
    const result = runCornerTest();

    expect(result.number).toBe(6);
    expect(result.status).toBe("pass");
    expect(result.measured).toContain("nobody left the corridor");
  }, 60_000);

  it("knows the corridor it is checking against", () => {
    // Inside both arms and the turn.
    expect(insideCorner(5, 1)).toBe(true);
    expect(insideCorner(11, 11)).toBe(true);
    expect(insideCorner(11, 1)).toBe(true);
    // Outside: past the inner wall, and beyond the end of an arm.
    expect(insideCorner(5, 5)).toBe(false);
    expect(insideCorner(13, 1)).toBe(false);
    expect(insideCorner(11, 13)).toBe(false);
  });
});
