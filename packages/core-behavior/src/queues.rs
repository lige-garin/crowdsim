use crate::utils::{clamp01, finite_or};
use std::collections::VecDeque;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct QueueSystem {
    waiting: VecDeque<u32>,
    origin_x: f64,
    origin_y: f64,
    direction_x: f64,
    direction_y: f64,
    spacing: f64,
    service_mean_seconds: f64,
    service_jitter: f64,
    gate_capacity_per_minute: f64,
}

#[wasm_bindgen]
impl QueueSystem {
    #[wasm_bindgen(constructor)]
    pub fn new() -> QueueSystem {
        QueueSystem {
            waiting: VecDeque::new(),
            origin_x: 0.0,
            origin_y: 0.0,
            direction_x: 0.0,
            direction_y: 1.0,
            spacing: 1.2,
            service_mean_seconds: 30.0,
            service_jitter: 0.2,
            gate_capacity_per_minute: 60.0,
        }
    }

    pub fn configure_geometry(
        &mut self,
        origin_x: f64,
        origin_y: f64,
        direction_x: f64,
        direction_y: f64,
        spacing: f64,
    ) {
        let length = (direction_x.powi(2) + direction_y.powi(2)).sqrt();

        self.origin_x = finite_or(origin_x, 0.0);
        self.origin_y = finite_or(origin_y, 0.0);
        self.spacing = finite_or(spacing, 1.2).max(0.2);

        if length > 0.0001 && length.is_finite() {
            self.direction_x = direction_x / length;
            self.direction_y = direction_y / length;
        } else {
            self.direction_x = 0.0;
            self.direction_y = 1.0;
        }
    }

    pub fn configure_service(
        &mut self,
        service_mean_seconds: f64,
        service_jitter: f64,
        gate_capacity_per_minute: f64,
    ) {
        self.service_mean_seconds = finite_or(service_mean_seconds, 30.0).max(1.0);
        self.service_jitter = finite_or(service_jitter, 0.2).clamp(0.0, 0.9);
        self.gate_capacity_per_minute = finite_or(gate_capacity_per_minute, 60.0).max(0.0);
    }

    pub fn enqueue(&mut self, agent_id: u32) -> usize {
        self.waiting.push_back(agent_id);
        self.waiting.len() - 1
    }

    pub fn dequeue_next(&mut self) -> Option<u32> {
        self.waiting.pop_front()
    }

    pub fn peek_next(&self) -> Option<u32> {
        self.waiting.front().copied()
    }

    pub fn len(&self) -> usize {
        self.waiting.len()
    }

    pub fn is_empty(&self) -> bool {
        self.waiting.is_empty()
    }

    pub fn clear(&mut self) {
        self.waiting.clear();
    }

    pub fn agent_slot(&self, agent_id: u32) -> i32 {
        self.waiting
            .iter()
            .position(|queued_id| *queued_id == agent_id)
            .map(|index| index as i32)
            .unwrap_or(-1)
    }

    pub fn queue_position_x(&self, slot: usize) -> f64 {
        self.origin_x + self.direction_x * self.spacing * slot as f64
    }

    pub fn queue_position_y(&self, slot: usize) -> f64 {
        self.origin_y + self.direction_y * self.spacing * slot as f64
    }

    pub fn agent_position_label(&self, agent_id: u32) -> String {
        let slot = self.agent_slot(agent_id);

        if slot < 0 {
            return format!("#{agent_id} not-queued");
        }

        let slot = slot as usize;
        format!(
            "#{agent_id}@{:.2},{:.2}",
            self.queue_position_x(slot),
            self.queue_position_y(slot)
        )
    }

    pub fn service_time_seconds(&self, random_unit: f64) -> f64 {
        let low = 1.0 - self.service_jitter;
        let high = 1.0 + self.service_jitter;
        let multiplier = low + (high - low) * clamp01(random_unit);

        (self.service_mean_seconds * multiplier).max(1.0)
    }

    pub fn gate_capacity_per_second(&self) -> f64 {
        self.gate_capacity_per_minute / 60.0
    }

    pub fn agents_served_in_window(&self, seconds: f64) -> u32 {
        (finite_or(seconds, 0.0).max(0.0) * self.gate_capacity_per_second()).floor() as u32
    }

    pub fn layout_summary(&self, max_agents: usize) -> String {
        self.waiting
            .iter()
            .take(max_agents)
            .map(|agent_id| self.agent_position_label(*agent_id))
            .collect::<Vec<_>>()
            .join(" | ")
    }
}
