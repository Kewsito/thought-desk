<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import type { MenuEntry, SuggestionState } from './suggestion.svelte';

  let { ctl }: { ctl: SuggestionState } = $props();

  let el = $state<HTMLDivElement>();
  let height = $state(0);

  // Place below the caret, or above it when there isn't room.
  const pos = $derived.by(() => {
    const r = ctl.rect;
    if (!r) return { left: -9999, top: -9999 };
    const width = 300;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const below = r.bottom + 6;
    const top = below + height > window.innerHeight - 8 && r.top - height - 6 > 8 ? r.top - height - 6 : below;
    return { left, top };
  });

  // Keep the selected row in view while navigating with the keyboard.
  $effect(() => {
    const i = ctl.selected;
    el?.querySelector(`[data-index="${i}"]`)?.scrollIntoView({ block: 'nearest' });
  });

  function groupStart(items: MenuEntry[], i: number) {
    return items[i].group && items[i].group !== items[i - 1]?.group ? items[i].group : null;
  }
</script>

<div
  class="suggest popover"
  bind:this={el}
  bind:clientHeight={height}
  style:left="{pos.left}px"
  style:top="{pos.top}px"
  role="listbox"
>
  {#if ctl.items.length === 0}
    <div class="empty">{ctl.empty}</div>
  {:else}
    {#each ctl.items as item, i (item.id)}
      {@const header = groupStart(ctl.items, i)}
      {#if header}<div class="group">{header}</div>{/if}
      <button
        class="row"
        class:selected={i === ctl.selected}
        data-index={i}
        role="option"
        aria-selected={i === ctl.selected}
        onmousedown={(e) => e.preventDefault()}
        onmousemove={() => (ctl.selected = i)}
        onclick={() => ctl.pick(i)}
      >
        <span class="glyph">
          {#if item.emoji}{item.emoji}{:else if item.label}<span class="label">{item.label}</span>{:else if item.icon}<Icon name={item.icon} size={18} />{/if}
        </span>
        <span class="text">
          <span class="title">{item.title}</span>
          {#if item.description}<span class="desc">{item.description}</span>{/if}
        </span>
        {#if item.hint}<kbd>{item.hint}</kbd>{/if}
      </button>
    {/each}
  {/if}
</div>

<style>
  .suggest {
    position: fixed;
    z-index: 60;
    width: 300px;
    max-height: min(360px, 50vh);
    overflow-y: auto;
    padding: 4px;
  }
  .group {
    padding: 8px 8px 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-3);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 5px 8px;
    border-radius: 6px;
    text-align: left;
  }
  .row.selected {
    background: var(--hover);
  }
  .glyph {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    font-size: 18px;
  }
  .label {
    font-size: 13px;
    font-weight: 650;
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .title {
    font-size: 14px;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .desc {
    font-size: 12px;
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  kbd {
    flex: none;
  }
  .empty {
    padding: 10px 12px;
    font-size: 13px;
    color: var(--text-3);
  }
</style>
