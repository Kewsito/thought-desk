/** UI preferences, persisted in localStorage (they are per-device anyway). */

export type Theme = 'system' | 'light' | 'dark';
export type Font = 'sans' | 'serif' | 'mono';

interface Stored {
  theme: Theme;
  font: Font;
  smallText: boolean;
  spellcheck: boolean;
  sidebarOpen: boolean;
  sidebarWidth: number;
  expanded: Record<string, boolean>;
  sections: Record<string, boolean>;
  lastPageId: string | null;
}

const KEY = 'thoughtdesk.prefs.v1';

const defaults: Stored = {
  theme: 'system',
  font: 'sans',
  smallText: false,
  spellcheck: true,
  sidebarOpen: true,
  sidebarWidth: 260,
  expanded: {},
  sections: {},
  lastPageId: null,
};

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* corrupt or unavailable storage: fall back to defaults */
  }
  return { ...defaults };
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

class Prefs {
  #initial = read();
  theme = $state<Theme>(this.#initial.theme);
  font = $state<Font>(this.#initial.font);
  smallText = $state(this.#initial.smallText);
  spellcheck = $state(this.#initial.spellcheck);
  sidebarOpen = $state(this.#initial.sidebarOpen);
  sidebarWidth = $state(this.#initial.sidebarWidth);
  expanded = $state<Record<string, boolean>>(this.#initial.expanded);
  sections = $state<Record<string, boolean>>(this.#initial.sections);
  lastPageId = $state<string | null>(this.#initial.lastPageId);

  systemDark = $state(darkQuery.matches);
  resolvedTheme = $derived<'light' | 'dark'>(
    this.theme === 'system' ? (this.systemDark ? 'dark' : 'light') : this.theme,
  );

  toggleTheme() {
    this.theme = this.resolvedTheme === 'dark' ? 'light' : 'dark';
  }

  snapshot(): Stored {
    return {
      theme: this.theme,
      font: this.font,
      smallText: this.smallText,
      spellcheck: this.spellcheck,
      sidebarOpen: this.sidebarOpen,
      sidebarWidth: this.sidebarWidth,
      expanded: $state.snapshot(this.expanded),
      sections: $state.snapshot(this.sections),
      lastPageId: this.lastPageId,
    };
  }
}

export const prefs = new Prefs();

darkQuery.addEventListener('change', (e) => (prefs.systemDark = e.matches));

let saveTimer: ReturnType<typeof setTimeout> | undefined;

$effect.root(() => {
  // Apply theme and typography to the document.
  $effect(() => {
    const root = document.documentElement;
    root.dataset.theme = prefs.resolvedTheme;
    root.dataset.font = prefs.font;
    root.classList.toggle('small-text', prefs.smallText);
    root.style.colorScheme = prefs.resolvedTheme;
  });
  // Persist (debounced) whenever anything changes.
  $effect(() => {
    const data = prefs.snapshot();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        /* storage full or unavailable: preferences just won't persist */
      }
    }, 250);
  });
});
