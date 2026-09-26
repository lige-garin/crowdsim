/**
 * ADR-0033 gap #4: a GPU-resident agent buffer (`GpuSimCore`) has a fixed
 * `capacity` set at construction, and its per-agent state (position,
 * velocity, everything ADR-0015 ported) lives in that buffer across ticks —
 * unlike the engine's own `SimulationAgent[]`, which is a dense array agents
 * are added to and removed from freely via `filter`. Wiring a GPU-backed
 * plane needs a small index-slot allocator sitting between the two.
 *
 * This has to do real **compaction**, not just free-list bookkeeping: the
 * WGSL kernel processes every index in `[0, count)` unconditionally (there
 * is no per-agent "active" flag it checks). A naive allocator that just
 * marks a departed agent's slot "free" and leaves it alone until reused
 * would, for any tick where that slot isn't immediately refilled by a new
 * arrival, leave the departed agent's stale position sitting inside
 * `[0, count)` — a ghost the kernel still runs full physics for, still
 * pushing real neighbours away from a position nobody is actually standing
 * at. The only way to keep `[0, count)` exactly equal to "every currently
 * live agent, no gaps" without a kernel change is to swap the topmost live
 * slot into a hole whenever one opens up, shrinking `count` by one each
 * time — the standard packed-array swap-remove technique.
 *
 * That swap means an agent that never left can still have its **slot**
 * change underneath it (its identity/state doesn't move, but the physical
 * GPU buffer index that state lives at does) — `relocatedIds` reports
 * exactly which live ids that happened to this call, so a caller can copy
 * that agent's own last-known position/velocity (from the same readback a
 * live engine already does every tick) into its new slot, rather than
 * silently continuing to read/write the wrong index.
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
   * live id absent from `liveIds` is removed (its slot reclaimed via
   * swap-compaction, see this module's own doc comment), and every id
   * present gets (or keeps) a slot. After this call, the live ids occupy
   * exactly the slots `[0, liveIds.length)` — no gaps.
   *
   * Returns each id's slot in the same order as `liveIds`; `spawnedIds`,
   * the ids seen for the first time this call (a caller must upload their
   * full initial state — position, velocity, speed, radius, target — since
   * nothing has ever lived at their slot with meaningful data before); and
   * `relocatedIds`, live ids (present both before and after this call)
   * whose slot changed because compaction swapped a different, departing
   * id's hole closed using this one — a caller must copy this id's own
   * current position/velocity into its new slot, or a stale readback from
   * its old one will silently apply to the wrong agent.
   */
  sync(liveIds: readonly number[]): {
    slots: Int32Array;
    spawnedIds: number[];
    relocatedIds: number[];
  };
  /** One past the highest slot index ever handed out — never decreases,
   * even as slots are freed and reused, since capacity planning cares about
   * the peak concurrent population, not the current one. */
  highWaterMark(): number;
};

export function createGpuSlotAllocator(): GpuSlotAllocator {
  const slotById = new Map<number, number>();
  // Inverse of slotById, and always kept exactly as long as the live
  // population: idBySlot[s] is whoever currently occupies slot s, for every
  // s in [0, idBySlot.length) — the packing invariant this whole module
  // exists to preserve.
  const idBySlot: number[] = [];
  let peak = 0;

  return {
    sync(liveIds) {
      const liveSet = new Set(liveIds);
      const spawnedIds: number[] = [];
      const relocated = new Set<number>();

      // Release every departed id, swap-compacting as we go: popping the
      // topmost slot's id and, unless the departing id WAS the topmost slot
      // (nothing to move), dropping that popped id into the hole just
      // opened. Snapshotting the keys up front is required — the loop body
      // mutates slotById/idBySlot for ids other than the one being visited.
      for (const id of [...slotById.keys()]) {
        if (liveSet.has(id)) continue;
        const freedSlot = slotById.get(id)!;
        slotById.delete(id);
        const lastSlot = idBySlot.length - 1;
        const movedId = idBySlot.pop();
        if (freedSlot !== lastSlot && movedId !== undefined && movedId !== id) {
          idBySlot[freedSlot] = movedId;
          slotById.set(movedId, freedSlot);
          // Only report a relocation for an id that is still live this
          // tick: `movedId` can itself be mid-departure in this same sync
          // call (visited later in this same snapshot loop), in which case
          // it needs no re-upload — it is about to be removed too.
          if (liveSet.has(movedId)) relocated.add(movedId);
        }
      }

      // Assign new ids, appended at the end of the now-packed range.
      for (const id of liveIds) {
        if (slotById.has(id)) continue;
        const slot = idBySlot.length;
        idBySlot.push(id);
        slotById.set(id, slot);
        spawnedIds.push(id);
      }
      peak = Math.max(peak, idBySlot.length);

      const slots = new Int32Array(liveIds.length);
      for (let i = 0; i < liveIds.length; i++) {
        slots[i] = slotById.get(liveIds[i])!;
      }
      return { slots, spawnedIds, relocatedIds: [...relocated] };
    },
    highWaterMark: () => peak,
  };
}
