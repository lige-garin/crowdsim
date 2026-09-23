/* tslint:disable */
/* eslint-disable */

export class AgentStateMachine {
    free(): void;
    [Symbol.dispose](): void;
    advance(): boolean;
    can_transition_to(state_code: number): boolean;
    clear_evacuation(): void;
    is_evacuation_override(): boolean;
    constructor();
    previous_state_code(): number;
    reset(): void;
    state_code(): number;
    state_label(): string;
    transition_to(state_code: number): boolean;
    trigger_evacuation(): void;
}

export class BehaviorState {
    free(): void;
    [Symbol.dispose](): void;
    is_evacuation(): boolean;
    mode_label(): string;
    constructor();
    reset(): void;
    trigger_evacuation(): void;
}

export class EventQueue {
    free(): void;
    [Symbol.dispose](): void;
    clear(): void;
    conditional_len(): number;
    constructor();
    next_event_time(): number;
    next_ready_label(): string | undefined;
    now(): number;
    pending_len(): number;
    ready_len(): number;
    schedule_after(delay_seconds: number, kind: string): number;
    schedule_at(due_seconds: number, kind: string): number;
    schedule_when(condition_key: string, kind: string): number;
    sync_clock(time_seconds: number): number;
    tick(delta_seconds: number): number;
    timed_len(): number;
    trigger_condition(condition_key: string): number;
}

export class QueueSystem {
    free(): void;
    [Symbol.dispose](): void;
    agent_position_label(agent_id: number): string;
    agent_slot(agent_id: number): number;
    agents_served_in_window(seconds: number): number;
    clear(): void;
    configure_geometry(origin_x: number, origin_y: number, direction_x: number, direction_y: number, spacing: number): void;
    configure_service(service_mean_seconds: number, service_jitter: number, gate_capacity_per_minute: number): void;
    dequeue_next(): number | undefined;
    enqueue(agent_id: number): number;
    gate_capacity_per_second(): number;
    is_empty(): boolean;
    layout_summary(max_agents: number): string;
    len(): number;
    constructor();
    peek_next(): number | undefined;
    queue_position_x(slot: number): number;
    queue_position_y(slot: number): number;
    service_time_seconds(random_unit: number): number;
}

export class ShopDecisionModel {
    free(): void;
    [Symbol.dispose](): void;
    add_shop(id: string, x: number, y: number, attraction: number, capacity: number, dwell_mean_seconds: number): number;
    best_shop_label(agent_x: number, agent_y: number, profile_code: number): string | undefined;
    choice_summary(agent_x: number, agent_y: number, profile_code: number, random_unit: number): string;
    choose_shop_label(agent_x: number, agent_y: number, profile_code: number, random_unit: number): string | undefined;
    constructor();
    sample_dwell_seconds(shop_index: number, profile_code: number, random_unit: number): number;
    shop_count(): number;
}

export function add(left: number, right: number): number;

export function agent_profile_label(profile_code: number): string;

export function agent_state_label(state_code: number): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_behaviorstate_free: (a: number, b: number) => void;
    readonly behaviorstate_is_evacuation: (a: number) => number;
    readonly behaviorstate_mode_label: (a: number) => [number, number];
    readonly behaviorstate_new: () => number;
    readonly behaviorstate_reset: (a: number) => void;
    readonly behaviorstate_trigger_evacuation: (a: number) => void;
    readonly __wbg_agentstatemachine_free: (a: number, b: number) => void;
    readonly agent_state_label: (a: number) => [number, number];
    readonly agentstatemachine_advance: (a: number) => number;
    readonly agentstatemachine_can_transition_to: (a: number, b: number) => number;
    readonly agentstatemachine_clear_evacuation: (a: number) => void;
    readonly agentstatemachine_is_evacuation_override: (a: number) => number;
    readonly agentstatemachine_new: () => number;
    readonly agentstatemachine_previous_state_code: (a: number) => number;
    readonly agentstatemachine_reset: (a: number) => void;
    readonly agentstatemachine_state_code: (a: number) => number;
    readonly agentstatemachine_state_label: (a: number) => [number, number];
    readonly agentstatemachine_transition_to: (a: number, b: number) => number;
    readonly agentstatemachine_trigger_evacuation: (a: number) => void;
    readonly __wbg_shopdecisionmodel_free: (a: number, b: number) => void;
    readonly agent_profile_label: (a: number) => [number, number];
    readonly shopdecisionmodel_add_shop: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly shopdecisionmodel_best_shop_label: (a: number, b: number, c: number, d: number) => [number, number];
    readonly shopdecisionmodel_choice_summary: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly shopdecisionmodel_choose_shop_label: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly shopdecisionmodel_new: () => number;
    readonly shopdecisionmodel_sample_dwell_seconds: (a: number, b: number, c: number, d: number) => number;
    readonly shopdecisionmodel_shop_count: (a: number) => number;
    readonly __wbg_eventqueue_free: (a: number, b: number) => void;
    readonly eventqueue_clear: (a: number) => void;
    readonly eventqueue_conditional_len: (a: number) => number;
    readonly eventqueue_new: () => number;
    readonly eventqueue_next_event_time: (a: number) => number;
    readonly eventqueue_next_ready_label: (a: number) => [number, number];
    readonly eventqueue_now: (a: number) => number;
    readonly eventqueue_pending_len: (a: number) => number;
    readonly eventqueue_ready_len: (a: number) => number;
    readonly eventqueue_schedule_after: (a: number, b: number, c: number, d: number) => number;
    readonly eventqueue_schedule_at: (a: number, b: number, c: number, d: number) => number;
    readonly eventqueue_schedule_when: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly eventqueue_sync_clock: (a: number, b: number) => number;
    readonly eventqueue_tick: (a: number, b: number) => number;
    readonly eventqueue_timed_len: (a: number) => number;
    readonly eventqueue_trigger_condition: (a: number, b: number, c: number) => number;
    readonly __wbg_queuesystem_free: (a: number, b: number) => void;
    readonly queuesystem_agent_position_label: (a: number, b: number) => [number, number];
    readonly queuesystem_agent_slot: (a: number, b: number) => number;
    readonly queuesystem_agents_served_in_window: (a: number, b: number) => number;
    readonly queuesystem_clear: (a: number) => void;
    readonly queuesystem_configure_geometry: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly queuesystem_configure_service: (a: number, b: number, c: number, d: number) => void;
    readonly queuesystem_dequeue_next: (a: number) => number;
    readonly queuesystem_enqueue: (a: number, b: number) => number;
    readonly queuesystem_gate_capacity_per_second: (a: number) => number;
    readonly queuesystem_is_empty: (a: number) => number;
    readonly queuesystem_layout_summary: (a: number, b: number) => [number, number];
    readonly queuesystem_len: (a: number) => number;
    readonly queuesystem_new: () => number;
    readonly queuesystem_peek_next: (a: number) => number;
    readonly queuesystem_queue_position_x: (a: number, b: number) => number;
    readonly queuesystem_queue_position_y: (a: number, b: number) => number;
    readonly queuesystem_service_time_seconds: (a: number, b: number) => number;
    readonly add: (a: number, b: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
