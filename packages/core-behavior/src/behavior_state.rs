use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct BehaviorState {
    evacuation: bool,
}

#[wasm_bindgen]
impl BehaviorState {
    #[wasm_bindgen(constructor)]
    pub fn new() -> BehaviorState {
        BehaviorState { evacuation: false }
    }

    pub fn trigger_evacuation(&mut self) {
        self.evacuation = true;
    }

    pub fn reset(&mut self) {
        self.evacuation = false;
    }

    pub fn is_evacuation(&self) -> bool {
        self.evacuation
    }

    pub fn mode_label(&self) -> String {
        if self.evacuation {
            "Evacuating".to_string()
        } else {
            "Normal".to_string()
        }
    }
}
