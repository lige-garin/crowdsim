/**
 * ADR-0033 gap #4: a GPU-resident agent buffer (`GpuSimCore`) has a fixed
 * `capacity` set at construction, and its per-agent state (position,
 * velocity, everything ADR-0015 ported) lives in that buffer across ticks —
 * unlike the engine's own `SimulationAgent[]`, which is a dense array agents
 * are added to and removed from freely via `filter`. Wiring a GPU-backed
 * plane needs a small index-slot allocator sitting between the two: assign
 * each live agent a stable GPU buffer slot on first sight, free it once that
 * agent is no longer live (exited, transferred off this plane, or otherwise
 * gone), and reuse freed slots for new arrivals rather than growing without
 * bound.
 *
 * Deliberately generic over a plain numeric id rather than `SimulationAgent`
 * itself: the allocator's whole job is index bookkeeping, nothing about
 * *why* an id is or isn't live, so it takes no scene- or agent-shaped types
 * and lives here in `core-gpu` rather than in the app package, next to the
 * `GpuSimCore` it exists to feed slots into.
 *
 * `sync` is the only per-tick entry point (a live engine integration calls
 * it exactly once, with that tick's full list of agent ids on this plane) —
 * there is no standalone allocate/release in the public surface, since
 * nothing in this codebase needs to allocate or free a single id outside of
 * a full per-tick sync.
 */
export type GpuSlotAllocator = {
  /**
   * Syncs the allocator to exactly the ids in `liveIds`: any previously
   * allocated id absent from `liveIds` is released, and every id present
   * gets (or keeps) a slot. Returns each id's slot in the same order as
   * `liveIds`, plus which of them were allocated for the first time by this
   * call — the ones a caller must upload full agent state for (position,
   * velocity, speed, radius, target), since a GPU-resident slot for a
   * continuing agent already holds last tick's state and must not be
   * re-initialized.
   */
  sync(liveIds: readonly number[]): { slots: Int32Array; spawnedIds: number[] };
  /** One past the highest slot index ever handed out — never decreases,
   * even as slots are freed and reused, since capacity planning cares about
   * the peak concurrent population, not the current one. */
  highWaterMark(): number;
};

export function createGpuSlotAllocator(): GpuSlotAllocator {
  const slotById = new Map<number, number>();
  const freeSlots: number[] = [];
  let nextSlot = 0;

  function allocate(id: number): number {
    const existing = slotById.get(id);
    if (existing !== undefined) return existing;
    const slot = freeSlots.length > 0 ? freeSlots.pop()! : nextSlot++;
    slotById.set(id, slot);
    return slot;
  }

  function release(id: number): void {
    const slot = slotById.get(id);
    if (slot === undefined) return;
    slotById.delete(id);
    freeSlots.push(slot);
  }

  return {
    sync(liveIds) {
      const live = new Set(liveIds);
      for (const id of [...slotById.keys()]) {
        if (!live.has(id)) release(id);
      }
      const slots = new Int32Array(liveIds.length);
      const spawnedIds: number[] = [];
      for (let i = 0; i < liveIds.length; i++) {
        const id = liveIds[i];
        const wasLive = slotById.has(id);
        slots[i] = allocate(id);
        if (!wasLive) spawnedIds.push(id);
      }
      return { slots, spawnedIds };
    },
    highWaterMark: () => nextSlot,
  };
}
