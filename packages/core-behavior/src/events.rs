use std::cmp::Ordering;
use std::collections::{BinaryHeap, VecDeque};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct EventQueue {
    clock_seconds: f64,
    next_sequence: u32,
    timed_events: BinaryHeap<ScheduledEvent>,
    conditional_events: Vec<ConditionalEvent>,
    ready_events: VecDeque<ReadyEvent>,
}

#[derive(Clone, Debug)]
struct ScheduledEvent {
    due_seconds: f64,
    sequence: u32,
    kind: String,
}

#[derive(Clone, Debug)]
struct ConditionalEvent {
    condition_key: String,
    sequence: u32,
    kind: String,
}

#[derive(Clone, Debug)]
struct ReadyEvent {
    fired_seconds: f64,
    sequence: u32,
    kind: String,
}

impl Eq for ScheduledEvent {}

impl PartialEq for ScheduledEvent {
    fn eq(&self, other: &Self) -> bool {
        self.due_seconds == other.due_seconds && self.sequence == other.sequence
    }
}

impl Ord for ScheduledEvent {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .due_seconds
            .total_cmp(&self.due_seconds)
            .then_with(|| other.sequence.cmp(&self.sequence))
    }
}

impl PartialOrd for ScheduledEvent {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl ReadyEvent {
    fn label(&self) -> String {
        format!("{:.2}:{}#{}", self.fired_seconds, self.kind, self.sequence)
    }
}

#[wasm_bindgen]
impl EventQueue {
    #[wasm_bindgen(constructor)]
    pub fn new() -> EventQueue {
        EventQueue {
            clock_seconds: 0.0,
            next_sequence: 1,
            timed_events: BinaryHeap::new(),
            conditional_events: Vec::new(),
            ready_events: VecDeque::new(),
        }
    }

    pub fn now(&self) -> f64 {
        self.clock_seconds
    }

    pub fn pending_len(&self) -> usize {
        self.timed_events.len() + self.conditional_events.len()
    }

    pub fn ready_len(&self) -> usize {
        self.ready_events.len()
    }

    pub fn timed_len(&self) -> usize {
        self.timed_events.len()
    }

    pub fn conditional_len(&self) -> usize {
        self.conditional_events.len()
    }

    pub fn next_event_time(&self) -> f64 {
        self.timed_events
            .peek()
            .map(|event| event.due_seconds)
            .unwrap_or(f64::NAN)
    }

    pub fn schedule_at(&mut self, due_seconds: f64, kind: String) -> u32 {
        let sequence = self.allocate_sequence();
        let due_seconds = if due_seconds.is_finite() {
            due_seconds.max(self.clock_seconds)
        } else {
            self.clock_seconds
        };

        self.timed_events.push(ScheduledEvent {
            due_seconds,
            sequence,
            kind,
        });

        sequence
    }

    pub fn schedule_after(&mut self, delay_seconds: f64, kind: String) -> u32 {
        let delay_seconds = if delay_seconds.is_finite() {
            delay_seconds.max(0.0)
        } else {
            0.0
        };

        self.schedule_at(self.clock_seconds + delay_seconds, kind)
    }

    pub fn schedule_when(&mut self, condition_key: String, kind: String) -> u32 {
        let sequence = self.allocate_sequence();

        self.conditional_events.push(ConditionalEvent {
            condition_key,
            sequence,
            kind,
        });

        sequence
    }

    pub fn tick(&mut self, delta_seconds: f64) -> usize {
        let delta_seconds = if delta_seconds.is_finite() {
            delta_seconds.max(0.0)
        } else {
            0.0
        };

        self.sync_clock(self.clock_seconds + delta_seconds)
    }

    pub fn sync_clock(&mut self, time_seconds: f64) -> usize {
        if time_seconds.is_finite() {
            self.clock_seconds = self.clock_seconds.max(time_seconds);
        }

        self.drain_due_events()
    }

    pub fn trigger_condition(&mut self, condition_key: String) -> usize {
        let mut matched = 0;
        let mut remaining = Vec::with_capacity(self.conditional_events.len());

        for event in self.conditional_events.drain(..) {
            if event.condition_key == condition_key {
                matched += 1;
                self.ready_events.push_back(ReadyEvent {
                    fired_seconds: self.clock_seconds,
                    sequence: event.sequence,
                    kind: event.kind,
                });
            } else {
                remaining.push(event);
            }
        }

        self.conditional_events = remaining;
        matched
    }

    pub fn next_ready_label(&mut self) -> Option<String> {
        self.ready_events.pop_front().map(|event| event.label())
    }

    pub fn clear(&mut self) {
        self.clock_seconds = 0.0;
        self.next_sequence = 1;
        self.timed_events.clear();
        self.conditional_events.clear();
        self.ready_events.clear();
    }

    fn allocate_sequence(&mut self) -> u32 {
        let sequence = self.next_sequence;
        self.next_sequence = self.next_sequence.saturating_add(1);
        sequence
    }

    fn drain_due_events(&mut self) -> usize {
        let mut drained = 0;

        while self
            .timed_events
            .peek()
            .is_some_and(|event| event.due_seconds <= self.clock_seconds)
        {
            let event = self
                .timed_events
                .pop()
                .expect("peek confirmed a timed event exists");

            self.ready_events.push_back(ReadyEvent {
                fired_seconds: event.due_seconds,
                sequence: event.sequence,
                kind: event.kind,
            });
            drained += 1;
        }

        drained
    }
}
