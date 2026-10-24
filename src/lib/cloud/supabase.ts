/**
 * The real cloud: Supabase, for profiles, friends, sessions and live updates.
 * Signing in is Clerk's (clerk.ts): Supabase trusts the session tokens Clerk
 * issues, and every request carries one.
 */

import { createClient, type PostgrestError } from '@supabase/supabase-js';
import * as clerk from './clerk';
import { ONLINE_FOR, type Cloud, type CloudChange, type CloudUser, type Friend, type LiveSession, type Profile, type Provider } from './types';

/** The project and its publishable key: both public by design (row-level security protects the data). */
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://nbzojbfkkpeisitbkwpg.supabase.co';
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_KEY as string | undefined) ?? 'sb_publishable_6W6p3hj5pIszsSA36NWUbQ_TXB4YwLD';

const PROFILE_COLS = 'id, username, display_name, avatar_url';

const SESSION_COLS = 'id, host, guest, kind, title, status, created_at, updated_at';
interface SessionRow {
  id: string;
  host: string;
  guest: string;
  kind: LiveSession['kind'];
  title: string;
  status: LiveSession['status'];
  created_at: string;
  updated_at: string;
}
const asSession = (r: SessionRow): LiveSession => ({
  id: r.id,
  hostId: r.host,
  guestId: r.guest,
  kind: r.kind,
  title: r.title,
  status: r.status,
  createdAt: Date.parse(r.created_at),
  updatedAt: Date.parse(r.updated_at),
});

const asProfile = (r: { id: string; username: string | null; display_name: string; avatar_url: string | null }): Profile => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
});

/** An error as something to show people. */
function friendly(e: PostgrestError | Error | null | undefined, fallback = 'Something went wrong. Try again.'): Error {
  if (!e) return new Error(fallback);
  const code = 'code' in e ? String(e.code ?? '') : '';
  if (code === '23505') return new Error('That username is taken.');
  if (code === '23514') return new Error('Use 3–20 lowercase letters, digits or _.');
  if (e instanceof TypeError || /fetch/i.test(e.message)) return new Error("Can't reach the cloud. Check your internet connection.");
  return new Error(e.message || fallback);
}

/** The session functions' errors (supabase/README.md) as something to show people. */
function sessionError(e: PostgrestError): Error {
  if (/expired/.test(e.message)) return new Error('That invite has expired. Ask for a new one.');
  if (/not friends/.test(e.message)) return new Error("You're not friends any more.");
  if (/not pending/.test(e.message)) return new Error('That invite was already answered.');
  if (/already (ended|cancelled|declined)/.test(e.message)) return new Error('That session has already ended.');
  if (e.code === 'P0002') return new Error('That session is gone.');
  return friendly(e);
}

/** How often Realtime renews its sign-in. A Clerk token lasts a minute and
 *  Realtime closes a channel the moment its token runs out, so it renews
 *  often, always to a token with time to spare (see clerk.sessionToken). */
const HEARTBEAT = 10_000;

type Channel = ReturnType<SupabaseCloud['client']['channel']>;

