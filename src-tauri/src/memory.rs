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
