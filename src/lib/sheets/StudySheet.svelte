<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import { cards } from '../cards.svelte';
  import { clock } from '../clock.svelte';
  import { GRADES, gapLabel, schedule, type Grade } from '../srs';
  import { store } from '../store.svelte';
  import { ui } from '../ui.svelte';
  import type { Card } from '../types';

  let { title, deck }: { title: string; deck: Card[] } = $props();

  // svelte-ignore state_referenced_locally (the session's cards are fixed when it starts)
  let queue = $state<Card[]>([...deck]);
  // svelte-ignore state_referenced_locally
  const total = deck.length;
  let flipped = $state(false);
  let busy = $state(false);
  /** Cards answered Good or Easy (done for this session). */
  let learned = $state(0);
  let again = $state(0);

  const card = $derived(queue[0]);
  const source = $derived(card ? store.byId.get(card.pageId) : undefined);
  /** Days each answer would schedule, for the button captions. */
  const gaps = $derived(card ? GRADES.map((g) => schedule(card.review, g.grade, clock.today).interval) : []);

  const close = () => (ui.study = null);

  async function answer(grade: Grade) {
    if (!card || !flipped || busy) return;
    busy = true;
    const current = card;
    const review = await cards.answer(current, grade);
    queue = queue.slice(1);
    if (grade === 1) {
      // Forgotten: see it again a few cards later.
      again++;
      const at = Math.min(queue.length, 3);
      queue.splice(at, 0, { ...current, review });
    } else learned++;
    flipped = false;
    busy = false;
  }

  function onKey(e: KeyboardEvent) {
    if (!card || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === ' ' || e.key === 'Enter') && !flipped) {
      e.preventDefault();
      flipped = true;
    } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      void answer(Number(e.key) as Grade);
    } else if (flipped && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      void answer(3);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<Modal onclose={close} width={600} label="Study {title}">
  <header class="modal-head">
    <h2>{title}</h2>
    {#if card}<span class="progress-text">{learned} of {total}</span>{/if}
    <button class="icon-btn" onclick={close} aria-label="Close"><Icon name="x" /></button>
  </header>
  <div class="bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={learned}>
    <span style:width="{(learned / Math.max(1, total)) * 100}%"></span>
  </div>

  <div class="modal-body">
    {#if card}
      {#key `${card.pageId}:${card.id}:${queue.length}`}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="face" class:flipped onclick={() => (flipped = true)}>
          <div class="eyebrow side">{card.review ? 'Review' : 'New'}</div>
          <p class="front">{card.front}</p>
          {#if flipped}
            <div class="divider"></div>
            <p class="back">{card.back || '(No answer written)'}</p>
          {/if}
          {#if source}
            <button
              class="source"
              onclick={(e) => {
                e.stopPropagation();
                close();
                store.open(source.id);
              }}
            >
              {#if source.icon}<span>{source.icon}</span>{:else}<Icon name="page" size={12} />{/if}
              {source.title || 'Untitled'}
            </button>
          {/if}
        </div>
      {/key}
    {:else}
      <div class="done">
        <span class="done-icon"><Icon name="check-circle" size={28} /></span>
        <h3>Session complete</h3>
        <p>
          {total} card{total === 1 ? '' : 's'} studied{#if again}, {again} needed another look{/if}.
          {cards.dueCount ? `${cards.dueCount} more due today.` : 'Nothing else is due today.'}
        </p>
      </div>
    {/if}
  </div>

  <footer class="modal-foot">
    {#if !card}
      <span></span>
      <div class="actions"><button class="btn small primary" onclick={close}>Done</button></div>
    {:else if !flipped}
      <span>Space to show the answer</span>
      <div class="actions"><button class="btn small primary" onclick={() => (flipped = true)}>Show Answer</button></div>
    {:else}
      <span>How well did you know it?</span>
      <div class="grades">
        {#each GRADES as g, i (g.grade)}
          <button class="grade g{g.grade}" onclick={() => answer(g.grade)} data-tip-key={g.key} disabled={busy}>
            <span class="g-label">{g.label}</span>
            <span class="g-gap">{gapLabel(gaps[i])}</span>
          </button>
        {/each}
      </div>
    {/if}
  </footer>
</Modal>

<style>
  .progress-text {
    margin-left: auto;
    font-size: var(--fs-footnote);
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .bar {
    height: 2px;
    margin: 0 24px;
    border-radius: 1px;
    background: var(--fill);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width var(--dur-slow) var(--ease);
  }
  .face {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 260px;
    padding: 32px 24px 20px;
    border-radius: var(--r-lg);
    background: var(--bg-grouped);
    text-align: center;
    cursor: default;
    animation: rise var(--dur) var(--ease);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  .side {
    margin-bottom: 12px;
  }
  .front {
    margin: 0;
    font-size: 24px;
    line-height: 32px;
    font-weight: var(--fw-650);
    letter-spacing: -0.016em;
    overflow-wrap: anywhere;
  }
  .divider {
    width: 48px;
    height: 1px;
    margin: 20px 0;
    background: var(--hairline);
  }
  .back {
    margin: 0;
    font-size: 17px;
    line-height: 26px;
    color: var(--text);
    overflow-wrap: anywhere;
    animation: rise var(--dur) var(--ease);
  }
  .source {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: var(--h-xs);
    margin-top: 24px;
    padding: 0 8px;
    border-radius: var(--r-xs);
    font-size: var(--fs-footnote);
    color: var(--text-3);
    transition:
      background-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }
  .source:hover {
    background: var(--fill);
    color: var(--text);
  }
  .grades {
    display: flex;
    gap: 6px;
  }
  .grade {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 44px;
    border-radius: var(--r-sm);
    background: var(--fill);
    transition: background-color var(--dur-fast) var(--ease);
  }
  .grade:hover {
    background: var(--fill-2);
  }
  .g-label {
    color: var(--text);
    font-size: var(--fs-ui);
    line-height: 16px;
    font-weight: var(--fw-600);
  }
  .g-gap {
    font-size: 11px;
    line-height: 16px;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .g1 .g-label {
    color: var(--danger);
  }
  .g3 {
    background: var(--accent);
  }
  .g3:hover {
    background: color-mix(in srgb, var(--accent) 88%, var(--text));
  }
  .g3 .g-label,
  .g3 .g-gap {
    color: var(--on-accent);
  }
  .g3 .g-gap {
    opacity: 0.75;
  }
  .done {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 40px 24px 32px;
    text-align: center;
  }
  .done-icon {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--c-green) 14%, transparent);
    color: var(--c-green);
  }
  .done h3 {
    margin: 16px 0 4px;
    font-size: 17px;
    line-height: 24px;
    font-weight: var(--fw-650);
  }
  .done p {
    margin: 0;
    max-width: 360px;
    font-size: var(--fs-callout);
    line-height: 20px;
    color: var(--text-2);
  }
</style>
