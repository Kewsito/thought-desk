/** Whether this is the desktop app, not the interface alone in a browser
 *  (development and the interface tests, see dev-mock.ts). Asked at call
 *  time: the browser stand-in installs itself after modules load. */
export function isDesktop(): boolean {
  return '__TAURI_INTERNALS__' in window && !(window as { __TD_MOCK__?: boolean }).__TD_MOCK__;
}
