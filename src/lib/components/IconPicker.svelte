<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { ALL_EMOJI, EMOJI_GROUPS, randomEmoji } from '../emoji';
  import { ui, type IconPickerState } from '../ui.svelte';
  import Icon from './Icon.svelte';
  import { fadeOut, pop } from '../motion';

  let { picker }: { picker: IconPickerState } = $props();

  let el: HTMLDivElement;
  let input: HTMLInputElement;
  let query = $state('');
  // Positioned after the first render, once the picker's size is known.
  let pos = $state({ left: -9999, top: -9999 });

  const results = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return ALL_EMOJI.filter((e) => e.keywords.includes(q) || e.emoji === q);
  });

  onMount(() => {
    input.focus();
    void tick().then(() => {
      const r = el.getBoundingClientRect();
      let { x: left, y: top } = picker;
      if (left + r.width > window.innerWidth - 8) left = window.innerWidth - r.width - 8;
      if (top + r.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - r.height - 8);
      pos = { left: Math.max(8, left), top };
    });
    const onDown = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      }
    };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  });

  function close() {
    ui.iconPicker = null;
  }

  function pick(emoji: string) {
    picker.onPick(emoji);
    close();
  }
</script>

<div class="picker popover" bind:this={el} style:left="{pos.left}px" style:top="{pos.top}px" in:pop|global out:fadeOut|global>
  <div class="bar">
    <label class="field">
      <Icon name="search" size={14} stroke={2} />
      <input
        bind:this={input}
        bind:value={query}
        placeholder="Search emoji"
        spellcheck="false"
        onkeydown={(e) => {
          if (e.key === 'Enter' && results?.length) pick(results[0].emoji);
        }}
      />
    </label>
    <button class="text-btn" onclick={() => pick(randomEmoji())}>Random</button>
    {#if picker.onRemove}
      <button
        class="text-btn"
        onclick={() => {
          picker.onRemove?.();
          close();
        }}>Remove</button
      >
    {/if}
  </div>
  <div class="grid-wrap">
    {#if results}
      <div class="grid">
        {#each results as e (e.emoji)}
          <button class="em" onclick={() => pick(e.emoji)}>{e.emoji}</button>
        {:else}
          <p class="none">No emoji found</p>
        {/each}
      </div>
    {:else}
      {#each EMOJI_GROUPS as g (g.name)}
        <div class="group">{g.name}</div>
        <div class="grid">
          {#each g.items as e (e.emoji)}
            <button class="em" onclick={() => pick(e.emoji)}>{e.emoji}</button>
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .picker {
    position: fixed;
    z-index: 95;
    width: 352px;
    display: flex;
    flex-direction: column;
    max-height: 380px;
    transform-origin: top left;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 12px 12px 8px;
  }
  .field {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--h-md);
    padding: 0 10px;
    border-radius: var(--r-sm);
    background: var(--fill-2);
    color: var(--text-3);
  }
  .field input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    font-size: var(--fs-ui);
  }
  .text-btn {
    height: var(--h-md);
    padding: 0 10px;
    border-radius: var(--r-sm);
    font-size: var(--fs-ui);
    font-weight: var(--fw-500);
    color: var(--text-2);
    transition:
      background-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }
  .text-btn:hover {
    background: var(--fill);
    color: var(--text);
  }
  .grid-wrap {
    overflow-y: auto;
    padding: 0 8px 12px;
  }
  .group {
    padding: 12px 4px 4px;
    font-size: var(--fs-caption);
    font-weight: var(--fw-600);
    letter-spacing: 0.01em;
    color: var(--text-3);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    gap: 2px;
  }
  .em {
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    font-size: 21px;
    line-height: 1;
    border-radius: var(--r-sm);
    transition:
      background-color var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease);
  }
  .em:hover {
    background: var(--fill-2);
  }
  .em:active {
    transform: scale(0.9);
  }
  .none {
    grid-column: 1 / -1;
    margin: 18px 0;
    text-align: center;
    color: var(--text-3);
    font-size: var(--fs-ui);
  }
</style>
