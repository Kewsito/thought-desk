<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { PALETTE } from '../colors';

  let {
    value,
    onchange,
    keys,
    auto,
    label = 'Color',
  }: {
    value: string;
    onchange: (key: string) => void;
    /** Limit to these keys (accent colours); defaults to the label palette. */
    keys?: { key: string; label: string }[];
    /** Offer an "automatic" swatch (e.g. "Use course color") with this label. */
    auto?: string;
    label?: string;
  } = $props();

  const list = $derived(keys ?? PALETTE);
</script>

<div class="swatches" role="radiogroup" aria-label={label}>
  {#if auto}
    <button class="sw auto round" class:on={value === ''} role="radio" aria-checked={value === ''} aria-label={auto} data-tip={auto} onclick={() => onchange('')}>
      <Icon name="sparkle" size={12} stroke={2.2} />
    </button>
  {/if}
  {#each list as c (c.key)}
    <button
      class="sw round"
      class:on={value === c.key}
      style:--sw={c.key === 'graphite' ? 'var(--ink)' : `var(--c-${c.key})`}
      role="radio"
      aria-checked={value === c.key}
      aria-label={c.label}
      data-tip={c.label}
      onclick={() => onchange(c.key)}
    ></button>
  {/each}
</div>

<style>
  .swatches {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sw {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--h-xs);
    height: var(--h-xs);
    border-radius: 50%;
    background: var(--sw);
    box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);
    transition: transform var(--dur-fast) var(--ease);
  }
  .sw:hover {
    transform: scale(1.08);
  }
  .sw:active {
    transform: scale(0.94);
  }
  /* The selected swatch gets a ring with a gap, like macOS. */
  .sw.on::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--sw);
  }
  .auto {
    --sw: var(--fill-2);
    color: var(--text-2);
    box-shadow: none;
  }
  .auto.on::after {
    box-shadow: 0 0 0 2px var(--text-3);
  }
</style>
