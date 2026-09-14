import { useSyncExternalStore } from "react";
import type { SimulationSnapshot } from "./simulationEngine";
import type { ViewportAgentOverlayFrame } from "./simulationViewportOverlay";

/**
 * The live crowd, handed down the component tree as one object that never
 * changes identity.
 *
 * Each snapshot used to travel as props — App → workbench → stage → viewport →
 * overlay, and into the editor canvas. In development React 19 records every
 * changed prop into the browser's performance timeline, expanding objects three
 * levels deep, so a crowd of two thousand people became tens of thousands of
 * entries per render at every level. It slowed the dev build badly and now and
 * then failed outright ("Data cannot be cloned, out of memory"). Components that
 * draw the crowd now subscribe to it here instead; the store itself is the only
 * prop, and it is always the same object.
 */
export type LiveCrowdFrame = {
  snapshot?: SimulationSnapshot;
  /** The worker path's shared-memory frame, when it has one. */
  sharedAgentOverlay?: ViewportAgentOverlayFrame;
};

export type LiveCrowd = {
  get: () => LiveCrowdFrame;
  set: (frame: LiveCrowdFrame) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createLiveCrowd(initial: LiveCrowdFrame): LiveCrowd {
  let frame = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => frame,
    set(next) {
      if (
        next.snapshot === frame.snapshot &&
        next.sharedAgentOverlay === frame.sharedAgentOverlay
      ) {
        return;
      }
      frame = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** A crowd that never changes: for views rendered without a simulation. */
export const noLiveCrowd = createLiveCrowd({});

/** The current crowd; re-renders the caller when a new frame arrives. */
export function useLiveCrowd(crowd: LiveCrowd): LiveCrowdFrame {
  return useSyncExternalStore(crowd.subscribe, crowd.get, crowd.get);
}
