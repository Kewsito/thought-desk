/**
 * Your friends and friend requests, kept up to date while you're signed in:
 * at once when something changes on their side, and every minute, which is
 * also when the app tells your friends you're here.
 */

import { untrack } from 'svelte';
import { account } from './account.svelte';
import { api } from './api';
import { cloud, USERNAME, type Friend } from './cloud';
import { ui } from './ui.svelte';

const EVERY = 60_000;

const byName = (a: Friend, b: Friend) => (a.profile.displayName || a.profile.username || '').localeCompare(b.profile.displayName || b.profile.username || '');

/** How to show someone: their name, else their @username. */
export const nameOf = (f: Friend) => f.profile.displayName || `@${f.profile.username ?? '?'}`;

/** News for you: in the app, and as a system notification when it's in the background. */
export function announce(title: string, body: string, action?: { label: string; run: () => void }) {
  ui.toast(`${title}: ${body}`, action, 8000);
  if (document.hidden || !document.hasFocus()) void api.notify(title, body).catch(() => {});
}

class Friends {
  list = $state<Friend[]>([]);
  loaded = $state(false);

  /** Friends, the ones here now first. */
  accepted = $derived(this.list.filter((f) => f.status === 'accepted').sort((a, b) => Number(b.online) - Number(a.online) || byName(a, b)));
  /** People who asked you. */
  incoming = $derived(this.list.filter((f) => f.status === 'incoming').sort(byName));
  /** People you asked. */
  outgoing = $derived(this.list.filter((f) => f.status === 'outgoing').sort(byName));

  #stop: (() => void) | null = null;
  #timer: ReturnType<typeof setInterval> | undefined;
  #following: string | null = null;

  /** Follows whoever is signed in: starts on sign-in, clears on sign-out. */
  init() {
    $effect.root(() => {
      $effect(() => {
        const id = account.user?.id ?? null;
        const ready = !!account.profile?.username;
        untrack(() => void this.#follow(ready ? id : null));
      });
    });
  }

  async #follow(id: string | null) {
    if (id === this.#following) return;
    this.#following = id;
    this.#stop?.();
    this.#stop = null;
    clearInterval(this.#timer);
    this.list = [];
    this.loaded = false;
    if (!id) return;
    const c = await cloud();
    if (this.#following !== id) return;
    this.#stop = c.subscribe((change) => change === 'friends' && void this.refresh());
    const tick = () => {
      void c.touchPresence().catch(() => {});
      void this.refresh();
    };
    tick();
    this.#timer = setInterval(tick, EVERY);
  }

  async refresh() {
    const known = this.loaded ? new Set(this.incoming.map((f) => f.profile.id)) : null;
    try {
      this.list = await (await cloud()).friends();
      this.loaded = true;
    } catch (e) {
      console.warn('Friends: could not refresh', e);
      return;
    }
    // A new request since the last look (not the ones there at start-up).
    if (known)
      for (const f of this.incoming)
        if (!known.has(f.profile.id)) announce(`${nameOf(f)} wants to be friends`, `@${f.profile.username}`, { label: 'Accept', run: () => void this.accept(f.profile.id) });
  }

  /** Sends a friend request by username (or accepts theirs). */
  async add(input: string): Promise<'sent' | 'accepted'> {
    const name = input.trim().toLowerCase().replace(/^@/, '');
    if (!USERNAME.test(name)) throw new Error('Usernames are 3–20 lowercase letters, digits or _.');
    if (name === account.profile?.username) throw new Error("That's you.");
    const c = await cloud();
    const person = await c.findProfile(name);
    if (!person) throw new Error(`No one is called @${name}.`);
    const already = this.list.find((f) => f.profile.id === person.id);
    if (already?.status === 'accepted') throw new Error(`You're already friends with @${name}.`);
    if (already?.status === 'outgoing') throw new Error(`You've already asked @${name}.`);
    if (already?.status === 'incoming') {
      await this.accept(person.id);
      return 'accepted';
    }
    await c.requestFriend(person.id);
    await this.refresh();
    return 'sent';
  }

  async accept(id: string) {
    await (await cloud()).acceptFriend(id);
    await this.refresh();
  }

  /** Declines, cancels or unfriends. */
  async remove(id: string) {
    await (await cloud()).removeFriend(id);
    await this.refresh();
  }
}

export const friends = new Friends();
