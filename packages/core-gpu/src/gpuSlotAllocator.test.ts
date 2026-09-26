import { describe, expect, it } from "vitest";
import { createGpuSlotAllocator } from "./gpuSlotAllocator";

describe("gpuSlotAllocator (ADR-0033 gap #4: index recycling for a GPU-resident agent buffer)", () => {
  it("gives each new id the next never-used slot, in the same order as liveIds", () => {
    const allocator = createGpuSlotAllocator();
    const { slots, spawnedIds } = allocator.sync([10, 11]);
    expect([...slots]).toEqual([0, 1]);
    expect(spawnedIds).toEqual([10, 11]);
  });

  it("keeps a live id's slot stable across syncs, and reports it as not newly spawned", () => {
    const allocator = createGpuSlotAllocator();
    allocator.sync([10, 11]);
    const second = allocator.sync([10, 11]);
    expect([...second.slots]).toEqual([0, 1]);
    expect(second.spawnedIds).toEqual([]);
  });

  it("reuses a freed slot for the next new id rather than growing the high-water mark", () => {
    const allocator = createGpuSlotAllocator();
    allocator.sync([10, 11]); // slots 0, 1
    allocator.sync([11]); // 10 leaves, freeing slot 0
    const { slots, spawnedIds } = allocator.sync([11, 12]); // 12 arrives
    expect(spawnedIds).toEqual([12]);
    expect([...slots]).toEqual([1, 0]); // 11 keeps slot 1; 12 reuses freed slot 0
    expect(allocator.highWaterMark()).toBe(2);
  });

  it("high-water mark tracks the peak concurrent population, not the current one", () => {
    const allocator = createGpuSlotAllocator();
    allocator.sync([1, 2, 3]);
    // Everyone has left, but the mark stays at the peak (3 ever used), since
    // a caller sizing GPU buffer capacity cares about the worst case, not
    // whatever happens to be live this instant.
    allocator.sync([]);
    expect(allocator.highWaterMark()).toBe(3);
  });

  it("sync() releases ids absent from the live set and reports which ids are newly spawned", () => {
    const allocator = createGpuSlotAllocator();
    const first = allocator.sync([1, 2, 3]);
    expect([...first.slots]).toEqual([0, 1, 2]);
    expect(first.spawnedIds).toEqual([1, 2, 3]);

    // Agent 2 leaves (exited/transferred off this plane), agent 4 arrives.
    const second = allocator.sync([1, 3, 4]);
    expect(second.spawnedIds).toEqual([4]);
    // 1 and 3 keep their prior slots; 4 reuses 2's freed slot (1), not a
    // fresh index (3) — the whole point of the allocator existing.
    expect([...second.slots]).toEqual([0, 2, 1]);
    expect(allocator.highWaterMark()).toBe(3);
  });
});
