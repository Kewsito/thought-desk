// Who gets into a room. Run with `npm test` (Node's own test runner).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, generateKeyPair, type JWTVerifyGetKey } from 'jose';
import { authorize, isLocal, tokenFrom, type AuthDeps, type AuthEnv } from '../src/auth.ts';

const env: AuthEnv = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_KEY: 'sb_publishable_test' };
const ROOM = '0b9a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d';
const ANA = '11111111-1111-4111-8111-111111111111';

const { publicKey, privateKey } = await generateKeyPair('ES256');
const keys: JWTVerifyGetKey = async () => publicKey;

function token({ sub = ANA, iss = `${env.SUPABASE_URL}/auth/v1`, aud = 'authenticated', expires = '1h' } = {}) {
  return new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'ES256' }).setSubject(sub).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(expires).sign(privateKey);
}

/** Supabase's answer to "is this session active and mine?", and what it was asked. */
function supabase(rows: unknown[]) {
  const asked: { url: string; auth: string | null }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    asked.push({ url, auth: new Headers(init?.headers).get('authorization') });
    return new Response(JSON.stringify(rows), { status: 200 });
  }) as typeof globalThis.fetch;
  return { deps: { keys, fetch } satisfies AuthDeps, asked };
}


test('someone in the active session gets in, checked with their own token', async () => {
  const t = await token();
  const { deps, asked } = supabase([{ id: ROOM }]);
  assert.deepEqual(await authorize(t, ROOM, false, env, deps), { ok: true, userId: ANA });
  assert.equal(asked.length, 1);
  assert.match(asked[0].url, new RegExp(`cowork_sessions\\?id=eq\\.${ROOM}&status=eq\\.active`));
  assert.equal(asked[0].auth, `Bearer ${t}`);
});

test('someone not in it (or after it ended) is turned away', async () => {
  const { deps } = supabase([]);
  const verdict = await authorize(await token(), ROOM, false, env, deps);
  assert.equal(verdict.ok, false);
  assert.equal(!verdict.ok && verdict.status, 403);
});

test('no token, an expired one, or one from another project is refused', async () => {
  const { deps, asked } = supabase([{ id: ROOM }]);
  for (const t of ['', 'not-a-token', await token({ expires: '-1m' }), await token({ iss: 'https://other.supabase.co/auth/v1' }), await token({ aud: 'anon' })]) {
    const verdict = await authorize(t, ROOM, false, env, deps);
    assert.equal(verdict.ok, false, t);
    assert.equal(!verdict.ok && verdict.status, 401, t);
  }
  assert.equal(asked.length, 0, 'never asks Supabase about a bad token');
});

test('test sign-ins work only in test mode, and only from this computer', async () => {
  const { deps } = supabase([]);
  const fake = `test.${ANA}`;
  assert.equal((await authorize(fake, ROOM, true, env, deps)).ok, false, 'not without test mode');
  const testing = { ...env, AUTH_MODE: 'test' };
  assert.deepEqual(await authorize(fake, ROOM, true, testing, deps), { ok: true, userId: ANA });
  assert.equal((await authorize(fake, ROOM, false, testing, deps)).ok, false, 'never from outside');
  assert.equal((await authorize('test.nope', ROOM, true, testing, deps)).ok, false);
});

test('only a request from this computer counts as local', () => {
  const from = (ip?: string) => new Request('https://relay.thoughtdesk.org/', { headers: ip ? { 'CF-Connecting-IP': ip } : {} });
  assert.equal(isLocal(from('127.0.0.1')), true);
  assert.equal(isLocal(from('::1')), true);
  assert.equal(isLocal(from('203.0.113.7')), false);
  assert.equal(isLocal(from()), false);
});

test('the token comes from the subprotocols, only after "thoughtdesk"', () => {
  assert.equal(tokenFrom('thoughtdesk, eyJ.a.b'), 'eyJ.a.b');
  assert.equal(tokenFrom('thoughtdesk,eyJ.a.b'), 'eyJ.a.b');
  assert.equal(tokenFrom('thoughtdesk'), '');
  assert.equal(tokenFrom('other, eyJ.a.b'), '');
  assert.equal(tokenFrom(null), '');
});
