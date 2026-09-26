import { describe, expect, it } from "vitest";
import { createGpuSlotAllocator } from "./gpuSlotAllocator";

describe("gpuSlotAllocator (ADR-0033 gap #4: index recycling for a GPU-resident agent buffer)", () => {
  it("gives each new id the next never-used slot, in the same order as liveIds", () => {
    const allocator = createGpuSlotAllocator();
    const { slots, spawnedIds, relocatedIds } = allocator.sync([10, 11]);
    expect([...slots]).toEqual([0, 1]);
    expect(spawnedIds).toEqual([10, 11]);
    expect(relocatedIds).toEqual([]);
  });

  it("keeps a live id's slot stable across syncs when nobody else departs", () => {
    const allocator = createGpuSlotAllocator();
    allocator.sync([10, 11]);
    const second = allocator.sync([10, 11]);
    expect([...second.slots]).toEqual([0, 1]);
    expect(second.spawnedIds).toEqual([]);
    expect(second.relocatedIds).toEqual([]);
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

  it("departing the topmost slot needs no swap: the remaining ids keep their slots", () => {
    const allocator = createGpuSlotAllocator();
    allocator.sync([1, 2, 3]); // slots 0, 1, 2
    const { slots, spawnedIds, relocatedIds } = allocator.sync([1, 2]); // 3 (slot 2, the topmost) departs
    expect([...slots]).toEqual([0, 1]);
    expect(spawnedIds).toEqual([]);
    expect(relocatedIds).toEqual([]);
  });

  it("departing a non-topmost slot swaps the topmost live id into the hole (compaction)", () => {
    const allocator = createGpuSlotAllocator();
    allocator.sync([1, 2, 3]); // slots 0, 1, 2
    // 2 (slot 1, NOT the topmost) departs -- 3 must move from slot 2 into
    // slot 1 to keep the live set packed into [0, 2).
    const { slots, spawnedIds, relocatedIds } = allocator.sync([1, 3]);
    expect(spawnedIds).toEqual([]);
    expect(relocatedIds).toEqual([3]);
    const slotOf = (id: number) => slots[[1, 3].indexOf(id)];
    expect(slotOf(1)).toBe(0); // untouched
    expect(slotOf(3)).toBe(1); // relocated from slot 2
  });

  it("a new arrival correctly reuses a hole opened by compaction, not a fresh index", () => {
    const allocator = createGpuSlotAllocator();
    allocator.sync([1, 2, 3]); // slots 0, 1, 2
    allocator.sync([1, 3]); // 2 departs; 3 relocates to slot 1
    // 4 arrives: the live set (1, 3) already fills [0, 2), so 4 must land
    // at slot 2, not some higher, wasteful index.
    const { slots, spawnedIds } = allocator.sync([1, 3, 4]);
    expect(spawnedIds).toEqual([4]);
    const slotOf = (id: number) => slots[[1, 3, 4].indexOf(id)];
    expect(slotOf(4)).toBe(2);
    expect(allocator.highWaterMark()).toBe(3); // never grew past the original peak
  });

  it("two simultaneous departures in one sync() cascade correctly (traced by hand: a mid-swap relocatee can depart again in the same call)", () => {
    const allocator = createGpuSlotAllocator();
    // A, B, C, D, E at slots 0..4.
    allocator.sync([10, 11, 12, 13, 14]);
    // B (slot 1) and E (slot 4, the topmost) both depart in the same call.
    // B's departure alone would swap E (the then-topmost) into slot 1; E
    // must NOT be reported as relocated (it is departing too, in this same
    // call) -- and D, the new topmost after E's removal, must end up
    // exactly where E was provisionally placed (slot 1), not left at its
    // original slot 3.
    const { slots, spawnedIds, relocatedIds } = allocator.sync([10, 12, 13]);
    expect(spawnedIds).toEqual([]);
    expect(relocatedIds).toEqual([13]); // D relocated; E must not appear (it left)
    const slotOf = (id: number) => slots[[10, 12, 13].indexOf(id)];
    expect(slotOf(10)).toBe(0); // A untouched
    expect(slotOf(12)).toBe(2); // C untouched
    expect(slotOf(13)).toBe(1); // D relocated into the hole B left
    expect(allocator.highWaterMark()).toBe(5);
  });

  it("decisive: after any sequence of departures/arrivals, live ids always occupy exactly [0, count) with no gaps", () => {
    const allocator = createGpuSlotAllocator();
    let live = [1, 2, 3, 4, 5];
    allocator.sync(live);
    live = live.filter((id) => id !== 2 && id !== 4); // depart two, non-topmost
    live = [...live, 6, 7]; // and two arrive
    const { slots } = allocator.sync(live);
    const used = [...slots].sort((a, b) => a - b);
    expect(used).toEqual(Array.from({ length: live.length }, (_, i) => i));
  });
});
