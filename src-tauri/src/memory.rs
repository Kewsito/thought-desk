//! Keeps the app light while it isn't being looked at.
//!
//! When the window is minimized we hide the WebView, ask it to suspend (which
//! pauses script and lets WebView2 drop GPU and renderer resources), and lower
//! its memory target so caches are trimmed. All of it is undone as soon as
//! the window is restored. Unsaved edits are flushed by the frontend when the
//! page becomes hidden, before the suspend takes effect.
//!
//! While the window stays visible but unfocused for a while (you're working in
//! another app), we only lower the memory target, so WebView2 drops its
//! graphics and decode caches without pausing anything. Focus brings it back.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;
use tauri::{Manager, Runtime, Window, WindowEvent};

static LOW: AtomicBool = AtomicBool::new(false);

/// Bumped on every focus change, so a pending idle trim can tell it is stale.
static FOCUS_GEN: AtomicU64 = AtomicU64::new(0);
static IDLE_TRIMMED: AtomicBool = AtomicBool::new(false);
const IDLE_AFTER: Duration = Duration::from_secs(45);

pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if let WindowEvent::Focused(focused) = event {
        on_focus_change(window, *focused);
        return;
    }
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

fn on_focus_change<R: Runtime>(window: &Window<R>, focused: bool) {
    let generation = FOCUS_GEN.fetch_add(1, Ordering::Relaxed) + 1;
    let app = window.app_handle().clone();
    let label = window.label().to_string();
    if focused {
        if IDLE_TRIMMED.swap(false, Ordering::Relaxed) && !LOW.load(Ordering::Relaxed) {
            if let Some(webview) = app.get_webview_window(&label) {
                set_memory_target(&webview, false);
            }
        }
        return;
    }
    std::thread::spawn(move || {
        std::thread::sleep(IDLE_AFTER);
        // Still unfocused since then, and not minimized (that path does more).
        if FOCUS_GEN.load(Ordering::Relaxed) != generation || LOW.load(Ordering::Relaxed) {
            return;
        }
        if let Some(webview) = app.get_webview_window(&label) {
            set_memory_target(&webview, true);
            IDLE_TRIMMED.store(true, Ordering::Relaxed);
        }
    });
}

/// Only the memory target: the page keeps running and stays visible.
#[cfg(windows)]
fn set_memory_target<R: Runtime>(webview: &tauri::WebviewWindow<R>, low: bool) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
    };
    use windows_core::Interface;

    let _ = webview.with_webview(move |wv| unsafe {
        let Ok(core) = wv.controller().CoreWebView2() else { return };
        if let Ok(core19) = core.cast::<ICoreWebView2_19>() {
            let level = if low { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW } else { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL };
            let _ = core19.SetMemoryUsageTargetLevel(level);
        }
    });
}

#[cfg(not(windows))]
fn set_memory_target<R: Runtime>(_webview: &tauri::WebviewWindow<R>, _low: bool) {}

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

/// Memory that belongs to this process alone: the private working set, the
/// figure Task Manager shows. Summing full working sets would count memory the
/// web view processes share (DLLs, graphics buffers) once per process, which
/// overstates the total several times over. Falls back to `fallback`.
#[cfg(windows)]
fn private_memory(pid: sysinfo::Pid, fallback: u64) -> u64 {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX2};
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

    unsafe {
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid.as_u32()) else {
            return fallback;
        };
        let mut counters = PROCESS_MEMORY_COUNTERS_EX2 {
            cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX2>() as u32,
            ..Default::default()
        };
        let ok = GetProcessMemoryInfo(handle, &mut counters as *mut _ as *mut PROCESS_MEMORY_COUNTERS, counters.cb).is_ok();
        let _ = CloseHandle(handle);
        if ok && counters.PrivateWorkingSetSize > 0 {
            counters.PrivateWorkingSetSize as u64
        } else {
            fallback
        }
    }
}

#[cfg(not(windows))]
fn private_memory(_pid: sysinfo::Pid, fallback: u64) -> u64 {
    fallback
}

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
                webview += private_memory(pid, p.memory());
                processes += 1;
            }
            if let Some(more) = children.get(&pid) {
                stack.extend(more);
            }
        }
        MemoryUsage {
            app: sys.process(me).map(|p| private_memory(me, p.memory())).unwrap_or(0),
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
