/**
 * Who may join a room: someone signed in to Thought Desk (a Supabase token,
 * checked against the project's public keys) who is one of the two people in
 * that session while it's active. The relay asks Supabase with the person's
 * own token, so the database's row-level security makes the decision.
 *
 * The token comes as the WebSocket's second subprotocol ("thoughtdesk,
 * <token>"), never in the address, so it stays out of URLs and their logs.
 */

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface AuthEnv {
  /** The Supabase project, e.g. https://nbzojbfkkpeisitbkwpg.supabase.co */
  SUPABASE_URL: string;
  /** Its publishable key (public by design). */
  SUPABASE_KEY: string;
  /** "test" lets the interface tests in with fake tokens, on localhost only. */
  AUTH_MODE?: string;
}

export type Verdict = { ok: true; userId: string } | { ok: false; status: 401 | 403; reason: string };

/** What auth needs from outside, so tests can stand in for it. */
export interface AuthDeps {
  keys: JWTVerifyGetKey;
  fetch: typeof fetch;
}

/** The subprotocol the app offers, and the relay picks. */
export const PROTOCOL = 'thoughtdesk';

/** The token from a Sec-WebSocket-Protocol header ("thoughtdesk, <token>"), or ''. */
export function tokenFrom(protocols: string | null): string {
  const [name, token] = (protocols ?? '').split(',').map((p) => p.trim());
  return name === PROTOCOL && token ? token : '';
}

const keySets = new Map<string, JWTVerifyGetKey>();

/** The project's public keys, fetched once per worker and cached by jose. */
export function projectKeys(env: AuthEnv): JWTVerifyGetKey {
  let keys = keySets.get(env.SUPABASE_URL);
  if (!keys) keySets.set(env.SUPABASE_URL, (keys = createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`))));
  return keys;
}

const LOOPBACK = new Set(['127.0.0.1', '::1']);

/** Whether a request came from this computer: a relay run locally. Cloudflare
 *  sets CF-Connecting-IP itself, so a request from outside never claims it. */
export const isLocal = (request: Request) => LOOPBACK.has(request.headers.get('CF-Connecting-IP') ?? '');

/** Whether `token` may be in `room`. `local`: the request came from this computer (isLocal). */
export async function authorize(
  token: string,
  room: string,
  local: boolean,
  env: AuthEnv,
  deps: AuthDeps = { keys: projectKeys(env), fetch },
): Promise<Verdict> {
  if (!token) return { ok: false, status: 401, reason: 'Sign in first' };

  if (env.AUTH_MODE === 'test') {
    // Tests only: never from outside this computer, whatever the setting says.
    const id = /^test\.([0-9a-f-]{36})$/.exec(token)?.[1];
    if (local && id) return { ok: true, userId: id };
    return { ok: false, status: 401, reason: 'Test sign-ins only work locally' };
  }

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, deps.keys, { issuer: `${env.SUPABASE_URL}/auth/v1`, audience: 'authenticated' });
    if (typeof payload.sub !== 'string') throw new Error('No user in the token');
    userId = payload.sub;
  } catch {
    return { ok: false, status: 401, reason: 'Your sign-in has expired: sign in again' };
  }

  const res = await deps.fetch(`${env.SUPABASE_URL}/rest/v1/cowork_sessions?id=eq.${encodeURIComponent(room)}&status=eq.active&select=id`, {
    headers: { apikey: env.SUPABASE_KEY, authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (!res.ok) return { ok: false, status: 403, reason: 'Could not check the session' };
  const rows = (await res.json()) as unknown[];
  return rows.length === 1 ? { ok: true, userId } : { ok: false, status: 403, reason: "You're not in this session, or it has ended" };
}
