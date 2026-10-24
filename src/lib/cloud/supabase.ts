/**
 * The real cloud: Supabase. Signing in uses PKCE. On the desktop, Google and
 * GitHub come back to a one-time listener on 127.0.0.1 (src-tauri/src/auth.rs);
 * in a browser (development) the page itself is redirected back.
 */

import { createClient, type AuthError, type PostgrestError, type User } from '@supabase/supabase-js';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { api } from '../api';
import { isDesktop } from '../platform';
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

const asUser = (u: User | null | undefined): CloudUser | null => (u ? { id: u.id, email: u.email ?? null } : null);
const asProfile = (r: { id: string; username: string | null; display_name: string; avatar_url: string | null }): Profile => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
});

/** An error as something to show people. */
function friendly(e: AuthError | PostgrestError | Error | null | undefined, fallback = 'Something went wrong. Try again.'): Error {
  if (!e) return new Error(fallback);
  const code = 'code' in e ? String(e.code ?? '') : '';
  const status = 'status' in e ? Number(e.status) : 0;
  if (code === '23505') return new Error('That username is taken.');
  if (code === '23514') return new Error('Use 3–20 lowercase letters, digits or _.');
  if (code === 'email_address_not_authorized')
    return new Error("Email sign-in can't reach this address yet. Use Google or GitHub, or ask whoever runs this Thought Desk to set up email.");
  if (code === 'over_email_send_rate_limit' || status === 429) return new Error('Too many tries for now. Wait a minute and try again.');
  if (e instanceof TypeError || /fetch/i.test(e.message)) return new Error("Can't reach the sign-in service. Check your internet connection.");
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

/** Where the app keeps the sign-in: encrypted by Windows in its own folder,
 *  not in the WebView's storage, where any program could read it. One kept
 *  there by an earlier version moves over the first time it's asked for. */
const desktopStorage = {
  async getItem(key: string) {
    const kept = await api.secretGet(key);
    if (kept !== null) return kept;
    const old = localStorage.getItem(key);
    if (old === null) return null;
    await api.secretSet(key, old);
    localStorage.removeItem(key);
    return old;
  },
  setItem: (key: string, value: string) => api.secretSet(key, value),
  async removeItem(key: string) {
    localStorage.removeItem(key);
    await api.secretRemove(key);
  },
};

class SupabaseCloud implements Cloud {
  readonly client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'thoughtdesk.auth',
      // The browser preview (development only) keeps it in localStorage.
      ...(isDesktop() ? { storage: desktopStorage } : {}),
    },
  });
  #cancel: (() => void) | null = null;

  async user() {
    return asUser((await this.client.auth.getSession()).data.session?.user);
  }

  onAuth(cb: (user: CloudUser | null) => void) {
    // Supabase asks that its own calls wait until this callback has returned.
    const { data } = this.client.auth.onAuthStateChange((_event, session) => setTimeout(() => cb(asUser(session?.user))));
    return () => data.subscription.unsubscribe();
  }

  async signInWith(provider: Provider) {
    if (!isDesktop()) {
      // The page goes to the provider and comes back with ?code= (see finishRedirect).
      const { error } = await this.client.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname } });
      if (error) throw friendly(error);
      return new Promise<void>(() => {});
    }
    const port = await api.authListen();
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `http://127.0.0.1:${port}/auth/callback`, skipBrowserRedirect: true },
    });
    if (error || !data.url) throw friendly(error);
    let stop: (() => void) | undefined;
    const back = new Promise<string>((resolve, reject) => {
      this.#cancel = () => reject(new Error('cancelled'));
      void listen<string>('auth-callback', (e) => resolve(e.payload)).then((unlisten) => (stop = unlisten));
    });
    try {
      await openUrl(data.url);
      const params = new URLSearchParams(await back);
      const code = params.get('code');
      if (!code) throw new Error(params.get('error_description')?.replace(/\+/g, ' ') || 'Sign-in was cancelled.');
      const { error: exchange } = await this.client.auth.exchangeCodeForSession(code);
      if (exchange) throw friendly(exchange);
    } finally {
      stop?.();
      this.#cancel = null;
    }
  }

  cancelSignIn() {
    this.#cancel?.();
  }

  /** In a browser (development): finishes a Google or GitHub sign-in that came back with ?code=. */
  async finishRedirect() {
    const code = new URLSearchParams(location.search).get('code');
    if (!code) return;
    history.replaceState(null, '', location.pathname);
    const { error } = await this.client.auth.exchangeCodeForSession(code);
    if (error) throw friendly(error);
  }

  async sendEmailCode(email: string) {
    const { error } = await this.client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw friendly(error);
  }

  async verifyEmailCode(email: string, code: string) {
    const { error } = await this.client.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error && (error.code === 'otp_expired' || error.status === 401 || error.status === 403))
      throw new Error("That code isn't right, or it has expired. Ask for a new one.");
    if (error) throw friendly(error);
  }

  async signOut() {
    // This computer only: other devices stay signed in.
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw friendly(error);
  }

  async accessToken() {
    return (await this.client.auth.getSession()).data.session?.access_token ?? null;
  }

  async myProfile() {
    const me = await this.user();
    if (!me) return null;
    const { data, error } = await this.client.from('profiles').select(PROFILE_COLS).eq('id', me.id).maybeSingle();
    if (error) throw friendly(error);
    return data ? asProfile(data) : null;
  }

  async updateProfile(patch: { username?: string; displayName?: string }) {
    const me = await this.user();
    if (!me) throw new Error('Sign in first.');
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
    const me = await this.user();
    if (!me) throw new Error('Sign in first.');
    const { error } = await this.client.from('friendships').insert({ requester: me.id, addressee: userId });
    if (error?.code === '23505') throw new Error("You're already friends, or one of you has asked already.");
    if (error) throw friendly(error);
  }

  async acceptFriend(userId: string) {
    const me = await this.user();
    if (!me) throw new Error('Sign in first.');
    const { error } = await this.client.from('friendships').update({ status: 'accepted' }).eq('requester', userId).eq('addressee', me.id);
    if (error) throw friendly(error);
  }

  async removeFriend(userId: string) {
    const me = await this.user();
    if (!me) throw new Error('Sign in first.');
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
    const me = await this.user();
    if (!me) throw new Error('Sign in first.');
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
    let channel: ReturnType<SupabaseCloud['client']['channel']> | null = null;
    let stopped = false;
    void this.user().then((me) => {
      if (!me || stopped) return;
      // New and changed rows that concern you (row-level security filters
      // them again on the server). Not deletes: those reach every listener
      // unfiltered, so a declined request or a removed friend shows within
      // the minute instead (the lists refresh every minute anyway).
      const ch = this.client.channel('mine:' + me.id);
      for (const [table, change, column] of [
        ['friendships', 'friends', 'addressee'],
        ['friendships', 'friends', 'requester'],
        ['cowork_sessions', 'sessions', 'host'],
        ['cowork_sessions', 'sessions', 'guest'],
      ] as const) {
        for (const event of ['INSERT', 'UPDATE'] as const)
          ch.on('postgres_changes', { event, schema: 'public', table, filter: column + '=eq.' + me.id }, () => cb(change));
      }
      ch.subscribe();
      channel = ch;
    });
    return () => {
      stopped = true;
      if (channel) void this.client.removeChannel(channel);
    };
  }

  nudges(sessionId: string, onNudge: () => void) {
    // A broadcast, stored nowhere, on a channel named by the session's
    // unguessable id. It only makes the other app reconnect to the relay,
    // which checks who may join.
    const channel = this.client
      .channel('nudge:' + sessionId, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'nudge' }, () => onNudge())
      .subscribe();
    return {
      send: () => void channel.send({ type: 'broadcast', event: 'nudge', payload: {} }),
      stop: () => void this.client.removeChannel(channel),
    };
  }
}

export const supabaseCloud = new SupabaseCloud();
