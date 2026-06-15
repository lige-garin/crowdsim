use crate::utils::{clamp01, finite_or};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct ShopDecisionModel {
    shops: Vec<Shop>,
}

#[derive(Clone, Debug)]
struct Shop {
    id: String,
    x: f64,
    y: f64,
    attraction: f64,
    capacity: u32,
    dwell_mean_seconds: f64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AgentProfile {
    GoalOriented,
    Browser,
    Commuter,
}

#[derive(Clone, Copy, Debug)]
struct ProfileParams {
    attraction_weight: f64,
    distance_decay: f64,
    dwell_multiplier: f64,
    temperature: f64,
}

struct ShopChoice<'a> {
    probability: f64,
    shop: &'a Shop,
}

impl AgentProfile {
    fn from_code(code: u32) -> AgentProfile {
        match code {
            1 => AgentProfile::Browser,
            2 => AgentProfile::Commuter,
            _ => AgentProfile::GoalOriented,
        }
    }

    fn label(self) -> &'static str {
        match self {
            AgentProfile::GoalOriented => "Goal",
            AgentProfile::Browser => "Browser",
            AgentProfile::Commuter => "Commuter",
        }
    }

    fn params(self) -> ProfileParams {
        match self {
            AgentProfile::GoalOriented => ProfileParams {
                attraction_weight: 2.2,
                distance_decay: 0.04,
                dwell_multiplier: 1.0,
                temperature: 0.55,
            },
            AgentProfile::Browser => ProfileParams {
                attraction_weight: 1.25,
                distance_decay: 0.025,
                dwell_multiplier: 1.35,
                temperature: 0.9,
            },
            AgentProfile::Commuter => ProfileParams {
                attraction_weight: 0.8,
                distance_decay: 0.08,
                dwell_multiplier: 0.55,
                temperature: 0.45,
            },
        }
    }
}

#[wasm_bindgen]
impl ShopDecisionModel {
    #[wasm_bindgen(constructor)]
    pub fn new() -> ShopDecisionModel {
        ShopDecisionModel { shops: Vec::new() }
    }

    pub fn add_shop(
        &mut self,
        id: String,
        x: f64,
        y: f64,
        attraction: f64,
        capacity: u32,
        dwell_mean_seconds: f64,
    ) -> u32 {
        self.shops.push(Shop {
            id,
            x,
            y,
            attraction: finite_or(attraction, 0.0).max(0.0),
            capacity: capacity.max(1),
            dwell_mean_seconds: finite_or(dwell_mean_seconds, 60.0).max(5.0),
        });

        (self.shops.len() - 1) as u32
    }

    pub fn shop_count(&self) -> usize {
        self.shops.len()
    }

    pub fn best_shop_label(&self, agent_x: f64, agent_y: f64, profile_code: u32) -> Option<String> {
        let profile = AgentProfile::from_code(profile_code);

        self.shops
            .iter()
            .max_by(|left, right| {
                utility(agent_x, agent_y, left, profile)
                    .total_cmp(&utility(agent_x, agent_y, right, profile))
            })
            .map(|shop| shop.id.clone())
    }

    pub fn choose_shop_label(
        &self,
        agent_x: f64,
        agent_y: f64,
        profile_code: u32,
        random_unit: f64,
    ) -> Option<String> {
        let choice = self.choose_shop(agent_x, agent_y, profile_code, random_unit)?;

        Some(choice.shop.id.clone())
    }

    pub fn sample_dwell_seconds(
        &self,
        shop_index: u32,
        profile_code: u32,
        random_unit: f64,
    ) -> f64 {
        let Some(shop) = self.shops.get(shop_index as usize) else {
            return 0.0;
        };
        let profile = AgentProfile::from_code(profile_code);

        sample_dwell_seconds(shop, profile, random_unit)
    }

    pub fn choice_summary(
        &self,
        agent_x: f64,
        agent_y: f64,
        profile_code: u32,
        random_unit: f64,
    ) -> String {
        let profile = AgentProfile::from_code(profile_code);
        let Some(choice) = self.choose_shop(agent_x, agent_y, profile_code, random_unit) else {
            return format!("{} no-shop", profile.label());
        };

        format!(
            "{} -> {} p={:.2} dwell={}s capacity={}",
            profile.label(),
            choice.shop.id,
            choice.probability,
            sample_dwell_seconds(choice.shop, profile, random_unit).round(),
            choice.shop.capacity
        )
    }

    fn choose_shop(
        &self,
        agent_x: f64,
        agent_y: f64,
        profile_code: u32,
        random_unit: f64,
    ) -> Option<ShopChoice<'_>> {
        let profile = AgentProfile::from_code(profile_code);
        let params = profile.params();
        let utilities = self
            .shops
            .iter()
            .map(|shop| utility(agent_x, agent_y, shop, profile))
            .collect::<Vec<_>>();
        let max_utility = utilities
            .iter()
            .copied()
            .reduce(f64::max)
            .unwrap_or(f64::NEG_INFINITY);
        let weights = utilities
            .iter()
            .map(|utility| ((utility - max_utility) / params.temperature).exp())
            .collect::<Vec<_>>();
        let total_weight = weights.iter().sum::<f64>();

        if total_weight <= 0.0 || !total_weight.is_finite() {
            return None;
        }

        let mut cursor = clamp01(random_unit) * total_weight;

        for (index, weight) in weights.iter().enumerate() {
            cursor -= weight;

            if cursor <= 0.0 {
                return Some(ShopChoice {
                    probability: weight / total_weight,
                    shop: &self.shops[index],
                });
            }
        }

        self.shops.last().map(|shop| ShopChoice {
            probability: weights.last().copied().unwrap_or(0.0) / total_weight,
            shop,
        })
    }
}

#[wasm_bindgen]
pub fn agent_profile_label(profile_code: u32) -> String {
    AgentProfile::from_code(profile_code).label().to_string()
}

fn utility(agent_x: f64, agent_y: f64, shop: &Shop, profile: AgentProfile) -> f64 {
    let params = profile.params();
    let distance = ((agent_x - shop.x).powi(2) + (agent_y - shop.y).powi(2)).sqrt();
    let capacity_boost = (shop.capacity as f64).ln_1p() * 0.08;

    shop.attraction * params.attraction_weight - distance * params.distance_decay + capacity_boost
}

fn sample_dwell_seconds(shop: &Shop, profile: AgentProfile, random_unit: f64) -> f64 {
    let params = profile.params();
    let jitter = 0.75 + clamp01(random_unit) * 0.5;

    (shop.dwell_mean_seconds * params.dwell_multiplier * jitter).max(5.0)
}
