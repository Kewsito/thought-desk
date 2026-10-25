<script lang="ts">
  import Avatar from './Avatar.svelte';
  import Modal from './Modal.svelte';
  import { account } from '../account.svelte';
  import { cowork } from '../cowork.svelte';
  import { friends, nameOf } from '../friends.svelte';
  import { inviteFriend } from '../live-actions';
  import { prefs } from '../prefs.svelte';
  import { store } from '../store.svelte';
  import { ui } from '../ui.svelte';

  let { pageId }: { pageId: string } = $props();

  const page = $derived(store.byId.get(pageId));
  const close = () => (ui.inviteSheet = null);
  /** Someone's already invited to this page (waiting for them). */
  const waiting = $derived(cowork.outgoing.find((r) => prefs.coworkPages[r.id] === pageId));
</script>

<Modal onclose={close} width={420} label="Invite a friend" closeButton>
  <div class="invite">
    <h2>Write “{page?.title || 'Untitled'}” together</h2>
    <p class="lead">Your friend gets an invite; when they join, this page opens in a new tab for both of you and you write together. Only this page is shared, and you both keep it afterwards.</p>

    {#if !account.signedIn || account.needsUsername}
      <button
        class="btn primary wide"
        onclick={() => {
          close();
          ui.accountSheet = true;
        }}>{account.signedIn ? 'Pick a Username First' : 'Sign In First'}</button
      >
    {:else if waiting}
      <p class="note">Waiting for {cowork.otherName(waiting)} to join.</p>
      <button class="btn" onclick={() => void cowork.withdraw(waiting).catch((e) => ui.error(e))}>Withdraw Invite</button>
    {:else if !friends.accepted.length}
      <p class="note">Add a friend first, with + next to Friends in the sidebar.</p>
    {:else}
      <ul class="people" aria-label="Friends">
        {#each friends.accepted as f (f.profile.id)}
          <li>
            <span class="who">
              <span class="avatar-wrap">
                <Avatar name={nameOf(f)} url={f.profile.avatarUrl} seed={f.profile.id} size={28} />
                {#if f.online}<span class="online" aria-label="Online"></span>{/if}
              </span>
              <span>
                <span class="name">{nameOf(f)}</span>
                <span class="sub">@{f.profile.username}{f.online ? ' · here now' : ''}</span>
              </span>
            </span>
            <button
              class="btn small raised"
              aria-label="Invite {nameOf(f)}"
              onclick={() => {
                inviteFriend(f, pageId);
                close();
              }}>Invite</button
            >
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</Modal>

<style>
  .invite {
    padding: 24px;
  }
  h2 {
    margin: 0 0 8px;
    /* Clear of the close button. */
    padding-right: 28px;
    font-size: 18px;
    font-weight: var(--fw-600);
  }
  .lead {
    margin: 0 0 16px;
    color: var(--text-2);
    line-height: 1.5;
  }
  .note {
    margin: 0 0 12px;
    color: var(--text-2);
  }
  .wide {
    width: 100%;
    justify-content: center;
  }
  .people {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 4px;
    max-height: 50vh;
    overflow-y: auto;
  }
  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 4px;
    border-radius: var(--r-sm);
  }
  li:hover {
    background: var(--fill);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .avatar-wrap {
    position: relative;
    display: inline-flex;
  }
  .online {
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--c-green);
    box-shadow: 0 0 0 2px var(--bg);
  }
  .name {
    display: block;
    font-weight: var(--fw-550);
  }
  .sub {
    display: block;
    font-size: var(--fs-caption);
    color: var(--text-3);
  }
</style>
