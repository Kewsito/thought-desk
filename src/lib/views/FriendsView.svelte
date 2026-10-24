<script lang="ts">
  import Avatar from '../components/Avatar.svelte';
  import Icon from '../components/Icon.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import { account } from '../account.svelte';
  import { cowork } from '../cowork.svelte';
  import { friends, nameOf } from '../friends.svelte';
  import { choosePage, writeWithMenu } from '../live-actions';
  import { ui, type MenuItem } from '../ui.svelte';
  import type { Friend, LiveSession } from '../cloud';

  const ready = $derived(account.signedIn && !account.needsUsername);
  const here = $derived(friends.accepted.filter((f) => f.online).length);
  const waiting = $derived(friends.incoming.length + cowork.incoming.length);

  const summary = $derived.by(() => {
    if (!account.signedIn) return 'Add friends and write pages together';
    if (!ready) return 'Pick a username so friends can add you';
    const n = friends.accepted.length;
    if (!n) return `You're @${account.profile?.username}`;
    return `${n} friend${n === 1 ? '' : 's'}${here ? ` · ${here} here now` : ''} · you're @${account.profile?.username}`;
  });

  async function addFriend() {
    const answer = await ui.prompt({
      title: 'Add a friend',
      message: "Type their username. You're friends once they accept.",
      placeholder: '@username',
      confirmLabel: 'Send Request',
      icon: 'user',
    });
    if (!answer) return;
    const name = answer.value.trim().replace(/^@/, '').toLowerCase();
    try {
      const done = await friends.add(name);
      ui.toast(done === 'accepted' ? `You're now friends with @${name}` : `Friend request sent to @${name}`);
    } catch (e) {
      // Usually a typo or someone who isn't there: say so, it's not a fault.
      ui.toast(e instanceof Error ? e.message : String(e));
    }
  }

  function accept(f: Friend) {
    friends.accept(f.profile.id).then(
      () => ui.toast(`You're now friends with ${nameOf(f)}`),
      (e) => ui.error(e),
    );
  }

  /** Declines their request, or cancels yours. */
  function drop(f: Friend) {
    friends.remove(f.profile.id).catch((e) => ui.error(e));
  }

  const join = (row: LiveSession) => cowork.join(row).catch((e) => ui.error(e));
  const decline = (row: LiveSession) => cowork.decline(row).catch((e) => ui.error(e));
  const withdraw = (row: LiveSession) => cowork.withdraw(row).catch((e) => ui.error(e));

  function menu(e: MouseEvent, f: Friend) {
    e.preventDefault();
    e.stopPropagation();
    const items: MenuItem[] = [
      {
        label: 'Remove Friend',
        icon: 'trash',
        danger: true,
        action: async () => {
          const ok = await ui.confirm({
            title: `Remove ${nameOf(f)}?`,
            message: "You won't be friends any more. They aren't told, and you can add each other again later.",
            confirmLabel: 'Remove',
            danger: true,
          });
          if (!ok) return;
          // Writing together ends with the friendship.
          for (const row of cowork.rows) if (row.status === 'active' && cowork.other(row)?.profile.id === f.profile.id) await cowork.end(row.id);
          drop(f);
        },
      },
    ];
    if (e.type === 'contextmenu') ui.openMenu({ x: e.clientX, y: e.clientY, items });
    else ui.openMenuAt(e.currentTarget as Element, items, { alignRight: true });
  }
</script>

