/** UI preferences, persisted in localStorage (they are per-device anyway). */

import { ACCENTS, type Accent } from './colors';

export type Theme = 'system' | 'light' | 'dark';
export type Font = 'sans' | 'serif' | 'mono';
/** 0 = Sunday, 1 = Monday. */
export type WeekStart = 0 | 1;
export type CalendarMode = 'month' | 'week';
export type FilesLayout = 'grid' | 'list';
export type AssignmentScope = 'upcoming' | 'all' | 'done';

interface Stored {
  theme: Theme;
  accent: Accent;
  font: Font;
  smallText: boolean;
  spellcheck: boolean;
  sidebarOpen: boolean;
  sidebarWidth: number;
  expanded: Record<string, boolean>;
  sections: Record<string, boolean>;
  lastPageId: string | null;
  /** Last place the user was ("page", "assignments", "calendar", "files"). */
  lastView: string;
  weekStart: WeekStart;
  calendarMode: CalendarMode;
  filesLayout: FilesLayout;
  assignmentScope: AssignmentScope;
}

/** Monday in most of the world, Sunday where the locale says so. */
function localeWeekStart(): WeekStart {
  type WeekInfo = { firstDay: number };
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo };
    const firstDay = (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay;
    if (firstDay) return firstDay === 7 ? 0 : 1;
  } catch {
    /* no week info in this engine: fall through */
  }
  return navigator.language === 'en-US' ? 0 : 1;
}

const KEY = 'thoughtdesk.prefs.v1';

const defaults: Stored = {
  theme: 'system',
  accent: 'graphite',
  font: 'sans',
  smallText: false,
  spellcheck: true,
  sidebarOpen: true,
  sidebarWidth: 260,
  expanded: {},
  sections: {},
  lastPageId: null,
  lastView: 'page',
  weekStart: localeWeekStart(),
  calendarMode: 'month',
  filesLayout: 'grid',
  assignmentScope: 'upcoming',
};

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const stored = { ...defaults, ...JSON.parse(raw) } as Stored;
      if (!ACCENTS.some((a) => a.key === stored.accent)) stored.accent = 'graphite';
      return stored;
    }
  } catch {
    /* corrupt or unavailable storage: fall back to defaults */
  }
  return { ...defaults };
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

class Prefs {
  #initial = read();
  theme = $state<Theme>(this.#initial.theme);
  accent = $state<Accent>(this.#initial.accent);
  font = $state<Font>(this.#initial.font);
  smallText = $state(this.#initial.smallText);
  spellcheck = $state(this.#initial.spellcheck);
  sidebarOpen = $state(this.#initial.sidebarOpen);
  sidebarWidth = $state(this.#initial.sidebarWidth);
  expanded = $state<Record<string, boolean>>(this.#initial.expanded);
  sections = $state<Record<string, boolean>>(this.#initial.sections);
  lastPageId = $state<string | null>(this.#initial.lastPageId);
  lastView = $state(this.#initial.lastView);
  weekStart = $state<WeekStart>(this.#initial.weekStart);
  calendarMode = $state<CalendarMode>(this.#initial.calendarMode);
  filesLayout = $state<FilesLayout>(this.#initial.filesLayout);
  assignmentScope = $state<AssignmentScope>(this.#initial.assignmentScope);

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
      accent: this.accent,
      font: this.font,
      smallText: this.smallText,
      spellcheck: this.spellcheck,
      sidebarOpen: this.sidebarOpen,
      sidebarWidth: this.sidebarWidth,
      expanded: $state.snapshot(this.expanded),
      sections: $state.snapshot(this.sections),
      lastPageId: this.lastPageId,
      lastView: this.lastView,
      weekStart: this.weekStart,
      calendarMode: this.calendarMode,
      filesLayout: this.filesLayout,
      assignmentScope: this.assignmentScope,
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
    root.dataset.accent = prefs.accent;
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
