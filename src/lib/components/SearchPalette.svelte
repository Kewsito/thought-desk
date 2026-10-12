<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';
  import { api } from '../api';
  import { store } from '../store.svelte';
  import { ui } from '../ui.svelte';
  import { relativeTime } from '../time';
  import type { SearchHit } from '../types';

  let input: HTMLInputElement;
  let list = $state<HTMLDivElement>();
  let query = $state('');
  let hits = $state<SearchHit[]>([]);
  let selected = $state(0);
  let seq = 0;

  const showCreate = $derived(query.trim().length > 0);
  const total = $derived(hits.length + (showCreate ? 1 : 0));

  onMount(() => {
    input.focus();
    void run('');
  });

  async function run(q: string) {
    const mine = ++seq;
    try {
      const result = await api.search(q, 40);
      if (mine !== seq) return;
      hits = result;
      selected = 0;
    } catch (e) {
      ui.error(e);
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(() => run(query), 60);
  }

  function close() {
    ui.searchOpen = false;
  }

  function choose(i: number) {
    if (i < hits.length) {
      store.open(hits[i].id);
      close();
    } else if (showCreate) {
      const title = query.trim();
      close();
      void store.create(null, { title });
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault();
      selected = total ? (selected + 1) % total : 0;
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault();
      selected = total ? (selected - 1 + total) % total : 0;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(selected);
    }
  }

  $effect(() => {
    const i = selected;
    list?.querySelector(`[data-index="${i}"]`)?.scrollIntoView({ block: 'nearest' });
  });

  /** Splits an FTS snippet into plain and highlighted runs. */
  function parts(snippet: string): { text: string; hit: boolean }[] {
    const out: { text: string; hit: boolean }[] = [];
    for (const piece of snippet.split('\u0001')) {
      const [hit, rest] = piece.includes('\u0002') ? piece.split('\u0002') : [null, piece];
      if (hit !== null) out.push({ text: hit, hit: true });
      if (rest) out.push({ text: rest, hit: false });
    }
    return out;
  }

  function pathOf(id: string) {
    return store
      .ancestors(id)
      .map((a) => a.title || 'Untitled')
      .join(' / ');
  }
</script>

<Modal onclose={close} width={640} top="16vh" label="Search" glass>
  <div class="search">
    <Icon name="search" size={20} stroke={2} />
    <input
      bind:this={input}
      bind:value={query}
      oninput={onInput}
      onkeydown={onKey}
      placeholder="Search pages"
      spellcheck="false"
      autocomplete="off"
    />
  </div>
  {#if hits.length || showCreate || query.trim()}
    <div class="results" bind:this={list}>
      {#if !query.trim() && hits.length}
        <div class="group">Recently edited</div>
      {/if}
      {#each hits as hit, i (hit.id)}
        {@const path = pathOf(hit.id)}
        <button
          class="hit"
          class:selected={i === selected}
          data-index={i}
          onmousemove={() => (selected = i)}
          onclick={() => choose(i)}
        >
          <span class="hit-icon">{#if hit.icon}<span class="emoji">{hit.icon}</span>{:else}<Icon name="page" size={18} />{/if}</span>
          <span class="hit-main">
            <span class="hit-line">
              <span class="hit-title">{hit.title || 'Untitled'}</span>
              {#if path}<span class="hit-path">{path}</span>{/if}
            </span>
            {#if hit.snippet}
              <span class="hit-snippet">
                {#each parts(hit.snippet) as p}{#if p.hit}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}
              </span>
            {/if}
          </span>
          <span class="hit-time">{relativeTime(hit.updatedAt)}</span>
        </button>
      {/each}
      {#if showCreate}
        <button
          class="hit create"
          class:selected={selected === hits.length}
          data-index={hits.length}
          onmousemove={() => (selected = hits.length)}
          onclick={() => choose(hits.length)}
        >
          <span class="hit-icon"><Icon name="page-plus" size={18} /></span>
          <span class="hit-main"><span class="hit-line"><span class="hit-title">Create “{query.trim()}”</span></span></span>
          <span class="hit-time">New page</span>
        </button>
      {/if}
      {#if query.trim() && hits.length === 0}
        <div class="none">No pages match “{query.trim()}”</div>
      {/if}
    </div>
    <div class="foot">
      <span class="hint"><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
      <span class="hint"><kbd>Enter</kbd> Open</span>
      <span class="hint"><kbd>Esc</kbd> Close</span>
    </div>
  {/if}
</Modal>

<style>
  .search {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 58px;
    padding: 0 20px;
    flex: none;
    color: var(--text-3);
  }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: none;
    background: transparent;
    font-size: 19px;
    font-weight: 400;
    letter-spacing: -0.014em;
    color: var(--text);
  }
  input::placeholder {
    color: var(--text-3);
  }
  .results {
    overflow-y: auto;
    padding: 6px;
    box-shadow: inset 0 1px 0 var(--hairline);
  }
  .group {
    padding: 8px 12px 6px;
    font-size: var(--fs-caption);
    font-weight: var(--fw-600);
    letter-spacing: 0.01em;
    color: var(--text-3);
  }
  .hit {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 48px;
    padding: 7px 14px 7px 10px;
    border-radius: var(--r-md);
    text-align: left;
  }
  .hit.selected {
    background: var(--fill-2);
  }
  .hit-icon {
    flex: none;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    color: var(--text-2);
  }
  .emoji {
    font-size: 19px;
    line-height: 1;
  }
  .hit-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .hit-line {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .hit-title {
    flex: none;
    max-width: 70%;
    font-size: var(--fs-callout);
    font-weight: var(--fw-550);
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hit-path {
    min-width: 0;
    font-size: var(--fs-footnote);
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hit-snippet {
    font-size: var(--fs-ui);
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  mark {
    background: none;
    color: var(--text);
    font-weight: var(--fw-650);
  }
  .hit-time {
    flex: none;
    font-size: var(--fs-footnote);
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .none {
    padding: 28px 16px 30px;
    text-align: center;
    color: var(--text-3);
    font-size: var(--fs-body-ui);
  }
  .foot {
    flex: none;
    display: flex;
    gap: 18px;
    height: 38px;
    align-items: center;
    padding: 0 18px;
    box-shadow: inset 0 1px 0 var(--hairline);
    font-size: var(--fs-footnote);
    color: var(--text-3);
  }
  .hint {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .hint kbd + kbd {
    margin-left: -3px;
  }
</style>
