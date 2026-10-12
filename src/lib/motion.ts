/** Svelte transitions shared by popovers, menus and dialogs. */

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Exponential ease-out: fast start, long gentle settle. */
const expoOut = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** Scales and fades in from slightly smaller, like a macOS popover. */
export function pop(_node: Element, { duration = 220, scale = 0.96, y = -4 } = {}) {
  return {
    duration: reduced() ? 0 : duration,
    easing: expoOut,
    css: (t: number, u: number) =>
      `opacity: ${Math.min(1, t * 1.6)}; transform: translateY(${u * y}px) scale(${1 - u * (1 - scale)});`,
  };
}

/** Quick fade for exits; leaving should never feel slower than arriving. */
export function fadeOut(_node: Element, { duration = 120 } = {}) {
  return {
    duration: reduced() ? 0 : duration,
    css: (t: number) => `opacity: ${t};`,
  };
}

/** For modal sheets: a little more scale, and the backdrop fades with it. */
export function sheet(_node: Element, { duration = 300 } = {}) {
  return pop(_node, { duration, scale: 0.94, y: 8 });
}

export function fade(_node: Element, { duration = 200 } = {}) {
  return {
    duration: reduced() ? 0 : duration,
    css: (t: number) => `opacity: ${t};`,
  };
}
