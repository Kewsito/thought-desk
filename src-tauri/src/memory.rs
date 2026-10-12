//! Keeps the app light while it isn't being looked at.
//!
//! When the window is minimized we hide the WebView, ask it to suspend (which
//! pauses script and lets WebView2 drop GPU and renderer resources), and lower
//! its memory target so caches are trimmed. All of it is undone as soon as
//! the window is restored. Unsaved edits are flushed by the frontend when the
//! page becomes hidden, before the suspend takes effect.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, Runtime, Window, WindowEvent};

static LOW: AtomicBool = AtomicBool::new(false);

pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if !matches!(event, WindowEvent::Resized(_)) {
        return;
    }
    let minimized = window.is_minimized().unwrap_or(false);
    if LOW.swap(minimized, Ordering::Relaxed) == minimized {
        return;
    }
    if let Some(webview) = window.app_handle().get_webview_window(window.label()) {
        set_low_memory(&webview, minimized);
    }
}

#[cfg(windows)]
fn set_low_memory<R: Runtime>(webview: &tauri::WebviewWindow<R>, low: bool) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_19, ICoreWebView2_3, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
    };
    use webview2_com::TrySuspendCompletedHandler;
    use windows_core::Interface;

    let _ = webview.with_webview(move |wv| unsafe {
        let controller = wv.controller();
        let Ok(core) = controller.CoreWebView2() else { return };
        // Each step needs a newer WebView2 runtime; older ones just skip it.
        let level = if low {
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
        } else {
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
        };
        if let Ok(core19) = core.cast::<ICoreWebView2_19>() {
            let _ = core19.SetMemoryUsageTargetLevel(level);
        }
        let core3 = core.cast::<ICoreWebView2_3>().ok();
        if low {
            // Suspending requires the WebView to be hidden first.
            let _ = controller.SetIsVisible(false);
            if let Some(core3) = core3 {
                let _ = core3.TrySuspend(&TrySuspendCompletedHandler::create(Box::new(|_, _| Ok(()))));
            }
        } else {
            if let Some(core3) = core3 {
                let _ = core3.Resume();
            }
            let _ = controller.SetIsVisible(true);
        }
    });
}

#[cfg(not(windows))]
fn set_low_memory<R: Runtime>(_webview: &tauri::WebviewWindow<R>, _low: bool) {}

// ------------------------------------------------------------------ meter

/// How much memory Thought Desk is using right now: this process (the Rust
/// core) and the web view processes it started (on Windows, WebView2's
/// browser, renderer and GPU processes), which hold most of it.
#[derive(serde::Serialize, Clone, Copy, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryUsage {
    /// Bytes in this process.
    pub app: u64,
    /// Bytes in the web view's processes, together.
    pub webview: u64,
    /// How many web view processes there are.
    pub processes: usize,
    /// The computer's installed memory, for scale.
    pub system_total: u64,
}

/// Process list kept between readings, so each one only refreshes memory.
pub struct MemoryMeter(std::sync::Mutex<sysinfo::System>);

impl Default for MemoryMeter {
    fn default() -> Self {
        let mut sys = sysinfo::System::new();
        sys.refresh_memory();
        Self(std::sync::Mutex::new(sys))
    }
}

impl MemoryMeter {
    pub fn read(&self) -> MemoryUsage {
        use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate};
        use std::collections::HashMap;

        let Ok(me) = sysinfo::get_current_pid() else { return MemoryUsage::default() };
        let mut sys = self.0.lock().unwrap_or_else(|p| p.into_inner());
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_memory());

        let mut children: HashMap<Pid, Vec<Pid>> = HashMap::new();
        for (pid, process) in sys.processes() {
            if let Some(parent) = process.parent() {
                children.entry(parent).or_default().push(*pid);
            }
        }
        // Everything started by this process, however deep.
        let mut webview = 0;
        let mut processes = 0;
        let mut stack = children.get(&me).cloned().unwrap_or_default();
        while let Some(pid) = stack.pop() {
            if let Some(p) = sys.process(pid) {
                webview += p.memory();
                processes += 1;
            }
            if let Some(more) = children.get(&pid) {
                stack.extend(more);
            }
        }
        MemoryUsage {
            app: sys.process(me).map(|p| p.memory()).unwrap_or(0),
            webview,
            processes,
            system_total: sys.total_memory(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_this_process() {
        let meter = MemoryMeter::default();
        let usage = meter.read();
        assert!(usage.app > 1_000_000, "a running process uses some memory: {usage:?}");
        assert!(usage.system_total >= usage.app);
        // Readings repeat without trouble.
        assert!(meter.read().app > 0);
    }
}
