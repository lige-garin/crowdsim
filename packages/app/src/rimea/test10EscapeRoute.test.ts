import { describe, expect, it } from "vitest";
import { escapeRouteTest, runEscapeRouteAllocationTest } from "./test10EscapeRoute";

describe("test 10: allocation of escape routes", () => {
  it("has all twelve rooms leave, each by its assigned exit", () => {
    const result = runEscapeRouteAllocationTest();

    expect(result.number).toBe(10);
    expect(result.status).toBe("pass");
    expect(result.measured).toContain("23 people left");
    expect(result.criterion).toContain("RiMEA 4.1.1");
  });

  it("gives room 3 one person and every other room two", () => {
    // Room 3 is the passage up to the main exit, not a room like the rest.
    expect(escapeRouteTest.peoplePerRoom[2]).toBe(1);
    expect(escapeRouteTest.peoplePerRoom.filter((count) => count === 2)).toHaveLength(
      11,
    );
  });
});
