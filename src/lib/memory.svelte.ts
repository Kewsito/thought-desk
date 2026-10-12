/**
 * Live memory use, read from the Rust side every couple of seconds while
 * something is showing it (Settings, or the sidebar readout).
 */

import { api } from './api';

export interface MemorySample {
  /** The Rust core (database, files, reminders). */
  app: number;
  /** The web view's processes: drawing, the editor, page scripts. */
  webview: number;
  total: number;
  processes: number;
  systemTotal: number;
  /** Page scripts' heap (part of the web view), where the engine reports it. */
  jsHeap: number | null;
  at: number;
}

const INTERVAL = 2000;
/** One minute of history at one reading every two seconds. */
const KEEP = 30;

class Memory {
  current = $state<MemorySample | null>(null);
  history = $state<number[]>([]);
  peak = $state(0);
  #users = 0;
  #timer: ReturnType<typeof setInterval> | undefined;

  /** Starts readings; call the returned function when no longer showing them. */
  watch(): () => void {
    if (this.#users++ === 0) {
      void this.#read();
      this.#timer = setInterval(() => void this.#read(), INTERVAL);
    }
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      if (--this.#users === 0) clearInterval(this.#timer);
    };
  }

  async #read() {
    // Minimized: the web view is suspended and nobody is looking.
    if (document.visibilityState === 'hidden') return;
    try {
      const u = await api.memoryUsage();
      const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
      const total = u.app + u.webview;
      this.current = { ...u, total, jsHeap: heap, at: Date.now() };
      this.history = [...this.history, total].slice(-KEEP);
      this.peak = Math.max(this.peak, total);
    } catch {
      /* not available (very old runtime): the panel says so */
    }
  }
}

export const memory = new Memory();
