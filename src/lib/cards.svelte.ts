/** Flashcards collected from every page, and studying them. */

import { api } from './api';
import { clock } from './clock.svelte';
import { isDue, schedule, type Grade } from './srs';
import { store } from './store.svelte';
import { ui } from './ui.svelte';
import type { Card } from './types';

/** New cards per study session, so a big new deck isn't one long sitting. */
const NEW_PER_SESSION = 30;

export interface Deck {
  pageId: string;
  cards: Card[];
  due: number;
  fresh: number;
}

class Cards {
  items = $state<Card[]>([]);
  loaded = $state(false);

  /** Cards grouped by the page they're written in, in sidebar order of use. */
  decks = $derived.by((): Deck[] => {
    const map = new Map<string, Card[]>();
    for (const c of this.items) {
      const page = store.byId.get(c.pageId);
      if (!page || page.deletedAt) continue;
      let list = map.get(c.pageId);
      if (!list) map.set(c.pageId, (list = []));
      list.push(c);
    }
    return [...map].map(([pageId, cards]) => ({
      pageId,
      cards,
      due: cards.filter((c) => c.review && isDue(c, clock.today)).length,
      fresh: cards.filter((c) => !c.review).length,
    }));
  });

  /** Cards to study today (due reviews plus new ones). */
  dueCount = $derived(this.decks.reduce((n, d) => n + d.due + d.fresh, 0));

  async load() {
    try {
      window.dispatchEvent(new Event('td:flush'));
      await store.flush();
      this.items = await api.listCards();
      this.loaded = true;
    } catch (e) {
      ui.error(e);
    }
  }

  deck(pageId: string): Deck | undefined {
    return this.decks.find((d) => d.pageId === pageId);
  }

  /** Decks inside a page (a course's notes folder, say), including itself. */
  decksUnder(pageId: string): Deck[] {
    return this.decks.filter((d) => d.pageId === pageId || store.isInside(d.pageId, pageId));
  }

  /**
   * Starts a session: due reviews first, then new cards in page order.
   * `all` studies every card regardless of schedule (cramming before a test).
   */
  async study(pageIds: string[] | null, title: string, { all = false } = {}) {
    await this.load();
    const today = clock.today;
    const pool = this.items.filter((c) => {
      const page = store.byId.get(c.pageId);
      return page && !page.deletedAt && (!pageIds || pageIds.includes(c.pageId));
    });
    const due = pool.filter((c) => c.review && (all || isDue(c, today))).sort((a, b) => a.review!.due.localeCompare(b.review!.due));
    const fresh = pool.filter((c) => !c.review);
    const queue = all ? [...due, ...fresh] : [...due, ...fresh.slice(0, NEW_PER_SESSION)];
    if (!queue.length) {
      ui.toast(pool.length ? 'Nothing due. Come back tomorrow.' : 'No flashcards yet. Type /flashcard in a page.');
      return;
    }
    ui.study = { title, cards: queue.map((c) => ({ ...c })) };
  }

  /** Records an answer; returns the card's new state. */
  async answer(card: Card, grade: Grade) {
    const review = schedule(card.review, grade, clock.today);
    const live = this.items.find((c) => c.pageId === card.pageId && c.id === card.id);
    if (live) live.review = review;
    try {
      await api.saveReview(card.pageId, card.id, review);
    } catch (e) {
      ui.error(e);
    }
    return review;
  }

  async reset(pageId: string) {
    const page = store.byId.get(pageId);
    const ok = await ui.confirm({
      title: 'Reset Progress?',
      message: `Every card in “${page?.title || 'Untitled'}” will be new again.`,
      confirmLabel: 'Reset',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.resetReviews(pageId);
      for (const c of this.items) if (c.pageId === pageId) c.review = null;
    } catch (e) {
      ui.error(e);
    }
  }
}

export const cards = new Cards();

// Card counts follow edits to the open page.
let timer: ReturnType<typeof setTimeout> | undefined;
$effect.root(() => {
  $effect(() => {
    void store.current?.updatedAt;
    if (!cards.loaded) return;
    clearTimeout(timer);
    timer = setTimeout(() => void cards.load(), 800);
  });
});
