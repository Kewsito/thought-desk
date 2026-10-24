# Supabase

Thought Desk keeps notes on the device. Supabase (project `thought-desk-europe`, ref `nbzojbfkkpeisitbkwpg`) holds only what friends and live co-editing need: profiles, friendships, presence and session invites. Clerk signs people in, and Supabase trusts the session tokens it issues (Third-Party Auth, see [SETUP.md](SETUP.md)); Supabase Auth itself isn't used. The Cloudflare relay carries the live edits. It checks that someone may join a session by reading `cowork_sessions` with that person's own token, so row-level security decides.

- `migrations/`: the schema, one file per change.
- `tests/rls.sql`: row-level security tests.

## Who's asking

Every policy and function asks `private.me()`, never `auth.uid()`. Clerk's user ids look like `user_2abc…`, not UUIDs, and `auth.uid()` casts the token's `sub` to a UUID. `private.me()` returns the `sub` of the request's token, but only if one of our Clerk instances issued it (`iss` is the development instance, `https://smiling-sunbird-3571.clerk.accounts.dev`, or production, `https://clerk.thoughtdesk.org`) and its session is fully signed in (`sts` isn't `pending`). Anything else, a token from Supabase Auth included, gets null, which these rules treat as signed out. The user id columns are `text`.

## Tables

| Table | What it's for |
|---|---|
| `profiles` | One row per account, keyed by the Clerk user id, made by `ensure_profile()` when the app signs in. `username` is null until picked, then unique and `^[a-z0-9_]{3,20}$`. `display_name` (up to 50 characters) starts as the name Clerk has, or empty. `avatar_url` is the picture Clerk has, only from `https://img.clerk.com/`, and only `ensure_profile()` sets it. You see your own profile and the profile of anyone you share a friend request or friendship with. You edit only your own. |
| `friendships` | A friend request from `requester` to `addressee`. `status` goes from `pending` to `accepted` when the addressee says yes, and a trigger fills in `accepted_at`. There is one row per pair, whichever way the request went. Declining, withdrawing and unfriending all delete the row, which either person can do. A request goes out as yourself, pending, to someone who has a username. |
| `presence` | When each person was last seen (`seen_at`). You see your own and your accepted friends'. Only `touch_presence()` writes it. |
| `cowork_sessions` | A live co-editing session on one of the host's pages. `kind` is `invite` (the host asks the guest in) or `request` (the guest asks to join). Only the host and the guest see it. It starts `pending`, between friends, created by the host of an invite or the guest of a request. After that it changes only through `respond_session()` and `end_session()`: `pending` becomes `active`, `declined` or `cancelled`, and `active` becomes `ended`. |

### What the app writes directly

Signed-in users can write only these columns. Everything else comes from defaults, triggers or the functions below.

| Table | Insert | Update | Delete |
|---|---|---|---|
| `profiles` | none | `username`, `display_name` (own row) | none |
| `friendships` | `requester`, `addressee`, `status` | `status`, by the addressee, to `accepted` | either person |
| `presence` | none | none | none |
| `cowork_sessions` | `id`, `host`, `guest`, `kind`, `title`, `status` | none | none |

Signed-out callers (`anon`) can't read or write any of these tables, or call any of the functions.

## Functions

| Call | What it does |
|---|---|
| `ensure_profile()` | Makes your profile if it isn't there yet, and returns it. The name and picture come from your Clerk token, never from the caller: the name only when the profile is made (you may change it), the picture every time (Clerk's, if you have one: `has_image`). The app calls it after signing in. |
| `find_profile(name)` | Finds someone by their exact username. Case, surrounding spaces and one leading `@` don't matter. Returns `id, username, display_name, avatar_url`, and never returns you. At most 100 lookups an hour per person. |
| `are_friends(a, b)` | True when `a` and `b` are accepted friends. It answers only for pairs that include you; for anyone else's pair it says false. |
| `touch_presence()` | Sets your `seen_at` to now. Call it every so often while the app is open. |
| `respond_session(session_id, accept, page_title)` | Accepts or declines a pending session. The guest answers an invite and the host answers a request. Accepting a request needs `page_title`, which becomes the session's `title`, and accepting either kind needs the two to still be friends. Returns the updated row. |
| `end_session(session_id)` | Either person ends an `active` session (`ended`). Whoever sent a `pending` one cancels it (`cancelled`). Returns the updated row. |

`respond_session` and `end_session` raise these errors:

| SQLSTATE | Message |
|---|---|
| `P0002` | `session not found` (it doesn't exist, or you aren't in it) |
| `42501` | `only the guest can respond to an invite`, `only the host can respond to a request`, `only whoever sent it can cancel a pending session`, `you are not friends` |
| `P0001` | `session is <status>, not pending`, `session expired`, `session is already <status>` |
| `22023` | `accepting a request needs a page title` |
| `22004` | `accept must be true or false` |

### Expiry

A pending session expires after an hour. `respond_session` refuses a stale one with `session expired`. A `pg_cron` job, `expire-pending-cowork-sessions`, runs every five minutes and marks stale pending sessions `cancelled`, so both people's apps see them go even if nobody answers. A second job keeps a day of that job's run history.

