/* @ts-self-types="./crowdsim_core_behavior.d.ts" */

export class AgentStateMachine {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AgentStateMachineFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_agentstatemachine_free(ptr, 0);
    }
    /**
     * @returns {boolean}
     */
    advance() {
        const ret = wasm.agentstatemachine_advance(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {number} state_code
     * @returns {boolean}
     */
    can_transition_to(state_code) {
        const ret = wasm.agentstatemachine_can_transition_to(this.__wbg_ptr, state_code);
        return ret !== 0;
    }
    clear_evacuation() {
        wasm.agentstatemachine_clear_evacuation(this.__wbg_ptr);
    }
    /**
     * @returns {boolean}
     */
    is_evacuation_override() {
        const ret = wasm.agentstatemachine_is_evacuation_override(this.__wbg_ptr);
        return ret !== 0;
    }
    constructor() {
        const ret = wasm.agentstatemachine_new();
        this.__wbg_ptr = ret;
        AgentStateMachineFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    previous_state_code() {
        const ret = wasm.agentstatemachine_previous_state_code(this.__wbg_ptr);
        return ret >>> 0;
    }
    reset() {
        wasm.agentstatemachine_reset(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    state_code() {
        const ret = wasm.agentstatemachine_state_code(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    state_label() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.agentstatemachine_state_label(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} state_code
     * @returns {boolean}
     */
    transition_to(state_code) {
        const ret = wasm.agentstatemachine_transition_to(this.__wbg_ptr, state_code);
        return ret !== 0;
    }
    trigger_evacuation() {
        wasm.agentstatemachine_trigger_evacuation(this.__wbg_ptr);
    }
}
if (Symbol.dispose) AgentStateMachine.prototype[Symbol.dispose] = AgentStateMachine.prototype.free;

export class BehaviorState {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BehaviorStateFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_behaviorstate_free(ptr, 0);
    }
    /**
     * @returns {boolean}
     */
    is_evacuation() {
        const ret = wasm.behaviorstate_is_evacuation(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {string}
     */
    mode_label() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.behaviorstate_mode_label(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    constructor() {
        const ret = wasm.behaviorstate_new();
        this.__wbg_ptr = ret;
        BehaviorStateFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    reset() {
        wasm.behaviorstate_reset(this.__wbg_ptr);
    }
    trigger_evacuation() {
        wasm.behaviorstate_trigger_evacuation(this.__wbg_ptr);
    }
}
if (Symbol.dispose) BehaviorState.prototype[Symbol.dispose] = BehaviorState.prototype.free;

export class EventQueue {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        EventQueueFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_eventqueue_free(ptr, 0);
    }
    clear() {
        wasm.eventqueue_clear(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    conditional_len() {
        const ret = wasm.eventqueue_conditional_len(this.__wbg_ptr);
        return ret >>> 0;
    }
    constructor() {
        const ret = wasm.eventqueue_new();
        this.__wbg_ptr = ret;
        EventQueueFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    next_event_time() {
        const ret = wasm.eventqueue_next_event_time(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string | undefined}
     */
    next_ready_label() {
        const ret = wasm.eventqueue_next_ready_label(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @returns {number}
     */
    now() {
        const ret = wasm.eventqueue_now(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    pending_len() {
        const ret = wasm.eventqueue_pending_len(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    ready_len() {
        const ret = wasm.eventqueue_ready_len(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} delay_seconds
     * @param {string} kind
     * @returns {number}
     */
    schedule_after(delay_seconds, kind) {
        const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.eventqueue_schedule_after(this.__wbg_ptr, delay_seconds, ptr0, len0);
        return ret >>> 0;
    }
    /**
     * @param {number} due_seconds
     * @param {string} kind
     * @returns {number}
     */
    schedule_at(due_seconds, kind) {
        const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.eventqueue_schedule_at(this.__wbg_ptr, due_seconds, ptr0, len0);
        return ret >>> 0;
    }
    /**
     * @param {string} condition_key
     * @param {string} kind
     * @returns {number}
     */
    schedule_when(condition_key, kind) {
        const ptr0 = passStringToWasm0(condition_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.eventqueue_schedule_when(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret >>> 0;
    }
    /**
     * @param {number} time_seconds
     * @returns {number}
     */
    sync_clock(time_seconds) {
        const ret = wasm.eventqueue_sync_clock(this.__wbg_ptr, time_seconds);
        return ret >>> 0;
    }
    /**
     * @param {number} delta_seconds
     * @returns {number}
     */
    tick(delta_seconds) {
        const ret = wasm.eventqueue_tick(this.__wbg_ptr, delta_seconds);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    timed_len() {
        const ret = wasm.eventqueue_timed_len(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {string} condition_key
     * @returns {number}
     */
    trigger_condition(condition_key) {
        const ptr0 = passStringToWasm0(condition_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.eventqueue_trigger_condition(this.__wbg_ptr, ptr0, len0);
        return ret >>> 0;
    }
}
if (Symbol.dispose) EventQueue.prototype[Symbol.dispose] = EventQueue.prototype.free;

export class QueueSystem {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        QueueSystemFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_queuesystem_free(ptr, 0);
    }
    /**
     * @param {number} agent_id
     * @returns {string}
     */
    agent_position_label(agent_id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.queuesystem_agent_position_label(this.__wbg_ptr, agent_id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} agent_id
     * @returns {number}
     */
    agent_slot(agent_id) {
        const ret = wasm.queuesystem_agent_slot(this.__wbg_ptr, agent_id);
        return ret;
    }
    /**
     * @param {number} seconds
     * @returns {number}
     */
    agents_served_in_window(seconds) {
        const ret = wasm.queuesystem_agents_served_in_window(this.__wbg_ptr, seconds);
        return ret >>> 0;
    }
    clear() {
        wasm.queuesystem_clear(this.__wbg_ptr);
    }
    /**
     * @param {number} origin_x
     * @param {number} origin_y
     * @param {number} direction_x
     * @param {number} direction_y
     * @param {number} spacing
     */
    configure_geometry(origin_x, origin_y, direction_x, direction_y, spacing) {
        wasm.queuesystem_configure_geometry(this.__wbg_ptr, origin_x, origin_y, direction_x, direction_y, spacing);
    }
    /**
     * @param {number} service_mean_seconds
     * @param {number} service_jitter
     * @param {number} gate_capacity_per_minute
     */
    configure_service(service_mean_seconds, service_jitter, gate_capacity_per_minute) {
        wasm.queuesystem_configure_service(this.__wbg_ptr, service_mean_seconds, service_jitter, gate_capacity_per_minute);
    }
    /**
     * @returns {number | undefined}
     */
    dequeue_next() {
        const ret = wasm.queuesystem_dequeue_next(this.__wbg_ptr);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
    /**
     * @param {number} agent_id
     * @returns {number}
     */
    enqueue(agent_id) {
        const ret = wasm.queuesystem_enqueue(this.__wbg_ptr, agent_id);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    gate_capacity_per_second() {
        const ret = wasm.queuesystem_gate_capacity_per_second(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    is_empty() {
        const ret = wasm.queuesystem_is_empty(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {number} max_agents
     * @returns {string}
     */
    layout_summary(max_agents) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.queuesystem_layout_summary(this.__wbg_ptr, max_agents);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    len() {
        const ret = wasm.queuesystem_len(this.__wbg_ptr);
        return ret >>> 0;
    }
    constructor() {
        const ret = wasm.queuesystem_new();
        this.__wbg_ptr = ret;
        QueueSystemFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number | undefined}
     */
    peek_next() {
        const ret = wasm.queuesystem_peek_next(this.__wbg_ptr);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
    /**
     * @param {number} slot
     * @returns {number}
     */
    queue_position_x(slot) {
        const ret = wasm.queuesystem_queue_position_x(this.__wbg_ptr, slot);
        return ret;
    }
    /**
     * @param {number} slot
     * @returns {number}
     */
    queue_position_y(slot) {
        const ret = wasm.queuesystem_queue_position_y(this.__wbg_ptr, slot);
        return ret;
    }
    /**
     * @param {number} random_unit
     * @returns {number}
     */
    service_time_seconds(random_unit) {
        const ret = wasm.queuesystem_service_time_seconds(this.__wbg_ptr, random_unit);
        return ret;
    }
}
if (Symbol.dispose) QueueSystem.prototype[Symbol.dispose] = QueueSystem.prototype.free;

export class ShopDecisionModel {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ShopDecisionModelFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_shopdecisionmodel_free(ptr, 0);
    }
    /**
     * @param {string} id
     * @param {number} x
     * @param {number} y
     * @param {number} attraction
     * @param {number} capacity
     * @param {number} dwell_mean_seconds
     * @returns {number}
     */
    add_shop(id, x, y, attraction, capacity, dwell_mean_seconds) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.shopdecisionmodel_add_shop(this.__wbg_ptr, ptr0, len0, x, y, attraction, capacity, dwell_mean_seconds);
        return ret >>> 0;
    }
    /**
     * @param {number} agent_x
     * @param {number} agent_y
     * @param {number} profile_code
     * @returns {string | undefined}
     */
    best_shop_label(agent_x, agent_y, profile_code) {
        const ret = wasm.shopdecisionmodel_best_shop_label(this.__wbg_ptr, agent_x, agent_y, profile_code);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {number} agent_x
     * @param {number} agent_y
     * @param {number} profile_code
     * @param {number} random_unit
     * @returns {string}
     */
    choice_summary(agent_x, agent_y, profile_code, random_unit) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.shopdecisionmodel_choice_summary(this.__wbg_ptr, agent_x, agent_y, profile_code, random_unit);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} agent_x
     * @param {number} agent_y
     * @param {number} profile_code
     * @param {number} random_unit
     * @returns {string | undefined}
     */
    choose_shop_label(agent_x, agent_y, profile_code, random_unit) {
        const ret = wasm.shopdecisionmodel_choose_shop_label(this.__wbg_ptr, agent_x, agent_y, profile_code, random_unit);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    constructor() {
        const ret = wasm.shopdecisionmodel_new();
        this.__wbg_ptr = ret;
        ShopDecisionModelFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} shop_index
     * @param {number} profile_code
     * @param {number} random_unit
     * @returns {number}
     */
    sample_dwell_seconds(shop_index, profile_code, random_unit) {
        const ret = wasm.shopdecisionmodel_sample_dwell_seconds(this.__wbg_ptr, shop_index, profile_code, random_unit);
        return ret;
    }
    /**
     * @returns {number}
     */
    shop_count() {
        const ret = wasm.shopdecisionmodel_shop_count(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) ShopDecisionModel.prototype[Symbol.dispose] = ShopDecisionModel.prototype.free;

/**
 * @param {number} left
 * @param {number} right
 * @returns {number}
 */
export function add(left, right) {
    const ret = wasm.add(left, right);
    return ret;
}

/**
 * @param {number} profile_code
 * @returns {string}
 */
export function agent_profile_label(profile_code) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.agent_profile_label(profile_code);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {number} state_code
 * @returns {string}
 */
export function agent_state_label(state_code) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.agent_state_label(state_code);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_bbadd78c1bac3a77: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./crowdsim_core_behavior_bg.js": import0,
    };
}

const AgentStateMachineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_agentstatemachine_free(ptr, 1));
const BehaviorStateFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_behaviorstate_free(ptr, 1));
const EventQueueFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_eventqueue_free(ptr, 1));
const QueueSystemFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_queuesystem_free(ptr, 1));
const ShopDecisionModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_shopdecisionmodel_free(ptr, 1));

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('crowdsim_core_behavior_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
