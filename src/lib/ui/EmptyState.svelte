<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../components/Icon.svelte';

  let {
    icon,
    title,
    text,
    compact = false,
    children,
  }: { icon: string; title: string; text?: string; compact?: boolean; children?: Snippet } = $props();
</script>

<div class="empty" class:compact>
  <span class="badge"><Icon name={icon} size={compact ? 18 : 22} /></span>
  <strong>{title}</strong>
  {#if text}<span class="text">{text}</span>{/if}
  {#if children}<div class="actions">{@render children()}</div>{/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 36px 24px 40px;
    text-align: center;
    font-size: var(--fs-ui);
    color: var(--text-3);
  }
  .empty.compact {
    padding: 20px 16px 24px;
  }
  .badge {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    margin-bottom: 10px;
    border-radius: var(--r-lg);
    background: var(--fill);
    color: var(--tint);
  }
  .compact .badge {
    width: 36px;
    height: 36px;
    margin-bottom: 6px;
    border-radius: var(--r-md);
  }
  strong {
    font-size: var(--fs-callout);
    font-weight: var(--fw-600);
    color: var(--text);
  }
  .text {
    max-width: 300px;
    line-height: 1.45;
    text-wrap: balance;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 14px;
  }
</style>
