-- Row-level security tests for the accounts, friends and sessions schema
-- (supabase/migrations/*_accounts_friends_sessions.sql).
--
-- Run the whole file as one script against a database that has the
-- migration: the Supabase SQL editor, psql, or the Supabase MCP execute_sql
-- tool. It runs in one transaction that is rolled back at the end, so the
-- test users and rows never persist. A failed check raises 'FAIL: ...' and
-- stops the run; if every check passes, the last result says so.

begin;


-- Helpers (temporary functions; they disappear with the session) -------------

-- Raise unless `ok` is true.
create function pg_temp.ok(ok boolean, what text) returns void
language plpgsql as $$
begin
  if ok is not true then
    raise exception 'FAIL: %', what;
  end if;
end;
$$;

-- Run `stmt` and raise unless it fails with SQLSTATE `state` (and, if given,
-- with a message LIKE `message`).
create function pg_temp.fails(stmt text, state text, what text, message text default null) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate = state and (message is null or sqlerrm like message) then
      return;
    end if;
    raise exception 'FAIL: % (wanted %, got %: %)', what, state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % (the statement succeeded)', what;
end;
$$;

-- Run `stmt` and return how many rows it changed.
create function pg_temp.changed(stmt text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- The test users' ids.
create function pg_temp.uid(who text) returns uuid
language sql immutable as $$
  select case who
    when 'ana' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    when 'ben' then 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    when 'cat' then 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  end::uuid;
$$;

-- Session ids, handed from one user's block to the next.
create function pg_temp.sid(label text) returns uuid
language sql stable as $$
  select current_setting('rls_test.' || label)::uuid;
$$;


-- Setup: Ana, Ben and Cat sign up --------------------------------------------

insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'ana@example.test',
   '{"full_name": "Ana Lima", "avatar_url": "https://lh3.googleusercontent.com/a/ana"}', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'ben@example.test',
   '{"full_name": "  ", "name": "Ben Okafor", "picture": "http://example.test/ben.png"}', '{}'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'authenticated', 'authenticated', 'cat@example.test',
   '{"user_name": "catcodes", "avatar_url": "javascript:alert(1)", "picture": "https://avatars.githubusercontent.com/u/3"}', '{}');

do $$
begin
  perform pg_temp.ok(
    (select count(*) from public.profiles
     where id in (pg_temp.uid('ana'), pg_temp.uid('ben'), pg_temp.uid('cat'))) = 3,
    'the sign-up trigger made a profile for each user');
  perform pg_temp.ok(
    (select display_name = 'Ana Lima' and avatar_url = 'https://lh3.googleusercontent.com/a/ana' and username is null
     from public.profiles where id = pg_temp.uid('ana')),
    'Ana: full_name and a Google avatar_url are used; no username yet');
  perform pg_temp.ok(
    (select display_name = 'Ben Okafor' and avatar_url is null
     from public.profiles where id = pg_temp.uid('ben')),
    'Ben: a blank full_name falls through to name; an http picture is dropped');
  perform pg_temp.ok(
    (select display_name = 'catcodes' and avatar_url = 'https://avatars.githubusercontent.com/u/3'
     from public.profiles where id = pg_temp.uid('cat')),
    'Cat: user_name is used; a non-https avatar_url falls through to a GitHub picture');

  -- A picture on any other host is dropped: it would show its owner the IP
  -- addresses of everyone who sees the profile.
  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'authenticated', 'authenticated', 'fay@example.test',
          '{"full_name": "Fay", "avatar_url": "https://tracker.example.test/fay.png"}');
  perform pg_temp.ok(
    (select avatar_url is null from public.profiles where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'),
    'an avatar on an unknown host is dropped');
  delete from auth.users where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  perform pg_temp.fails($q$update public.profiles set avatar_url = 'https://tracker.example.test/x.png' where id = pg_temp.uid('ana')$q$,
    '23514', 'even the database owner cannot store an avatar on an unknown host');

  -- No names at all: the email before '@', cut to 50 characters.
  insert into auth.users (id, aud, role, email)
  values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'authenticated', 'authenticated',
          'dee.' || repeat('x', 60) || '@example.test');
  perform pg_temp.ok(
    (select display_name = left('dee.' || repeat('x', 60), 50) and avatar_url is null
     from public.profiles where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
    'without names, display_name is the email before @, cut to 50 characters');
  delete from auth.users where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  perform pg_temp.ok(
    not exists (select 1 from public.profiles where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
    'deleting an account deletes its profile');

  perform pg_temp.ok(
    (select bool_and(relrowsecurity) from pg_class
     where oid in ('public.profiles'::regclass, 'public.friendships'::regclass,
                   'public.presence'::regclass, 'public.cowork_sessions'::regclass)),
    'RLS is on for every table');

  -- Realtime sends a deleted row's key to everyone listening, so a
  -- friendship's key must not be the two people.
  perform pg_temp.ok(
    (select array_agg(a.attname::text) from pg_index i
     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
     where i.indrelid = 'public.friendships'::regclass and i.indisprimary) = array['id'],
    'a friendship''s key is an opaque id, not who it is between');
end;
$$;

-- Ana and Ben pick usernames (Cat picks hers further down). Ben and Cat have
-- been online before; Ana's presence row comes from touch_presence().
update public.profiles set username = 'ana' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.profiles set username = 'ben' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
insert into public.presence (user_id)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');


-- Ana: strangers stay hidden; find_profile matches exact usernames only ------

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

do $$
begin
  perform public.touch_presence();

  perform pg_temp.ok((select count(*) from public.profiles) = 1, 'Ana sees only her own profile');
  perform pg_temp.ok(not exists (select 1 from public.profiles where id = pg_temp.uid('ben')),
    'a stranger''s profile is invisible');
  perform pg_temp.ok((select count(*) from public.presence) = 1,
    'Ana sees only her own presence, which touch_presence() created');

  perform pg_temp.ok((select id from public.find_profile('ben')) = pg_temp.uid('ben'),
    'find_profile finds an exact username');
  perform pg_temp.ok((select id from public.find_profile(' @Ben ')) = pg_temp.uid('ben'),
    'find_profile ignores case, surrounding spaces and a leading @');
  perform pg_temp.ok((select display_name from public.find_profile('ben')) = 'Ben Okafor',
    'find_profile returns the display name');
  perform pg_temp.ok(not exists (select 1 from public.find_profile('be')), 'find_profile does not match a prefix');
  perform pg_temp.ok(not exists (select 1 from public.find_profile('b%')), 'find_profile does not match a pattern');
  perform pg_temp.ok(not exists (select 1 from public.find_profile('Ben Okafor')), 'find_profile does not match display names');
  perform pg_temp.ok(not exists (select 1 from public.find_profile('ana')), 'find_profile never returns yourself');
  perform pg_temp.ok(not exists (select 1 from public.profiles where id = pg_temp.uid('ben')),
    'finding Ben does not make his profile row visible');

  -- Her own profile, and only the editable columns.
  perform pg_temp.ok(
    pg_temp.changed($q$update public.profiles set display_name = 'Ana L.' where id = pg_temp.uid('ana')$q$) = 1,
    'Ana can edit her own profile');
  perform pg_temp.ok(
    pg_temp.changed($q$update public.profiles set display_name = 'Hacked' where id = pg_temp.uid('ben')$q$) = 0,
    'Ana cannot edit Ben''s profile');
  perform pg_temp.fails($q$update public.profiles set created_at = now() where id = pg_temp.uid('ana')$q$,
    '42501', 'created_at cannot be changed');
  perform pg_temp.fails($q$update public.profiles set username = 'Ana!' where id = pg_temp.uid('ana')$q$,
    '23514', 'usernames must match ^[a-z0-9_]{3,20}$');
  perform pg_temp.fails($q$update public.profiles set avatar_url = 'https://avatars.githubusercontent.com/u/1' where id = pg_temp.uid('ana')$q$,
    '42501', 'nobody sets their own avatar: only sign-up does');
  perform pg_temp.fails($q$insert into public.profiles (id) values (gen_random_uuid())$q$,
    '42501', 'profiles cannot be inserted directly');
  perform pg_temp.fails($q$delete from public.profiles where id = pg_temp.uid('ana')$q$,
    '42501', 'profiles cannot be deleted directly');
  perform pg_temp.fails($q$insert into public.presence (user_id) values (pg_temp.uid('ana'))$q$,
    '42501', 'presence is written only by touch_presence()');

  -- Internal functions are off limits.
  perform pg_temp.fails('select public.rls_auto_enable()', '42501', 'rls_auto_enable() cannot be called');
  perform pg_temp.fails('select public.handle_new_user()', '42501', 'handle_new_user() cannot be called');
  perform pg_temp.fails('select private.expire_stale_sessions()', '42501', 'the expiry sweep cannot be called');

  -- Friend requests: as yourself, pending, to someone who has a username.
  perform pg_temp.fails($q$insert into public.friendships (requester, addressee) values (pg_temp.uid('ben'), pg_temp.uid('ana'))$q$,
    '42501', 'Ana cannot send a request as Ben');
  perform pg_temp.fails($q$insert into public.friendships (requester, addressee, status) values (pg_temp.uid('ana'), pg_temp.uid('ben'), 'accepted')$q$,
    '42501', 'a request cannot start accepted');
  perform pg_temp.fails($q$insert into public.friendships (requester, addressee) values (pg_temp.uid('ana'), pg_temp.uid('cat'))$q$,
    '42501', 'a request needs the addressee to have a username');
  perform pg_temp.fails($q$insert into public.friendships (requester, addressee) values (pg_temp.uid('ana'), pg_temp.uid('ana'))$q$,
    '23514', 'no requests to yourself');
  perform pg_temp.fails($q$insert into public.friendships (requester, addressee, created_at) values (pg_temp.uid('ana'), pg_temp.uid('ben'), now())$q$,
    '42501', 'created_at cannot be set');

  insert into public.friendships (requester, addressee) values (pg_temp.uid('ana'), pg_temp.uid('ben'));
  perform pg_temp.ok((select status = 'pending' and accepted_at is null from public.friendships),
    'Ana''s request to Ben is pending');
  perform pg_temp.ok(exists (select 1 from public.profiles where id = pg_temp.uid('ben')),
    'once there is a request, Ana sees Ben''s profile');
  perform pg_temp.ok(not exists (select 1 from public.presence where user_id = pg_temp.uid('ben')),
    'a pending request does not share presence');
  perform pg_temp.fails($q$insert into public.cowork_sessions (host, guest, kind) values (pg_temp.uid('ana'), pg_temp.uid('ben'), 'invite')$q$,
    '42501', 'someone who hasn''t accepted yet cannot be invited');

  -- The requester can't accept, and can't change anything else.
  perform pg_temp.ok(pg_temp.changed($q$update public.friendships set status = 'accepted'$q$) = 0,
    'the requester cannot accept her own request');
  perform pg_temp.fails($q$update public.friendships set addressee = pg_temp.uid('cat')$q$,
    '42501', 'the requester cannot change the addressee');
  perform pg_temp.fails($q$update public.friendships set requester = pg_temp.uid('cat')$q$,
    '42501', 'the requester cannot change the requester');
  perform pg_temp.fails($q$update public.friendships set accepted_at = now()$q$,
    '42501', 'accepted_at cannot be set directly');
  perform pg_temp.fails($q$update public.friendships set created_at = now()$q$,
    '42501', 'created_at cannot be changed');
  perform pg_temp.ok((select status from public.friendships) = 'pending', 'the request is still pending');
end;
$$;


-- Ben: only the addressee accepts --------------------------------------------

select set_config('request.jwt.claims', json_build_object('sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'role', 'authenticated')::text, true);

do $$
begin
  perform public.touch_presence();

  perform pg_temp.ok(exists (select 1 from public.profiles where id = pg_temp.uid('ana')),
    'Ben sees the profile of the person asking him');
  perform pg_temp.ok(not exists (select 1 from public.profiles where id = pg_temp.uid('cat')),
    'Ben does not see Cat');
  perform pg_temp.ok(not exists (select 1 from public.presence where user_id = pg_temp.uid('ana')),
    'Ben does not see Ana''s presence while the request is pending');

  perform pg_temp.fails($q$insert into public.friendships (requester, addressee) values (pg_temp.uid('ben'), pg_temp.uid('ana'))$q$,
    '23505', 'one row per pair, whichever way it was sent');
  perform pg_temp.fails($q$update public.friendships set requester = pg_temp.uid('cat')$q$,
    '42501', 'the addressee cannot change other columns either');
  perform pg_temp.fails($q$update public.friendships set status = 'pending'$q$,
    '42501', 'the addressee can only set accepted');

  perform pg_temp.ok(
    pg_temp.changed($q$update public.friendships set status = 'accepted' where requester = pg_temp.uid('ana') and addressee = pg_temp.uid('ben')$q$) = 1,
    'the addressee accepts');
  perform pg_temp.ok((select accepted_at is not null from public.friendships where requester = pg_temp.uid('ana')),
    'the trigger set accepted_at');
  perform pg_temp.ok(exists (select 1 from public.presence where user_id = pg_temp.uid('ana')),
    'friends see each other''s presence');
  perform pg_temp.ok(
    public.are_friends(pg_temp.uid('ana'), pg_temp.uid('ben')) and public.are_friends(pg_temp.uid('ben'), pg_temp.uid('ana')),
    'are_friends is true both ways');
end;
$$;


-- Cat: a stranger to both of them --------------------------------------------

select set_config('request.jwt.claims', json_build_object('sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'role', 'authenticated')::text, true);

do $$
begin
  perform pg_temp.ok((select count(*) from public.profiles) = 1, 'Cat sees only her own profile');
  perform pg_temp.ok((select count(*) from public.friendships) = 0, 'Cat cannot see Ana and Ben''s friendship');
  perform pg_temp.ok((select count(*) from public.presence) = 1, 'Cat sees only her own presence');
  perform pg_temp.ok(not public.are_friends(pg_temp.uid('ana'), pg_temp.uid('ben')),
    'are_friends does not reveal other people''s friendships');
  perform pg_temp.ok(pg_temp.changed($q$update public.friendships set status = 'accepted'$q$) = 0,
    'Cat cannot change their friendship');
  perform pg_temp.ok(pg_temp.changed('delete from public.friendships') = 0,
    'Cat cannot remove their friendship');

  perform pg_temp.fails($q$update public.profiles set username = 'ana' where id = pg_temp.uid('cat')$q$,
    '23505', 'usernames are unique');
  perform pg_temp.ok(
    pg_temp.changed($q$update public.profiles set username = 'cat' where id = pg_temp.uid('cat')$q$) = 1,
    'Cat picks a username');
  perform pg_temp.ok((select id from public.find_profile('@ana')) = pg_temp.uid('ana'), 'Cat can look Ana up');
  perform pg_temp.ok(not exists (select 1 from public.profiles where id = pg_temp.uid('ana')),
    'but Ana''s profile row stays hidden from Cat');
end;
$$;


-- Ana invites Ben; nobody else can be invited --------------------------------

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

do $$
declare
  label text;
  new_id uuid;
begin
  perform pg_temp.ok(exists (select 1 from public.presence where user_id = pg_temp.uid('ben')),
    'Ana sees her friend Ben''s presence');
  perform pg_temp.ok(not exists (select 1 from public.presence where user_id = pg_temp.uid('cat')),
    'Ana does not see a stranger''s presence');

  perform pg_temp.fails($q$insert into public.cowork_sessions (host, guest, kind, title) values (pg_temp.uid('ana'), pg_temp.uid('cat'), 'invite', 'Plans')$q$,
    '42501', 'a non-friend cannot be invited');
  perform pg_temp.fails($q$insert into public.cowork_sessions (host, guest, kind, title) values (pg_temp.uid('ben'), pg_temp.uid('ana'), 'invite', 'Plans')$q$,
    '42501', 'Ana cannot invite on Ben''s behalf');
  perform pg_temp.fails($q$insert into public.cowork_sessions (host, guest, kind) values (pg_temp.uid('ana'), pg_temp.uid('ben'), 'request')$q$,
    '42501', 'a request must come from the guest');
  perform pg_temp.fails($q$insert into public.cowork_sessions (host, guest, kind, status) values (pg_temp.uid('ana'), pg_temp.uid('ben'), 'invite', 'active')$q$,
    '42501', 'a session cannot start active');
  perform pg_temp.fails($q$insert into public.cowork_sessions (host, guest, kind, created_at) values (pg_temp.uid('ana'), pg_temp.uid('ben'), 'invite', now() + interval '1 year')$q$,
    '42501', 'created_at cannot be set (it decides expiry)');

  -- Five invites to Ben, one for each path below.
  foreach label in array array['invite', 'cancel_me', 'decline_me', 'expire_me', 'after_unfriend'] loop
    insert into public.cowork_sessions (host, guest, kind, title)
    values (pg_temp.uid('ana'), pg_temp.uid('ben'), 'invite', 'Plans')
    returning id into new_id;
    perform set_config('rls_test.' || label, new_id::text, true);
  end loop;

  perform pg_temp.fails($q$select public.respond_session(pg_temp.sid('invite'), true)$q$,
    '42501', 'the host cannot accept her own invite', 'only the guest%');
  perform pg_temp.fails($q$update public.cowork_sessions set status = 'active'$q$,
    '42501', 'sessions cannot be updated directly');
  perform pg_temp.fails('delete from public.cowork_sessions',
    '42501', 'sessions cannot be deleted directly');
end;
$$;


-- Cat cannot see or touch their sessions -------------------------------------

select set_config('request.jwt.claims', json_build_object('sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'role', 'authenticated')::text, true);

do $$
begin
  perform pg_temp.ok((select count(*) from public.cowork_sessions) = 0, 'Cat cannot see Ana and Ben''s sessions');
  perform pg_temp.fails($q$select public.respond_session(pg_temp.sid('invite'), true)$q$,
    'P0002', 'Cat cannot answer their invite');
  perform pg_temp.fails($q$select public.end_session(pg_temp.sid('invite'))$q$,
    'P0002', 'Cat cannot end their session');
  perform pg_temp.fails($q$insert into public.cowork_sessions (host, guest, kind) values (pg_temp.uid('ana'), pg_temp.uid('cat'), 'request')$q$,
    '42501', 'Cat cannot ask to join a page of someone who isn''t her friend');
end;
$$;


-- Ben: only the guest answers an invite; end_session rules -------------------

select set_config('request.jwt.claims', json_build_object('sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'role', 'authenticated')::text, true);

do $$
declare
  s public.cowork_sessions;
  new_id uuid;
begin
  perform pg_temp.ok((select count(*) from public.cowork_sessions) = 5, 'Ben sees the five invites addressed to him');

  perform pg_temp.fails($q$select public.end_session(pg_temp.sid('invite'))$q$,
    '42501', 'the guest cannot cancel a pending invite (he declines it instead)');
  perform pg_temp.fails($q$select public.respond_session(pg_temp.sid('invite'), null)$q$,
    '22004', 'accept must be true or false');

  select * into s from public.respond_session(pg_temp.sid('invite'), true);
  perform pg_temp.ok(s.status = 'active' and s.title = 'Plans', 'the guest accepts the invite');
  perform pg_temp.fails($q$select public.respond_session(pg_temp.sid('invite'), false)$q$,
    'P0001', 'only a pending session can be answered', '%not pending');
  select * into s from public.end_session(pg_temp.sid('invite'));
  perform pg_temp.ok(s.status = 'ended', 'the guest can end an active session');
  perform pg_temp.fails($q$select public.end_session(pg_temp.sid('invite'))$q$,
    'P0001', 'an ended session cannot be ended again');

  select * into s from public.respond_session(pg_temp.sid('decline_me'), false);
  perform pg_temp.ok(s.status = 'declined', 'the guest declines an invite');
  perform pg_temp.fails($q$select public.end_session(pg_temp.sid('decline_me'))$q$,
    'P0001', 'a declined session cannot be ended');

  -- Ben asks to join two of Ana's pages.
  insert into public.cowork_sessions (host, guest, kind) values (pg_temp.uid('ana'), pg_temp.uid('ben'), 'request')
  returning id into new_id;
  perform set_config('rls_test.request', new_id::text, true);
  insert into public.cowork_sessions (host, guest, kind) values (pg_temp.uid('ana'), pg_temp.uid('ben'), 'request')
  returning id into new_id;
  perform set_config('rls_test.withdraw_me', new_id::text, true);

  perform pg_temp.fails($q$select public.respond_session(pg_temp.sid('request'), true, 'My page')$q$,
    '42501', 'the guest cannot accept his own request', 'only the host%');
  select * into s from public.end_session(pg_temp.sid('withdraw_me'));
  perform pg_temp.ok(s.status = 'cancelled', 'the guest withdraws his pending request');
end;
$$;


-- Ana: only the host answers a request, and only with a title -----------------

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

do $$
declare
  s public.cowork_sessions;
begin
  perform pg_temp.fails($q$select public.end_session(pg_temp.sid('request'))$q$,
    '42501', 'the host cannot cancel a pending request (she declines it instead)');
  perform pg_temp.fails($q$select public.respond_session(pg_temp.sid('request'), true)$q$,
    '22023', 'accepting a request needs a page title');
  perform pg_temp.fails($q$select public.respond_session(pg_temp.sid('request'), true, '   ')$q$,
    '22023', 'a blank page title is not enough');

  select * into s from public.respond_session(pg_temp.sid('request'), true, 'Garden notes');
  perform pg_temp.ok(s.status = 'active' and s.title = 'Garden notes',
    'the host accepts the request and page_title becomes the title');
  select * into s from public.end_session(pg_temp.sid('request'));
  perform pg_temp.ok(s.status = 'ended', 'the host can end an active session too');

  select * into s from public.end_session(pg_temp.sid('cancel_me'));
  perform pg_temp.ok(s.status = 'cancelled', 'the host cancels her pending invite');
  perform pg_temp.fails($q$select public.end_session(pg_temp.sid('withdraw_me'))$q$,
    'P0001', 'a cancelled session cannot be ended');
end;
$$;


-- Ben: stale invites, and unfriending -----------------------------------------

-- One invite has been waiting for two hours.
reset role;
update public.cowork_sessions set created_at = now() - interval '2 hours'
where id = current_setting('rls_test.expire_me')::uuid;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'role', 'authenticated')::text, true);

do $$
begin
  perform pg_temp.fails($q$select public.respond_session(pg_temp.sid('cancel_me'), true)$q$,
    'P0001', 'a cancelled invite cannot be accepted', '%not pending');
  perform pg_temp.fails($q$select public.respond_session(pg_temp.sid('expire_me'), true)$q$,
    'P0001', 'a pending session older than an hour cannot be answered', 'session expired');
  perform pg_temp.ok((select status from public.cowork_sessions where id = pg_temp.sid('expire_me')) = 'pending',
    'the failed call changed nothing (the sweep cancels it)');

  -- Either person can remove a friendship; a waiting invite then can't be accepted.
  perform pg_temp.ok(pg_temp.changed('delete from public.friendships') = 1, 'Ben removes Ana as a friend');
  perform pg_temp.fails($q$select public.respond_session(pg_temp.sid('after_unfriend'), true)$q$,
    '42501', 'an invite cannot be accepted once the two are no longer friends', 'you are not friends');
end;
$$;

-- The pg_cron sweep cancels pending sessions older than an hour.
reset role;

do $$
begin
  perform pg_temp.ok(private.expire_stale_sessions() = 1, 'the sweep cancels exactly the stale session');
  perform pg_temp.ok((select status from public.cowork_sessions where id = pg_temp.sid('expire_me')) = 'cancelled',
    'the stale invite is now cancelled');
  perform pg_temp.ok((select status from public.cowork_sessions where id = pg_temp.sid('after_unfriend')) = 'pending',
    'newer pending sessions are left alone');
end;
$$;


-- Ana after the unfriending ---------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

do $$
begin
  perform pg_temp.ok(not exists (select 1 from public.profiles where id = pg_temp.uid('ben')),
    'after unfriending, Ana no longer sees Ben''s profile');
  perform pg_temp.ok(not exists (select 1 from public.presence where user_id = pg_temp.uid('ben')),
    'nor his presence');
  perform pg_temp.ok(not public.are_friends(pg_temp.uid('ana'), pg_temp.uid('ben')), 'they are no longer friends');
  perform pg_temp.fails($q$insert into public.cowork_sessions (host, guest, kind) values (pg_temp.uid('ana'), pg_temp.uid('ben'), 'invite')$q$,
    '42501', 'an ex-friend cannot be invited');
  perform pg_temp.ok((select count(*) from public.cowork_sessions) = 7, 'Ana still sees her own past sessions');
end;
$$;


-- Avatars come from sign-up alone; requests and lookups have limits ---------

-- Twenty-one people with usernames for Ana to ask, Cat with a day's worth of
-- requests already sent, and Ben with an hour's worth of lookups done.
reset role;
insert into auth.users (id, aud, role, email)
select ('eeeeeeee-eeee-4eee-8eee-' || lpad(n::text, 12, '0'))::uuid, 'authenticated', 'authenticated', 'many' || n || '@example.test'
from generate_series(1, 21) n;
update public.profiles set username = 'many' || right(id::text, 2) where id::text like 'eeeeeeee-%';
insert into private.friend_requests_sent (requester) select pg_temp.uid('cat') from generate_series(1, 50);
insert into private.profile_lookups (user_id) select pg_temp.uid('ben') from generate_series(1, 100);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);

do $$
declare
  n int := 0;
begin
  perform pg_temp.ok((select count(*) from public.find_profile('many01')) = 1, 'under the limit, lookups work');

  -- Up to 20 requests may wait at once.
  while (select count(*) from public.friendships where requester = pg_temp.uid('ana') and status = 'pending') < 20 loop
    n := n + 1;
    insert into public.friendships (requester, addressee) values (pg_temp.uid('ana'), ('eeeeeeee-eeee-4eee-8eee-' || lpad(n::text, 12, '0'))::uuid);
  end loop;
  perform pg_temp.fails($q$insert into public.friendships (requester, addressee) values (pg_temp.uid('ana'), 'eeeeeeee-eeee-4eee-8eee-000000000021')$q$,
    'P0001', 'at most 20 friend requests wait at once', '%20 friend requests waiting%');
end;
$$;

select set_config('request.jwt.claims', json_build_object('sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'role', 'authenticated')::text, true);

do $$
begin
  perform pg_temp.fails($q$insert into public.friendships (requester, addressee) values (pg_temp.uid('cat'), 'eeeeeeee-eeee-4eee-8eee-000000000021')$q$,
    'P0001', 'at most 50 friend requests a day, cancelled ones included', '%a lot of friend requests%');
end;
$$;

select set_config('request.jwt.claims', json_build_object('sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'role', 'authenticated')::text, true);

do $$
begin
  perform pg_temp.fails($q$select * from public.find_profile('many01')$q$,
    'P0001', 'at most 100 lookups an hour', 'Too many lookups%');
end;
$$;

reset role;


-- Signed out: nothing at all --------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

do $$
begin
  perform pg_temp.fails('select 1 from public.profiles', '42501', 'anon cannot read profiles');
  perform pg_temp.fails('select 1 from public.friendships', '42501', 'anon cannot read friendships');
  perform pg_temp.fails('select 1 from public.presence', '42501', 'anon cannot read presence');
  perform pg_temp.fails('select 1 from public.cowork_sessions', '42501', 'anon cannot read sessions');
  perform pg_temp.fails($q$insert into public.friendships (requester, addressee) values (pg_temp.uid('ana'), pg_temp.uid('ben'))$q$,
    '42501', 'anon cannot send friend requests');
  perform pg_temp.fails($q$select * from public.find_profile('ana')$q$, '42501', 'anon cannot call find_profile');
  perform pg_temp.fails($q$select public.are_friends(pg_temp.uid('ana'), pg_temp.uid('ben'))$q$,
    '42501', 'anon cannot call are_friends');
  perform pg_temp.fails('select public.touch_presence()', '42501', 'anon cannot call touch_presence');
  perform pg_temp.fails($q$select public.respond_session(pg_temp.sid('after_unfriend'), true)$q$,
    '42501', 'anon cannot call respond_session');
  perform pg_temp.fails($q$select public.end_session(pg_temp.sid('after_unfriend'))$q$,
    '42501', 'anon cannot call end_session');
  perform pg_temp.fails('select public.rls_auto_enable()', '42501', 'anon cannot call rls_auto_enable');
end;
$$;


reset role;
select 'All RLS tests passed' as result;

rollback;
