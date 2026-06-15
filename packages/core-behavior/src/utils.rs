pub(crate) fn finite_or(value: f64, fallback: f64) -> f64 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}

pub(crate) fn clamp01(value: f64) -> f64 {
    finite_or(value, 0.0).clamp(0.0, 1.0)
}
