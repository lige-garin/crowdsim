/**
 * What a person is doing, as a colour.
 *
 * Every agent used to be the same glowing orange cube, so a crowd of shoppers,
 * queuers and people leaving looked identical — the viewport showed *that*
 * people were there and nothing about *what* they were doing, which is the
 * whole output of a behaviour simulation. Colour by lifecycle state makes the
 * behaviour visible at a glance, the way a city builder colours citizens.
 *
 * The worker path streams state as an integer code (see `agentStateCode`
 * below); the main-thread path carries the string. Both map
 * to the same palette.
 */
export const agentStateColor = {
  unknown: "#e2e8f0",
  walk: "#3aa7e0",
  browse: "#f2b62f",
  queue: "#f07a2a",
  enterStore: "#9b7ae8",
  leave: "#8c99a8",
  evacuate: "#e5484d",
} as const;

export type AgentStateKey = keyof typeof agentStateColor;

const byCode: readonly AgentStateKey[] = [
  "unknown",
  "walk",
  "browse",
  "queue",
  "enterStore",
  "leave",
  "evacuate",
];

/** The integer a state travels as through shared memory and recordings. */
export function agentStateCode(state: string | undefined): number {
  return Math.max(0, byCode.indexOf(state as AgentStateKey));
}

export function agentStateKey(agent: {
  behaviorState?: number;
  lifecycleState?: string;
}): AgentStateKey {
  if (
    typeof agent.lifecycleState === "string" &&
    agent.lifecycleState in agentStateColor
  ) {
    return agent.lifecycleState as AgentStateKey;
  }
  if (typeof agent.behaviorState === "number") {
    return byCode[agent.behaviorState] ?? "unknown";
  }
  return "unknown";
}
