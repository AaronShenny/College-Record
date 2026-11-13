//! Native close decisions that are also testable without a Windows webview.
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

/// A failed bootstrap has no newly opened account workspace to synchronize.
/// Once a service exists, this shortcut is permanently unavailable.
pub fn may_close_before_workspace(service_exists: bool, active: usize, dirty: bool) -> bool {
    !service_exists && active == 0 && !dirty
}

pub struct ActiveRequest<'a>(&'a AtomicUsize);
impl<'a> ActiveRequest<'a> {
    pub fn enter(count: &'a AtomicUsize, closing: &AtomicBool) -> Result<Self, &'static str> {
        // Register BEFORE checking the fence; close cannot miss an accepted save.
        count.fetch_add(1, Ordering::SeqCst);
        let request = Self(count);
        if closing.load(Ordering::SeqCst) {
            return Err("The app is closing. No new operation was started.");
        }
        Ok(request)
    }
}
impl Drop for ActiveRequest<'_> {
    fn drop(&mut self) { self.0.fetch_sub(1, Ordering::SeqCst); }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failed_boot_then_window_close_needs_no_renderer_or_drive_service() {
        let active = AtomicUsize::new(0);
        let closing = AtomicBool::new(false);
        let boot = ActiveRequest::enter(&active, &closing).unwrap();
        assert!(!may_close_before_workspace(false, active.load(Ordering::SeqCst), false));
        // Onboarding/bridge failure releases the same native operation guard.
        drop(boot);
        closing.store(true, Ordering::SeqCst);
        assert!(may_close_before_workspace(false, active.load(Ordering::SeqCst), false));
        assert!(ActiveRequest::enter(&active, &closing).is_err());
        assert_eq!(active.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn an_opened_service_can_never_use_the_startup_exit_even_if_renderer_fails() {
        assert!(!may_close_before_workspace(true, 0, false));
        assert!(!may_close_before_workspace(true, 0, true));
        assert!(!may_close_before_workspace(false, 0, true));
    }

    #[test]
    fn a_request_accepted_before_the_close_fence_must_drain_first() {
        let active = AtomicUsize::new(0);
        let closing = AtomicBool::new(false);
        let save = ActiveRequest::enter(&active, &closing).unwrap();
        closing.store(true, Ordering::SeqCst);
        assert_eq!(active.load(Ordering::SeqCst), 1);
        assert!(!may_close_before_workspace(false, active.load(Ordering::SeqCst), false));
        assert!(ActiveRequest::enter(&active, &closing).is_err());
        assert_eq!(active.load(Ordering::SeqCst), 1);
        drop(save);
        assert_eq!(active.load(Ordering::SeqCst), 0);
    }
}
