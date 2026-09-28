import { describe, expect, it } from "vitest";
import { agentStateColor, agentStateKey } from "./agentStateColors";

describe("agent state colours", () => {
  it("decodes the worker's integer lifecycle codes", () => {
    // Must stay in step with agentStateCode.
    expect(agentStateKey({ behaviorState: 1 })).toBe("walk");
    expect(agentStateKey({ behaviorState: 2 })).toBe("browse");
    expect(agentStateKey({ behaviorState: 3 })).toBe("queue");
    expect(agentStateKey({ behaviorState: 4 })).toBe("enterStore");
    expect(agentStateKey({ behaviorState: 5 })).toBe("leave");
    expect(agentStateKey({ behaviorState: 6 })).toBe("evacuate");
    expect(agentStateKey({ behaviorState: 0 })).toBe("unknown");
  });

  it("reads the main-thread string state", () => {
    expect(agentStateKey({ lifecycleState: "queue" })).toBe("queue");
  });

  it("falls back rather than throwing on anything unexpected", () => {
    expect(agentStateKey({ behaviorState: 99 })).toBe("unknown");
    expect(agentStateKey({ lifecycleState: "teleporting" })).toBe("unknown");
    expect(agentStateKey({})).toBe("unknown");
  });

  it("gives every state its own colour", () => {
    const colours = Object.values(agentStateColor);
    expect(new Set(colours).size).toBe(colours.length);
  });
});
