//! Signing in with Google or GitHub from the desktop. The browser comes back
//! to a one-time listener on 127.0.0.1 with a code the app exchanges for a
//! session (OAuth's loopback redirect for native apps, RFC 8252). The code
//! is useless without the secret the app keeps (PKCE), so nothing else on
//! this computer can use it.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// Which listener is current: starting another sign-in retires the last one.
static CURRENT: AtomicU64 = AtomicU64::new(0);
/// How long a sign-in may take in the browser.
const WAIT: Duration = Duration::from_secs(600);
const PATH: &str = "/auth/callback";

/// Starts listening on a free port and returns it. When the browser comes
/// back, the window is brought forward and `auth-callback` carries the
/// query string (`code=…`, or `error=…&error_description=…`).
pub fn listen(app: AppHandle) -> std::io::Result<u16> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    listener.set_nonblocking(true)?;
    let port = listener.local_addr()?.port();
    let me = CURRENT.fetch_add(1, Ordering::SeqCst) + 1;
    std::thread::spawn(move || {
        let deadline = Instant::now() + WAIT;
        while Instant::now() < deadline && CURRENT.load(Ordering::SeqCst) == me {
            match listener.accept() {
                Ok((stream, _)) => {
                    if let Some(query) = answer(stream) {
                        let _ = app.emit("auth-callback", query);
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        return;
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(100)),
                Err(_) => return,
            }
        }
    });
    Ok(port)
}

/// Answers one browser request. The callback gets a page saying how sign-in
/// went, and its query string is returned; anything else (a favicon) gets a 404.
fn answer(mut stream: TcpStream) -> Option<String> {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf).ok()?;
    let request = String::from_utf8_lossy(&buf[..n]);
    match callback_query(&request) {
        Some(query) => {
            let ok = query.split('&').any(|p| p.starts_with("code=")) && !query.split('&').any(|p| p.starts_with("error="));
            let _ = stream.write_all(page(ok).as_bytes());
            Some(query.to_string())
        }
        None => {
            let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            None
        }
    }
}

/// The query string of a `GET /auth/callback?…` request line.
fn callback_query(request: &str) -> Option<&str> {
    let mut parts = request.lines().next()?.split_whitespace();
    if parts.next()? != "GET" {
        return None;
    }
    let (path, query) = parts.next()?.split_once('?').unwrap_or((PATH, ""));
    (path == PATH && !query.is_empty()).then_some(query)
}

fn page(ok: bool) -> String {
    let (title, text) = if ok {
        ("You're signed in", "You can close this tab and go back to Thought Desk.")
    } else {
        ("Sign-in didn't finish", "Go back to Thought Desk and try again.")
    };
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>{title} · Thought Desk</title>\
         <meta name=\"viewport\" content=\"width=device-width\"><style>\
         body{{margin:0;height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;\
         background:#f6f6f7;color:#1d1d1f}}@media(prefers-color-scheme:dark){{body{{background:#0f0f10;color:#f5f5f7}}}}\
         main{{text-align:center;padding:24px}}h1{{font-size:22px;font-weight:600;margin:0 0 8px}}p{{margin:0;opacity:.7}}\
         </style></head><body><main><h1>{title}</h1><p>{text}</p></main></body></html>"
    );
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_only_the_callback() {
        assert_eq!(callback_query("GET /auth/callback?code=abc&x=1 HTTP/1.1\r\nHost: x\r\n"), Some("code=abc&x=1"));
        assert_eq!(callback_query("GET /auth/callback?error=access_denied HTTP/1.1"), Some("error=access_denied"));
        for other in ["GET /favicon.ico HTTP/1.1", "POST /auth/callback?code=abc HTTP/1.1", "GET /auth/callback HTTP/1.1", ""] {
            assert_eq!(callback_query(other), None, "{other}");
        }
    }

    #[test]
    fn answers_the_browser() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let browser = std::thread::spawn(move || {
            let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
            s.write_all(b"GET /auth/callback?code=xyz HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
            let mut reply = String::new();
            s.read_to_string(&mut reply).unwrap();
            reply
        });
        let (stream, _) = listener.accept().unwrap();
        assert_eq!(answer(stream).as_deref(), Some("code=xyz"));
        let reply = browser.join().unwrap();
        assert!(reply.starts_with("HTTP/1.1 200 OK"), "{reply}");
        assert!(reply.contains("You're signed in"));
    }
}
