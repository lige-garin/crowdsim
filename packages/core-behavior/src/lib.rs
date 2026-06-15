mod agent_state;
mod behavior_state;
mod events;
mod queues;
mod shops;
mod utils;

pub use agent_state::{agent_state_label, AgentStateMachine};
pub use behavior_state::BehaviorState;
pub use events::EventQueue;
pub use queues::QueueSystem;
pub use shops::{agent_profile_label, ShopDecisionModel};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn add(left: i32, right: i32) -> i32 {
    left + right
}

#[cfg(test)]
mod tests {
    use super::{
        add, agent_profile_label, agent_state_label, AgentStateMachine, BehaviorState, EventQueue,
        QueueSystem, ShopDecisionModel,
    };

    #[test]
    fn adds_two_numbers() {
        assert_eq!(add(19, 23), 42);
    }

    #[test]
    fn toggles_evacuation_mode() {
        let mut state = BehaviorState::new();

        assert!(!state.is_evacuation());
        assert_eq!(state.mode_label(), "Normal");

        state.trigger_evacuation();
        assert!(state.is_evacuation());
        assert_eq!(state.mode_label(), "Evacuating");

        state.reset();
        assert!(!state.is_evacuation());
    }

    #[test]
    fn drains_timed_events_in_chronological_order() {
        let mut queue = EventQueue::new();

        assert_eq!(queue.schedule_after(3.0, "third".to_string()), 1);
        assert_eq!(queue.schedule_after(1.0, "first".to_string()), 2);
        assert_eq!(queue.schedule_at(1.0, "also-first".to_string()), 3);

        assert_eq!(queue.next_event_time(), 1.0);
        assert_eq!(queue.tick(0.5), 0);
        assert_eq!(queue.ready_len(), 0);
        assert_eq!(queue.tick(0.5), 2);
        assert_eq!(queue.next_ready_label(), Some("1.00:first#2".to_string()));
        assert_eq!(
            queue.next_ready_label(),
            Some("1.00:also-first#3".to_string())
        );
        assert_eq!(queue.tick(2.0), 1);
        assert_eq!(queue.next_ready_label(), Some("3.00:third#1".to_string()));
        assert_eq!(queue.pending_len(), 0);
    }

    #[test]
    fn releases_conditional_events_when_condition_is_triggered() {
        let mut queue = EventQueue::new();

        assert_eq!(
            queue.schedule_when("door-open".to_string(), "enter-shop".to_string()),
            1
        );
        assert_eq!(queue.schedule_after(2.0, "timed".to_string()), 2);
        assert_eq!(queue.sync_clock(5.0), 1);

        assert_eq!(queue.conditional_len(), 1);
        assert_eq!(queue.next_ready_label(), Some("2.00:timed#2".to_string()));
        assert_eq!(queue.trigger_condition("other".to_string()), 0);
        assert_eq!(queue.trigger_condition("door-open".to_string()), 1);
        assert_eq!(
            queue.next_ready_label(),
            Some("5.00:enter-shop#1".to_string())
        );
        assert_eq!(queue.conditional_len(), 0);
    }

    #[test]
    fn advances_agent_state_machine_through_behavior_flow() {
        let mut machine = AgentStateMachine::new();

        assert_eq!(machine.state_label(), "Idle");
        assert!(machine.advance());
        assert_eq!(machine.state_label(), "Navigate");
        assert!(machine.advance());
        assert_eq!(machine.state_label(), "Browse");
        assert!(machine.advance());
        assert_eq!(machine.state_label(), "Queue");
        assert!(machine.advance());
        assert_eq!(machine.state_label(), "Service");
        assert!(machine.advance());
        assert_eq!(machine.state_label(), "Leave");
        assert!(!machine.advance());
    }

    #[test]
    fn enforces_valid_agent_state_transitions() {
        let mut machine = AgentStateMachine::new();

        assert!(!machine.transition_to(4));
        assert!(machine.transition_to(1));
        assert!(machine.transition_to(5));
        assert_eq!(machine.state_label(), "Leave");
        assert!(machine.transition_to(0));
        assert_eq!(machine.state_label(), "Idle");
        assert_eq!(agent_state_label(3), "Queue");
        assert_eq!(agent_state_label(99), "Unknown");
    }

    #[test]
    fn evacuation_override_pauses_and_restores_behavior_state() {
        let mut machine = AgentStateMachine::new();

        assert!(machine.transition_to(1));
        assert!(machine.transition_to(2));
        machine.trigger_evacuation();

        assert!(machine.is_evacuation_override());
        assert_eq!(machine.state_label(), "Evacuate");
        assert_eq!(machine.previous_state_code(), 2);
        assert!(!machine.advance());
        assert!(!machine.transition_to(3));

        machine.clear_evacuation();
        assert!(!machine.is_evacuation_override());
        assert_eq!(machine.state_label(), "Browse");
        assert!(machine.transition_to(3));
    }

    #[test]
    fn shop_decision_model_scores_by_profile() {
        let mut model = ShopDecisionModel::new();

        assert_eq!(
            model.add_shop("kiosk".to_string(), 5.0, 0.0, 0.45, 4, 90.0),
            0
        );
        assert_eq!(
            model.add_shop("anchor".to_string(), 35.0, 0.0, 1.8, 20, 600.0),
            1
        );

        assert_eq!(model.shop_count(), 2);
        assert_eq!(
            model.best_shop_label(0.0, 0.0, 0),
            Some("anchor".to_string())
        );
        assert_eq!(
            model.best_shop_label(0.0, 0.0, 2),
            Some("kiosk".to_string())
        );
        assert_eq!(agent_profile_label(1), "Browser");
    }

    #[test]
    fn shop_decision_model_samples_dwell_and_summary() {
        let mut model = ShopDecisionModel::new();

        model.add_shop("gallery".to_string(), 10.0, 0.0, 1.2, 12, 240.0);

        assert_eq!(model.sample_dwell_seconds(0, 1, 0.5), 324.0);
        assert_eq!(
            model.choice_summary(0.0, 0.0, 1, 0.2),
            "Browser -> gallery p=1.00 dwell=275s capacity=12"
        );
    }

    #[test]
    fn queue_system_preserves_fifo_order() {
        let mut queue = QueueSystem::new();

        assert_eq!(queue.enqueue(101), 0);
        assert_eq!(queue.enqueue(102), 1);
        assert_eq!(queue.enqueue(103), 2);
        assert_eq!(queue.peek_next(), Some(101));
        assert_eq!(queue.dequeue_next(), Some(101));
        assert_eq!(queue.dequeue_next(), Some(102));
        assert_eq!(queue.len(), 1);
        assert_eq!(queue.dequeue_next(), Some(103));
        assert!(queue.is_empty());
    }

    #[test]
    fn queue_system_lays_out_positions_and_samples_service() {
        let mut queue = QueueSystem::new();

        queue.configure_geometry(10.0, 20.0, 0.0, 2.0, 1.5);
        queue.configure_service(30.0, 0.2, 120.0);
        queue.enqueue(201);
        queue.enqueue(202);

        assert_eq!(queue.agent_position_label(201), "#201@10.00,20.00");
        assert_eq!(queue.agent_position_label(202), "#202@10.00,21.50");
        assert_eq!(
            queue.layout_summary(2),
            "#201@10.00,20.00 | #202@10.00,21.50"
        );
        assert_eq!(queue.service_time_seconds(0.0), 24.0);
        assert_eq!(queue.service_time_seconds(0.5), 30.0);
        assert_eq!(queue.service_time_seconds(1.0), 36.0);
        assert_eq!(queue.agents_served_in_window(30.0), 60);
    }
}
