<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { ui, type MenuItem, type MenuState } from '../ui.svelte';

  let { menu }: { menu: MenuState } = $props();

  let el: HTMLDivElement;
  // Positioned after the first render, once the menu's size is known.
  let pos = $state({ left: -9999, top: -9999 });
  let selected = $state(-1);

  type Action = Extract<MenuItem, { action: () => void }>;
  const actionable = $derived(
    menu.items.map((it, i) => ('action' in it && !it.disabled ? i : -1)).filter((i) => i >= 0),
  );

  onMount(() => {
    void tick().then(() => {
      // Keep the menu fully on screen.
      const r = el.getBoundingClientRect();
      let left = menu.alignRight ? menu.x - r.width : menu.x;
      let top = menu.y;
      if (left + r.width > window.innerWidth - 8) left = window.innerWidth - r.width - 8;
      if (top + r.height > window.innerHeight - 8) {
        // Flip above the anchor if it fits there, otherwise slide up just enough.
        const above = menu.y - r.height - 36;
        top = above >= 8 ? above : window.innerHeight - r.height - 8;
      }
      pos = { left: Math.max(8, left), top: Math.max(8, top) };
    });

    const onDown = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) ui.closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        ui.closeMenu();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopImmediatePropagation();
        const n = actionable.length;
        if (!n) return;
        const at = actionable.indexOf(selected);
        const next = e.key === 'ArrowDown' ? (at + 1) % n : (at - 1 + n) % n;
        selected = actionable[at === -1 && e.key === 'ArrowUp' ? n - 1 : next];
      } else if (e.key === 'Enter' && selected >= 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        run(menu.items[selected] as Action);
      }
    };
    const close = () => ui.closeMenu();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  });

  function run(item: Action) {
    if (item.disabled) return;
    ui.closeMenu();
    item.action();
  }
</script>

<div class="menu popover" bind:this={el} style:left="{pos.left}px" style:top="{pos.top}px" role="menu">
  {#each menu.items as item, i}
    {#if 'separator' in item}
      <div class="sep"></div>
    {:else if 'header' in item}
      <div class="header">{item.header}</div>
    {:else}
      <button
        class="item"
        class:danger={item.danger}
        class:selected={i === selected}
        disabled={item.disabled}
        role="menuitem"
        onmousedown={(e) => e.preventDefault()}
        onmousemove={() => (selected = i)}
        onclick={() => run(item)}
      >
        {#if item.icon}<Icon name={item.icon} size={16} />{/if}
        <span class="label">{item.label}</span>
        {#if item.hint}<span class="hint">{item.hint}</span>{/if}
        {#if item.checked}<Icon name="check" size={15} stroke={2.2} />{/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 90;
    min-width: 220px;
    max-width: 320px;
    max-height: calc(100vh - 16px);
    overflow-y: auto;
    padding: 4px;
    animation: pop 90ms ease-out;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
  }
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 30px;
    padding: 0 10px;
    border-radius: 5px;
    font-size: 13.5px;
    color: var(--text);
    text-align: left;
  }
  .item :global(svg) {
    color: var(--text-2);
  }
  .item.selected:not(:disabled) {
    background: var(--hover);
  }
  .item:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hint {
    font-size: 12px;
    color: var(--text-3);
  }
  .danger.selected .label,
  .danger.selected :global(svg) {
    font-weight: 600;
    color: var(--text);
  }
  .sep {
    height: 1px;
    margin: 4px 6px;
    background: var(--border);
  }
  .header {
    padding: 6px 10px 4px;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--text-3);
  }
</style>
