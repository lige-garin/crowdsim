import init, {
  add as wasmAdd,
  agent_profile_label,
  agent_state_label,
  AgentStateMachine,
  BehaviorState,
  EventQueue,
  QueueSystem,
  ShopDecisionModel,
} from "./wasm/core-behavior/crowdsim_core_behavior";
import {
  createBrandDecisionInsight,
  type BrandDecisionInsight,
} from "./brandDecisionProbe";
import { demoScene } from "./demoScene";

let behaviorWasmReady: Promise<void> | undefined;
let behaviorState: BehaviorState | undefined;

export async function initBehaviorWasm() {
  behaviorWasmReady ??= init().then(() => undefined);
  return behaviorWasmReady;
}

export async function addWithBehaviorWasm(left: number, right: number) {
  await initBehaviorWasm();
  return wasmAdd(left, right);
}

export async function triggerEvacuationWithBehaviorWasm() {
  await initBehaviorWasm();
  behaviorState ??= new BehaviorState();
  behaviorState.trigger_evacuation();

  return {
    active: behaviorState.is_evacuation(),
    label: behaviorState.mode_label(),
  };
}

export async function resetBehaviorModeWasm() {
  await initBehaviorWasm();
  behaviorState ??= new BehaviorState();
  behaviorState.reset();

  return {
    active: behaviorState.is_evacuation(),
    label: behaviorState.mode_label(),
  };
}

export type DiscreteEventProbeResult = {
  labels: string[];
  now: number;
  pending: number;
  ready: number;
};

export type AgentStateMachineProbeResult = {
  finalCode: number;
  labels: string[];
  restoredLabel: string;
  sabStateLabels: string[];
};

export type ShopDecisionProbeResult = {
  brandInsight?: BrandDecisionInsight;
  browserSummary: string;
  commuterChoice: string;
  goalChoice: string;
  profileLabels: string[];
  shopCount: number;
};

export type QueueSystemProbeResult = {
  dequeued: number[];
  layout: string;
  serviceTimes: number[];
  throughput: number;
};

export async function runDiscreteEventWasmProbe(): Promise<DiscreteEventProbeResult> {
  await initBehaviorWasm();

  const queue = new EventQueue();
  const labels: string[] = [];

  queue.schedule_after(2, "open-shop");
  queue.schedule_after(0.5, "arrive");
  queue.schedule_when("service-ready", "finish-service");
  queue.tick(1);
  drainReadyLabels(queue, labels);
  queue.sync_clock(2.25);
  drainReadyLabels(queue, labels);
  queue.trigger_condition("service-ready");
  drainReadyLabels(queue, labels);

  const result = {
    labels,
    now: queue.now(),
    pending: queue.pending_len(),
    ready: queue.ready_len(),
  };

  queue.free();
  return result;
}

export async function runAgentStateMachineWasmProbe(): Promise<AgentStateMachineProbeResult> {
  await initBehaviorWasm();

  const machine = new AgentStateMachine();
  const labels = [machine.state_label()];

  machine.advance();
  labels.push(machine.state_label());
  machine.advance();
  labels.push(machine.state_label());
  machine.trigger_evacuation();
  labels.push(machine.state_label());
  machine.clear_evacuation();
  labels.push(machine.state_label());
  machine.transition_to(3);
  labels.push(machine.state_label());
  machine.transition_to(4);
  labels.push(machine.state_label());
  machine.transition_to(5);
  labels.push(machine.state_label());

  const result = {
    finalCode: machine.state_code(),
    labels,
    restoredLabel: labels[4],
    sabStateLabels: [0, 1, 2, 3, 4, 5, 6].map((code) => agent_state_label(code)),
  };

  machine.free();
  return result;
}

export async function runShopDecisionWasmProbe(): Promise<ShopDecisionProbeResult> {
  await initBehaviorWasm();

  const model = new ShopDecisionModel();

  model.add_shop("kiosk", 5, 0, 0.45, 4, 90);
  model.add_shop("anchor", 35, 0, 1.8, 20, 600);
  model.add_shop("gallery", 12, 6, 1.15, 12, 240);

  const result = {
    brandInsight: createBrandDecisionInsight(demoScene),
    browserSummary: model.choice_summary(0, 0, 1, 0.45),
    commuterChoice: model.best_shop_label(0, 0, 2) ?? "none",
    goalChoice: model.best_shop_label(0, 0, 0) ?? "none",
    profileLabels: [0, 1, 2].map((code) => agent_profile_label(code)),
    shopCount: model.shop_count(),
  };

  model.free();
  return result;
}

export async function runQueueSystemWasmProbe(): Promise<QueueSystemProbeResult> {
  await initBehaviorWasm();

  const queue = new QueueSystem();

  queue.configure_geometry(10, 20, 0, 2, 1.5);
  queue.configure_service(30, 0.2, 120);
  queue.enqueue(201);
  queue.enqueue(202);
  queue.enqueue(203);

  const layout = queue.layout_summary(3);

  const result = {
    dequeued: [queue.dequeue_next() ?? 0, queue.dequeue_next() ?? 0],
    layout,
    serviceTimes: [
      queue.service_time_seconds(0),
      queue.service_time_seconds(0.5),
      queue.service_time_seconds(1),
    ],
    throughput: queue.agents_served_in_window(30),
  };

  queue.free();
  return result;
}

function drainReadyLabels(queue: EventQueue, labels: string[]) {
  while (queue.ready_len() > 0) {
    const label = queue.next_ready_label();

    if (label) {
      labels.push(label);
    }
  }
}