<div class="view friends-view">
  <header class="view-head">
    <div>
      <h1 class="view-title">Friends</h1>
      <p class="view-sub">{summary}</p>
    </div>
    {#if ready}
      <div class="view-actions">
        <button class="btn primary" onclick={addFriend}><Icon name="plus" size={15} stroke={2.2} /> Add a Friend</button>
      </div>
    {/if}
  </header>

  {#if !account.ready}
    <!-- Reading the sign-in state. -->
  {:else if !account.signedIn}
    <EmptyState icon="users" title="Write with your friends" text="Sign in to add friends by their @username, see who's here, and write a page together, live. Your notes stay on this computer.">
      <button class="btn primary" onclick={() => (ui.accountSheet = true)}>Sign In…</button>
    </EmptyState>
  {:else if account.needsUsername}
    <EmptyState icon="users" title="Pick a username" text="Friends add you by your @username.">
      <button class="btn primary" onclick={() => (ui.accountSheet = true)}>Pick a Username…</button>
    </EmptyState>
  {:else}
    {#if waiting}
      <h2 class="group-title">Waiting for you</h2>
      <div class="group" role="list" aria-label="Waiting for you">
        {#each cowork.incoming as row (row.id)}
          {@const who = cowork.other(row)}
          {@const name = cowork.otherName(row)}
          <div class="group-row person" role="listitem">
            <Avatar {name} url={who?.profile.avatarUrl} seed={who?.profile.id ?? row.id} size={32} />
            <span class="who">
              <span class="name">{name}</span>
              <span class="meta">{row.kind === 'invite' ? `Invites you to write “${row.title || 'Untitled'}” together` : 'Wants to write together'}</span>
            </span>
            {#if row.kind === 'invite'}
              <button class="btn small primary" onclick={() => join(row)} aria-label="Join {name}">Join</button>
            {:else}
              <button class="btn small primary" onclick={(e) => choosePage(row, e.currentTarget as Element)} aria-label="Choose a page for {name}">Choose a Page…</button>
            {/if}
            <button class="btn small raised" onclick={() => decline(row)} aria-label="Decline {name}">Decline</button>
          </div>
        {/each}
        <!-- Someone not yet a friend shows initials, never a picture: loading
             one would tell its server you're here. -->
        {#each friends.incoming as f (f.profile.id)}
          <div class="group-row person" role="listitem">
            <Avatar name={nameOf(f)} seed={f.profile.id} size={32} />
            <span class="who">
              <span class="name">{nameOf(f)}</span>
              <span class="meta">@{f.profile.username} wants to be friends</span>
            </span>
            <button class="btn small primary" onclick={() => accept(f)} aria-label="Accept {nameOf(f)}">Accept</button>
            <button class="btn small raised" onclick={() => drop(f)} aria-label="Decline {nameOf(f)}">Decline</button>
          </div>
        {/each}
      </div>
    {/if}

    {#if friends.accepted.length}
      <h2 class="group-title">Friends</h2>
      <div class="group" role="list" aria-label="Friends">
        {#each friends.accepted as f (f.profile.id)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="group-row person" role="listitem" oncontextmenu={(e) => menu(e, f)}>
            <span class="avatar">
              <Avatar name={nameOf(f)} url={f.profile.avatarUrl} seed={f.profile.id} size={32} />
              {#if f.online}<span class="online" aria-label="Online"></span>{/if}
            </span>
            <span class="who">
              <span class="name">{nameOf(f)}</span>
              <span class="meta">@{f.profile.username}{#if f.online}{' · '}<span class="here">Here now</span>{/if}</span>
            </span>
            <button class="btn small raised" onclick={(e) => writeWithMenu(f, e.currentTarget as Element)} aria-label="Write with {nameOf(f)}">
              <Icon name="page" size={14} /> Write Together…
            </button>
            <button class="icon-btn" onclick={(e) => menu(e, f)} aria-label="More for {nameOf(f)}" data-tip="More"><Icon name="more" size={15} /></button>
          </div>
        {/each}
      </div>
    {/if}

    {#if friends.outgoing.length || cowork.outgoing.length}
      <h2 class="group-title">Waiting for them</h2>
      <div class="group" role="list" aria-label="Waiting for them">
        {#each cowork.outgoing as row (row.id)}
          {@const who = cowork.other(row)}
          {@const name = cowork.otherName(row)}
          <div class="group-row person" role="listitem">
            <Avatar {name} url={who?.profile.avatarUrl} seed={who?.profile.id ?? row.id} size={32} />
            <span class="who">
              <span class="name">{name}</span>
              <span class="meta">{row.kind === 'invite' ? `Invited to write “${row.title || 'Untitled'}”` : 'Asked to write together'}</span>
            </span>
            <button class="btn small raised" onclick={() => withdraw(row)} aria-label="Withdraw invite to {name}">Withdraw</button>
          </div>
        {/each}
        {#each friends.outgoing as f (f.profile.id)}
          <div class="group-row person" role="listitem">
            <Avatar name={nameOf(f)} seed={f.profile.id} size={32} />
            <span class="who">
              <span class="name">{nameOf(f)}</span>
              <span class="meta">Asked · waiting for @{f.profile.username} to accept</span>
            </span>
            <button class="btn small raised" onclick={() => drop(f)} aria-label="Cancel request to {nameOf(f)}">Cancel Request</button>
          </div>
        {/each}
      </div>
    {/if}

    {#if friends.loaded && !friends.list.length && !cowork.incoming.length}
      <EmptyState icon="users" title="No friends yet" text="Add someone by their @username. You're friends once they accept, and then you can write pages together.">
        <button class="btn primary" onclick={addFriend}><Icon name="plus" size={15} stroke={2.2} /> Add a Friend</button>
      </EmptyState>
    {/if}
  {/if}
</div>

<style>
  .person {
    justify-content: flex-start;
    gap: 12px;
    padding: 8px 12px 8px 16px;
  }
  .avatar {
    position: relative;
    flex: none;
    display: inline-flex;
  }
  .online {
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c-green);
    box-shadow: 0 0 0 2px var(--bg-grouped);
  }
  .who {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    font-size: var(--fs-body-ui);
    line-height: 20px;
    font-weight: var(--fw-500);
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    font-size: var(--fs-footnote);
    line-height: 16px;
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .here {
    color: var(--c-green);
    font-weight: var(--fw-500);
  }
</style>
