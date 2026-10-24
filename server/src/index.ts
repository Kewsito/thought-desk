/**
 * The relay for live sessions: one Durable Object per session passes both
 * people's edits and cursors between them (Yjs over a WebSocket). It keeps
 * nothing: when everyone has left, the room is gone. Each person's app keeps
 * the session's state, so reconnecting loses nothing. Only the two people in
 * an active session get in (see auth.ts), and the room asks again every
 * minute, so an ended session or an expired sign-in doesn't linger.
 */

import { routePartykitRequest, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import { YServer } from 'y-partyserver';
import { authorize, isLocal, PROTOCOL, tokenFrom, type AuthEnv } from './auth';

interface Env extends AuthEnv {
  Page: DurableObjectNamespace<Page>;
}

/** Who connected, as the Worker checked it (set by the Worker, never by the client). */
const USER = 'x-td-user';
const TOKEN = 'x-td-token';
const LOCAL = 'x-td-local';
/** The largest message passed on: a whole long page pasted at once fits. */
const MAX_MESSAGE = 4 * 1024 * 1024;
/** Connections one person may have in a room (the app needs one). */
const PER_PERSON = 3;
/** How often a room checks its session is still on, with each person's sign-in. */
const RECHECK = 60_000;

export class Page extends YServer<Env> {
  /** Each connection's person and sign-in, and whether it's from this computer (tests). */
  #who = new Map<string, { user: string; token: string; local: boolean }>();
  #recheck: ReturnType<typeof setInterval> | null = null;

  onConnect(conn: Connection, ctx: ConnectionContext) {
    const user = ctx.request.headers.get(USER);
    const token = ctx.request.headers.get(TOKEN);
    if (!user || !token) return conn.close(4001, 'Sign in first');
    if ([...this.#who.values()].filter((w) => w.user === user).length >= PER_PERSON) return conn.close(4008, 'Too many connections');
    this.#who.set(conn.id, { user, token, local: ctx.request.headers.get(LOCAL) === '1' });
    this.#recheck ??= setInterval(() => void this.#check(), RECHECK);
    return super.onConnect(conn, ctx);
  }

  onMessage(conn: Connection, message: WSMessage) {
    const size = typeof message === 'string' ? message.length : message.byteLength;
    if (size > MAX_MESSAGE) return conn.close(1009, 'Message too big');
    return super.onMessage(conn, message);
  }

  onClose(conn: Connection, code: number, reason: string, wasClean: boolean) {
    this.#who.delete(conn.id);
    if (!this.#who.size) {
      clearInterval(this.#recheck);
      this.#recheck = null;
    }
    return super.onClose(conn, code, reason, wasClean);
  }

  /** Asks again for each connection: an expired sign-in closes it (the app
   *  reconnects with a fresh one); a session that's over closes the room. */
  async #check() {
    for (const conn of this.getConnections()) {
      const who = this.#who.get(conn.id);
      if (!who) continue;
      const verdict = await authorize(who.token, this.name, who.local, this.env).catch(() => null);
      if (!verdict || verdict.ok) continue;
      if (verdict.status === 401) conn.close(4001, verdict.reason);
      else for (const c of this.getConnections()) c.close(4003, verdict.reason);
    }
  }
}

const ROOM = /^\/parties\/page\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/') return new Response('Thought Desk live sessions', { headers: { 'content-type': 'text/plain' } });
    const room = ROOM.exec(url.pathname)?.[1];
    if (!room) return new Response('Not found', { status: 404 });
    const token = tokenFrom(request.headers.get('Sec-WebSocket-Protocol'));
    const local = isLocal(request);
    const verdict = await authorize(token, room, local, env);
    if (!verdict.ok) return new Response(verdict.reason, { status: verdict.status });

    // The room learns who this is from here alone: these overwrite anything the client sent.
    const headers = new Headers(request.headers);
    headers.delete('Sec-WebSocket-Protocol');
    headers.set(USER, verdict.userId);
    headers.set(TOKEN, token);
    headers.set(LOCAL, local ? '1' : '0');
    const res = await routePartykitRequest(new Request(request, { headers }), env as unknown as Record<string, unknown>);
    if (!res) return new Response('Not found', { status: 404 });
    if (res.status !== 101) return res;
    // The browser only takes the socket if the relay picks one of the subprotocols it offered.
    const out = new Headers(res.headers);
    out.set('Sec-WebSocket-Protocol', PROTOCOL);
    return new Response(null, { status: 101, webSocket: res.webSocket, headers: out });
  },
} satisfies ExportedHandler<Env>;
