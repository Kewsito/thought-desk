<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { ALL_EMOJI, EMOJI_GROUPS, randomEmoji } from '../emoji';
  import { ui, type IconPickerState } from '../ui.svelte';

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

<div class="picker popover" bind:this={el} style:left="{pos.left}px" style:top="{pos.top}px">
  <div class="bar">
    <input
      bind:this={input}
      bind:value={query}
      placeholder="Filter…"
      spellcheck="false"
      onkeydown={(e) => {
        if (e.key === 'Enter' && results?.length) pick(results[0].emoji);
      }}
    />
    <button class="btn" onclick={() => pick(randomEmoji())}>Random</button>
    {#if picker.onRemove}
      <button
        class="btn"
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
          <button class="em" title={e.keywords} onclick={() => pick(e.emoji)}>{e.emoji}</button>
        {:else}
          <p class="none">No emoji found</p>
        {/each}
      </div>
    {:else}
      {#each EMOJI_GROUPS as g (g.name)}
        <div class="group">{g.name}</div>
        <div class="grid">
          {#each g.items as e (e.emoji)}
            <button class="em" title={e.keywords} onclick={() => pick(e.emoji)}>{e.emoji}</button>
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
  }
  .bar {
    display: flex;
    gap: 6px;
    padding: 8px;
    border-bottom: 1px solid var(--border);
  }
  .bar input {
    flex: 1;
    min-width: 0;
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    font-size: 13px;
  }
  .grid-wrap {
    overflow-y: auto;
    padding: 4px 8px 10px;
  }
  .group {
    padding: 8px 2px 4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text-3);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 1px;
  }
  .em {
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    font-size: 20px;
    border-radius: 5px;
  }
  .em:hover {
    background: var(--hover);
  }
  .none {
    grid-column: 1 / -1;
    text-align: center;
    color: var(--text-3);
    font-size: 13px;
  }
</style>
