use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct AgentStateMachine {
    state: AgentState,
    previous_state: AgentState,
    evacuation_override: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AgentState {
    Idle,
    Navigate,
    Browse,
    Queue,
    Service,
    Leave,
    Evacuate,
}

impl AgentState {
    fn code(self) -> u32 {
        match self {
            AgentState::Idle => 0,
            AgentState::Navigate => 1,
            AgentState::Browse => 2,
            AgentState::Queue => 3,
            AgentState::Service => 4,
            AgentState::Leave => 5,
            AgentState::Evacuate => 6,
        }
    }

    fn label(self) -> &'static str {
        match self {
            AgentState::Idle => "Idle",
            AgentState::Navigate => "Navigate",
            AgentState::Browse => "Browse",
            AgentState::Queue => "Queue",
            AgentState::Service => "Service",
            AgentState::Leave => "Leave",
            AgentState::Evacuate => "Evacuate",
        }
    }

    fn from_code(code: u32) -> Option<AgentState> {
        match code {
            0 => Some(AgentState::Idle),
            1 => Some(AgentState::Navigate),
            2 => Some(AgentState::Browse),
            3 => Some(AgentState::Queue),
            4 => Some(AgentState::Service),
            5 => Some(AgentState::Leave),
            6 => Some(AgentState::Evacuate),
            _ => None,
        }
    }

    fn next(self) -> Option<AgentState> {
        match self {
            AgentState::Idle => Some(AgentState::Navigate),
            AgentState::Navigate => Some(AgentState::Browse),
            AgentState::Browse => Some(AgentState::Queue),
            AgentState::Queue => Some(AgentState::Service),
            AgentState::Service => Some(AgentState::Leave),
            AgentState::Leave | AgentState::Evacuate => None,
        }
    }

    fn can_transition_to(self, next: AgentState) -> bool {
        matches!(
            (self, next),
            (AgentState::Idle, AgentState::Navigate)
                | (AgentState::Navigate, AgentState::Browse)
                | (AgentState::Navigate, AgentState::Leave)
                | (AgentState::Browse, AgentState::Queue)
                | (AgentState::Browse, AgentState::Leave)
                | (AgentState::Queue, AgentState::Service)
                | (AgentState::Service, AgentState::Leave)
                | (AgentState::Leave, AgentState::Idle)
        )
    }
}

#[wasm_bindgen]
impl AgentStateMachine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> AgentStateMachine {
        AgentStateMachine {
            state: AgentState::Idle,
            previous_state: AgentState::Idle,
            evacuation_override: false,
        }
    }

    pub fn state_code(&self) -> u32 {
        self.state.code()
    }

    pub fn state_label(&self) -> String {
        self.state.label().to_string()
    }

    pub fn previous_state_code(&self) -> u32 {
        self.previous_state.code()
    }

    pub fn is_evacuation_override(&self) -> bool {
        self.evacuation_override
    }

    pub fn can_transition_to(&self, state_code: u32) -> bool {
        let Some(next_state) = AgentState::from_code(state_code) else {
            return false;
        };

        !self.evacuation_override && self.state.can_transition_to(next_state)
    }

    pub fn transition_to(&mut self, state_code: u32) -> bool {
        let Some(next_state) = AgentState::from_code(state_code) else {
            return false;
        };

        if self.can_transition_to(state_code) {
            self.state = next_state;
            true
        } else {
            false
        }
    }

    pub fn advance(&mut self) -> bool {
        if self.evacuation_override {
            return false;
        }

        let Some(next_state) = self.state.next() else {
            return false;
        };

        self.state = next_state;
        true
    }

    pub fn trigger_evacuation(&mut self) {
        if !self.evacuation_override {
            self.previous_state = self.state;
        }

        self.evacuation_override = true;
        self.state = AgentState::Evacuate;
    }

    pub fn clear_evacuation(&mut self) {
        self.evacuation_override = false;
        self.state = self.previous_state;
    }

    pub fn reset(&mut self) {
        self.state = AgentState::Idle;
        self.previous_state = AgentState::Idle;
        self.evacuation_override = false;
    }
}

#[wasm_bindgen]
pub fn agent_state_label(state_code: u32) -> String {
    AgentState::from_code(state_code)
        .map(|state| state.label().to_string())
        .unwrap_or_else(|| "Unknown".to_string())
}
