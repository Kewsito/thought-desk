/** The label palette (courses, events) and the accent colours. */

export const PALETTE = [
  { key: 'red', label: 'Red' },
  { key: 'orange', label: 'Orange' },
  { key: 'yellow', label: 'Yellow' },
  { key: 'green', label: 'Green' },
  { key: 'teal', label: 'Teal' },
  { key: 'blue', label: 'Blue' },
  { key: 'indigo', label: 'Indigo' },
  { key: 'purple', label: 'Purple' },
  { key: 'pink', label: 'Pink' },
  { key: 'gray', label: 'Gray' },
] as const;

export type ColorKey = (typeof PALETTE)[number]['key'];

export const ACCENTS = [
  { key: 'graphite', label: 'Graphite' },
  ...PALETTE.filter((c) => c.key !== 'gray'),
] as const;

export type Accent = (typeof ACCENTS)[number]['key'];

/** CSS colour for a palette key; unknown or empty keys fall back to gray. */
export function colorVar(key: string | null | undefined): string {
  return PALETTE.some((c) => c.key === key) ? `var(--c-${key})` : 'var(--c-gray)';
}

/** A colour not used by any of `taken` yet (cycling once all are used). */
export function nextColor(taken: string[]): ColorKey {
  const keys = PALETTE.filter((c) => c.key !== 'gray').map((c) => c.key);
  return keys.find((k) => !taken.includes(k)) ?? keys[taken.length % keys.length];
}