### Realtime

`friendships` and `cowork_sessions` are in the `supabase_realtime` publication. Inserts and updates reach only the people in the row. Deletes don't: Realtime can't check RLS for a row that is gone, so a DELETE on `friendships` goes to every signed-in subscriber of that table, carrying the row's primary key. That key is an opaque `id` (migration `friendships_opaque_key`), so it says nothing about who; `tests/rls.sql` checks that it stays that way. The app listens only for inserts and updates, and refreshes its lists every minute, which is when a decline or an unfriending shows up on the other side.

## Apply migrations

All five migrations in `migrations/` are applied to `thought-desk-europe`: `accounts_friends_sessions` (the schema), `friendships_opaque_key` (an opaque key for friendships, see [Realtime](#realtime)), `harden_avatars_requests_lookups` (avatars set by sign-up alone, from known picture hosts; at most 20 friend requests waiting and 50 sent a day; at most 100 username lookups an hour), `limit_logs_primary_keys` (keys for the two logs those limits keep) and `accounts_on_clerk` (accounts move to Clerk: the tables rebuilt with Clerk's text ids, `private.me()` and `ensure_profile()` in place of `auth.uid()` and the sign-up trigger, with the same rules and limits). To change the schema, add a new migration; never edit one that has been applied.

With the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
npx supabase init                     # once: adds supabase/config.toml, keeps migrations/
npx supabase link --project-ref nbzojbfkkpeisitbkwpg
npx supabase migration new add_something
# write the SQL in the new supabase/migrations/<timestamp>_add_something.sql
npx supabase db push
```

With the Supabase MCP connector: run `apply_migration` with the file's SQL and the name after the timestamp. Then check `list_migrations` and name the file after the version it reports, so the CLI sees the migration as applied.

Types for the app can be generated with `npx supabase gen types typescript --project-id nbzojbfkkpeisitbkwpg`.

## Run the RLS tests

`tests/rls.sql` is one plain SQL script. It signs in three test users (Ana, Ben and Cat) the way Clerk would (`request.jwt.claims` holds a Clerk token's claims), acts as each of them, as tokens Clerk didn't issue and as a signed-out caller, and checks what each can see and do. Every check raises `FAIL: …` when it fails, which stops the run. If they all pass, the last result is `All RLS tests passed`. The script runs in a single transaction that it rolls back, so the test users and rows never stay in the database.

Run it as `postgres` (it writes test rows directly and switches roles), in any of these ways:

- **SQL editor** in the dashboard: paste the whole file and run it. The editor may warn that the query has destructive operations; that's the test's own updates and deletes, which are rolled back.
- **psql**, with the connection string from the dashboard's **Connect** button:

  ```bash
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
  ```

- **Supabase MCP connector**: `execute_sql` with the file's contents.

It isn't a pgTAP file, so `supabase test db` won't run it.

## Security advisor

The performance advisor flags only indexes no query has used yet. The security advisor flags five functions with *Signed-In Users Can Execute SECURITY DEFINER Function* (lint 0029), and the two logs the limits keep for having no policies (on purpose: only the functions use them). The five are the RPCs the app calls, and each needs to bypass RLS on purpose:

- `ensure_profile` makes the caller's own profile, which nobody can insert directly, from the caller's token alone.
- `find_profile` has to find a stranger whose profile RLS hides. It returns four columns for one exact username, never the caller, and nothing when signed out.
- `touch_presence` writes `presence`, which has no write policies so nobody can set their own `seen_at`. It writes only the caller's row, with the server's time.
- `respond_session` and `end_session` are the only way a session changes, since `cowork_sessions` has no update policy. They check who may make each change.

The policy helpers `private.is_connected` and `private.has_username` are security definer too, but the API doesn't expose the `private` schema, so they can't be called as RPCs; nor can `private.me()`. The logs the limits keep, `private.friend_requests_sent` and `private.profile_lookups`, are read and written only by those functions. `are_friends` is security invoker, so the friendships policy keeps it to the caller's own pairs.

## Deleting an account

On request (the privacy policy says how): delete the user in the Clerk dashboard, then run `delete from public.profiles where id = 'user_…';` in the SQL editor, which takes their friendships, presence and sessions with it. `tests/rls.sql` checks that it does.

## Known limits

- **Realtime deletes on `friendships` reach every listener**, carrying only the opaque `id` key (see [Realtime](#realtime)): they reveal that some friendship ended, not whose.
- **Unfriending doesn't end sessions.** It stops new invites and requests, and a pending one can no longer be accepted, but an active session runs until someone ends it.
- **Clerk's development instance is trusted alongside production** until the release. Remove it then, from Third-Party Auth and from `private.me()` with a new migration (see [SETUP.md](SETUP.md)): anyone can sign up there with Clerk's test addresses, which need no real email.
- **`service_role` can't read or write these tables.** This project's default privileges don't give `service_role` select, insert, update or delete on new tables, and the migration doesn't add them, because nothing needs them: the app and the relay use each user's own token. If a server ever needs the service key here, grant it explicitly in a new migration.