class SupabaseCloud implements Cloud {
  readonly client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    accessToken: () => clerk.sessionToken(),
    realtime: { heartbeatIntervalMs: HEARTBEAT },
  });
  #listeners = 0;

  /** In a browser (development): finishes a Google or GitHub sign-in that came back to this page. */
  finishRedirect = clerk.finishRedirect;
  user = clerk.user;
  onAuth = clerk.onAuth;
  cancelSignIn = clerk.cancelSignIn;
  signOut = clerk.signOut;

  signInWith(provider: Provider) {
    return clerk.signInWith(provider);
  }

  sendEmailCode(email: string) {
    return clerk.sendEmailCode(email);
  }

  verifyEmailCode(_email: string, code: string) {
    return clerk.verifyEmailCode(code);
  }

  accessToken() {
    return clerk.sessionToken();
  }

  /** Makes your profile the first time (from your Clerk name and picture),
   *  and keeps its picture in step with Clerk's. */
  async myProfile() {
    if (!(await this.user())) return null;
    const { data, error } = await this.client.rpc('ensure_profile');
    if (error) throw friendly(error);
    return data ? asProfile(data as Parameters<typeof asProfile>[0]) : null;
  }

  async updateProfile(patch: { username?: string; displayName?: string }) {
    const me = await this.#me();
    const row: Record<string, string> = {};
    if (patch.username !== undefined) row.username = patch.username;
    if (patch.displayName !== undefined) row.display_name = patch.displayName;
    const { data, error } = await this.client.from('profiles').update(row).eq('id', me.id).select(PROFILE_COLS).single();
    if (error) throw friendly(error);
    return asProfile(data);
  }

  async findProfile(username: string) {
    const { data, error } = await this.client.rpc('find_profile', { name: username });
    if (error) throw friendly(error);
    const row = (data as Parameters<typeof asProfile>[0][] | null)?.[0];
    return row ? asProfile(row) : null;
  }

  async friends(): Promise<Friend[]> {
    const me = await this.user();
    if (!me) return [];
    // Row-level security returns only your own requests and friendships,
    // and only the profiles and presence of the people in them.
    const { data: rows, error } = await this.client.from('friendships').select('requester, addressee, status');
    if (error) throw friendly(error);
    const others = rows.map((r) => (r.requester === me.id ? r.addressee : r.requester) as string);
    if (!others.length) return [];
    const [profiles, presence] = await Promise.all([
      this.client.from('profiles').select(PROFILE_COLS).in('id', others),
      this.client.from('presence').select('user_id, seen_at').in('user_id', others),
    ]);
    if (profiles.error) throw friendly(profiles.error);
    const seen = new Map((presence.data ?? []).map((p) => [p.user_id as string, Date.parse(p.seen_at as string)]));
    const byId = new Map(profiles.data.map((p) => [p.id as string, asProfile(p)]));
    return rows.flatMap((r): Friend[] => {
      const other = (r.requester === me.id ? r.addressee : r.requester) as string;
      const profile = byId.get(other);
      if (!profile) return [];
      const status = r.status === 'accepted' ? 'accepted' : r.requester === me.id ? 'outgoing' : 'incoming';
      return [{ profile, status, online: status === 'accepted' && Date.now() - (seen.get(other) ?? 0) < ONLINE_FOR }];
    });
  }

  async requestFriend(userId: string) {
    const me = await this.#me();
    const { error } = await this.client.from('friendships').insert({ requester: me.id, addressee: userId });
    if (error?.code === '23505') throw new Error("You're already friends, or one of you has asked already.");
    if (error) throw friendly(error);
  }

  async acceptFriend(userId: string) {
    const me = await this.#me();
    const { error } = await this.client.from('friendships').update({ status: 'accepted' }).eq('requester', userId).eq('addressee', me.id);
    if (error) throw friendly(error);
  }

  async removeFriend(userId: string) {
    const me = await this.#me();
    const pair = (a: string, b: string) => 'and(requester.eq.' + a + ',addressee.eq.' + b + ')';
    const { error } = await this.client.from('friendships').delete().or(pair(me.id, userId) + ',' + pair(userId, me.id));
    if (error) throw friendly(error);
  }

  async touchPresence() {
    const { error } = await this.client.rpc('touch_presence');
    if (error) throw friendly(error);
  }

  async sessions() {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data, error } = await this.client.from('cowork_sessions').select(SESSION_COLS).gte('updated_at', since).order('updated_at', { ascending: false });
    if (error) throw friendly(error);
    return (data as SessionRow[]).map(asSession);
  }

  async createSession({ kind, friendId, title }: { kind: 'invite' | 'request'; friendId: string; title: string }) {
    const me = await this.#me();
    const row: Pick<SessionRow, 'host' | 'guest' | 'kind' | 'title'> =
      kind === 'invite' ? { host: me.id, guest: friendId, kind, title } : { host: friendId, guest: me.id, kind, title: '' };
    const { data, error } = await this.client.from('cowork_sessions').insert(row).select(SESSION_COLS).single();
    if (error?.code === '42501') throw new Error('You can only work with friends.');
    if (error) throw friendly(error);
    return asSession(data as SessionRow);
  }

  async respondSession(id: string, accept: boolean, title?: string) {
    const { error } = await this.client.rpc('respond_session', { session_id: id, accept, page_title: title ?? null });
    if (error) throw sessionError(error);
  }

  async endSession(id: string) {
    const { error } = await this.client.rpc('end_session', { session_id: id });
    if (error) throw sessionError(error);
  }

  subscribe(cb: (change: CloudChange) => void) {
    let stop: (() => void) | null = null;
    let stopped = false;
    void this.user().then((me) => {
      if (!me || stopped) return;
      // New and changed rows that concern you (row-level security filters
      // them again on the server). Not deletes: those reach every listener
      // unfiltered, so a declined request or a removed friend shows within
      // the minute instead (the lists refresh every minute anyway). Each
      // listener gets a channel of its own: Realtime hands back an existing
      // channel of the same name, which takes no new callbacks once joined.
      stop = this.#keep(`mine:${me.id}:${++this.#listeners}`, (ch) => {
        for (const [table, change, column] of [
          ['friendships', 'friends', 'addressee'],
          ['friendships', 'friends', 'requester'],
          ['cowork_sessions', 'sessions', 'host'],
          ['cowork_sessions', 'sessions', 'guest'],
        ] as const) {
          for (const event of ['INSERT', 'UPDATE'] as const)
            ch.on('postgres_changes', { event, schema: 'public', table, filter: column + '=eq.' + me.id }, () => cb(change));
        }
        return ch;
      }).stop;
    });
    return () => {
      stopped = true;
      stop?.();
    };
  }

  nudges(sessionId: string, onNudge: () => void) {
    // A broadcast, stored nowhere, on a channel named by the session's
    // unguessable id. It only makes the other app reconnect to the relay,
    // which checks who may join.
    const kept = this.#keep('nudge:' + sessionId, (ch) => ch.on('broadcast', { event: 'nudge' }, () => onNudge()), { config: { broadcast: { self: false } } });
    return {
      send: () => void kept.current()?.send({ type: 'broadcast', event: 'nudge', payload: {} }),
      stop: kept.stop,
    };
  }

  /** Whoever is signed in, or an error saying to sign in. */
  async #me(): Promise<CloudUser> {
    const me = await this.user();
    if (!me) throw new Error('Sign in first.');
    return me;
  }

  /** A Realtime channel that comes back if it closes on its own, or if the
   *  server turns down what it listens for (Realtime rejoins neither: one
   *  whose sign-in ran out, say), sooner or later depending on how often it
   *  has failed. */
  #keep(name: string, setup: (ch: Channel) => Channel, params?: Parameters<SupabaseCloud['client']['channel']>[1]) {
    let current: Channel | null = null;
    let stopped = false;
    let wait = 1000;
    /** When the current channel joined (0: it hasn't). */
    let since = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const open = async () => {
      // A join carries whatever sign-in Realtime last had, which may be none
      // (it asks when the app starts, before anyone signs in): bring it up
      // to date first, or the server checks the channel as signed out.
      await this.client.realtime.setAuth().catch(() => {});
      if (stopped) return;
      const ch = setup(this.client.channel(name, params));
      current = ch;
      ch.on('system', {}, (message: { status?: string }) => message.status === 'error' && retire(ch));
      ch.subscribe((status) => {
        if (status !== 'SUBSCRIBED') retire(ch);
        else if (current === ch) since = Date.now();
      });
    };
    // Gone, or no use: make a new one (the same name would give back this one).
    const retire = (ch: Channel) => {
      if (stopped || current !== ch) return;
      current = null;
      // Up for a while before this: start the waiting over.
      if (since && Date.now() - since > 60_000) wait = 1000;
      since = 0;
      void this.client.removeChannel(ch).finally(() => {
        if (!stopped) retry = setTimeout(open, wait);
        wait = Math.min(wait * 2, 60_000);
      });
    };
    void open();
    return {
      current: () => current,
      stop: () => {
        stopped = true;
        clearTimeout(retry);
        if (current) void this.client.removeChannel(current);
        current = null;
      },
    };
  }
}

export const supabaseCloud = new SupabaseCloud();
