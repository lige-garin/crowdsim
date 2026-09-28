import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  add,
  agent_profile_label,
  agent_state_label,
  AgentStateMachine,
  BehaviorState,
  EventQueue,
  initSync,
  QueueSystem,
  ShopDecisionModel,
} from "../wasm/core-behavior/crowdsim_core_behavior";

describe("core-behavior wasm", () => {
  it("exports an add smoke function for the app", () => {
    const wasmBytes = readFileSync(
      join(process.cwd(), "src/wasm/core-behavior/crowdsim_core_behavior_bg.wasm"),
    );

    initSync({ module: wasmBytes });

    expect(add(19, 23)).toBe(42);
  });

  it("exports behavior evacuation state", () => {
    const wasmBytes = readFileSync(
      join(process.cwd(), "src/wasm/core-behavior/crowdsim_core_behavior_bg.wasm"),
    );

    initSync({ module: wasmBytes });

    const state = new BehaviorState();
    expect(state.mode_label()).toBe("Normal");

    state.trigger_evacuation();
    expect(state.is_evacuation()).toBe(true);
    expect(state.mode_label()).toBe("Evacuating");
  });

  it("exports a discrete event queue", () => {
    const wasmBytes = readFileSync(
      join(process.cwd(), "src/wasm/core-behavior/crowdsim_core_behavior_bg.wasm"),
    );

    initSync({ module: wasmBytes });

    const queue = new EventQueue();
    queue.schedule_after(2, "open-shop");
    queue.schedule_after(0.5, "arrive");
    queue.schedule_when("service-ready", "finish-service");

    expect(queue.tick(1)).toBe(1);
    expect(queue.next_ready_label()).toBe("0.50:arrive#2");
    expect(queue.sync_clock(2.25)).toBe(1);
    expect(queue.next_ready_label()).toBe("2.00:open-shop#1");
    expect(queue.trigger_condition("service-ready")).toBe(1);
    expect(queue.next_ready_label()).toBe("2.25:finish-service#3");
    expect(queue.pending_len()).toBe(0);

    queue.free();
  });

  it("exports agent state machine transitions", () => {
    const wasmBytes = readFileSync(
      join(process.cwd(), "src/wasm/core-behavior/crowdsim_core_behavior_bg.wasm"),
    );

    initSync({ module: wasmBytes });

    const machine = new AgentStateMachine();
    expect(machine.state_label()).toBe("Idle");

    expect(machine.transition_to(1)).toBe(true);
    expect(machine.transition_to(2)).toBe(true);
    machine.trigger_evacuation();
    expect(machine.state_label()).toBe("Evacuate");
    expect(machine.is_evacuation_override()).toBe(true);
    machine.clear_evacuation();
    expect(machine.state_label()).toBe("Browse");
    expect(machine.transition_to(3)).toBe(true);
    expect(machine.transition_to(4)).toBe(true);
    expect(machine.transition_to(5)).toBe(true);
    expect(machine.state_code()).toBe(5);
    expect(agent_state_label(6)).toBe("Evacuate");

    machine.free();
  });

  it("exports shop decision model", () => {
    const wasmBytes = readFileSync(
      join(process.cwd(), "src/wasm/core-behavior/crowdsim_core_behavior_bg.wasm"),
    );

    initSync({ module: wasmBytes });

    const model = new ShopDecisionModel();
    model.add_shop("kiosk", 5, 0, 0.45, 4, 90);
    model.add_shop("anchor", 35, 0, 1.8, 20, 600);

    expect(model.shop_count()).toBe(2);
    expect(model.best_shop_label(0, 0, 0)).toBe("anchor");
    expect(model.best_shop_label(0, 0, 2)).toBe("kiosk");
    expect(model.sample_dwell_seconds(1, 1, 0.5)).toBe(810);
    expect(agent_profile_label(2)).toBe("Commuter");
    expect(model.choice_summary(0, 0, 1, 0.45)).toContain("Browser ->");

    model.free();
  });

  it("exports queue system geometry, FIFO and throughput", () => {
    const wasmBytes = readFileSync(
      join(process.cwd(), "src/wasm/core-behavior/crowdsim_core_behavior_bg.wasm"),
    );

    initSync({ module: wasmBytes });

    const queue = new QueueSystem();
    queue.configure_geometry(10, 20, 0, 2, 1.5);
    queue.configure_service(30, 0.2, 120);
    queue.enqueue(201);
    queue.enqueue(202);

    expect(queue.layout_summary(2)).toBe("#201@10.00,20.00 | #202@10.00,21.50");
    expect(queue.dequeue_next()).toBe(201);
    expect(queue.dequeue_next()).toBe(202);
    expect(queue.service_time_seconds(0.5)).toBe(30);
    expect(queue.agents_served_in_window(30)).toBe(60);

    queue.free();
  });
});
