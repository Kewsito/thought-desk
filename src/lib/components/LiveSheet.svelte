<script lang="ts">
  import Modal from './Modal.svelte';
  import { cowork } from '../cowork.svelte';
  import { store } from '../store.svelte';
  import { ui } from '../ui.svelte';

  let { pageId }: { pageId: string } = $props();

  const page = $derived(store.byId.get(pageId));
  const row = $derived(cowork.liveFor(pageId));
  const session = $derived(cowork.sessions[pageId]);
  const close = () => (ui.liveSheet = null);

  async function end() {
    // Read before closing: the panel's values go with it.
    const room = row?.id;
    if (!room) return close();
    const ok = await ui.confirm({
      title: 'End this session?',
      message: `You stop writing together. You and ${row ? cowork.otherName(row) : 'your friend'} both keep the page as it is now.`,
      confirmLabel: 'End Session',
    });
    if (!ok) return;
    close();
    await cowork.end(room).catch((e) => ui.error(e));
  }
</script>

<Modal onclose={close} width={420} label="Live session">
  <div class="live">
    <h2>{row ? `Writing with ${cowork.otherName(row)}` : 'Live session'}</h2>
    <p class="lead">“{page?.title || 'Untitled'}” is the only page you share. When either of you ends the session, you both keep the page.</p>

    <h3>Here now</h3>
    {#if session}
      <ul class="people" aria-label="Here now">
        {#each session.people as p (p.id)}
          <li><span class="dot" style:background={p.color}></span>{p.name}{p.me ? ' (you)' : ''}</li>
        {/each}
      </ul>
      <p class="state" class:offline={session.status === 'offline'}>
        {session.status === 'live'
          ? 'Connected.'
          : session.status === 'offline'
            ? "Offline: your changes are kept and go through when you're back."
            : session.status === 'paused'
              ? 'Paused: nobody has written here for a while. It reconnects as soon as you type or click in the page, and anything written meanwhile comes in then.'
              : 'Connecting…'}
      </p>
    {/if}

    <div class="actions">
      <button class="btn danger-text" onclick={end}>End Session</button>
      <button class="btn primary" onclick={close}>Done</button>
    </div>
  </div>
</Modal>

<style>
  .live {
    padding: 24px;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 18px;
    font-weight: var(--fw-600);
  }
  h3 {
    margin: 18px 0 6px;
    font-size: var(--fs-caption);
    font-weight: var(--fw-600);
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .lead {
    margin: 0;
    color: var(--text-2);
    line-height: 1.5;
  }
  .people {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 4px;
  }
  .people li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .state {
    margin: 10px 0 0;
    font-size: var(--fs-caption);
    color: var(--text-3);
  }
  .state.offline {
    color: var(--c-orange);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 22px;
  }
  .actions .danger-text {
    margin-right: auto;
    color: var(--c-red);
  }
</style>
