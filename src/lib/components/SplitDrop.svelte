<script lang="ts">
  /**
   * Drop targets over the page area while a page is dragged (from the
   * sidebar, the title bar or the side pane's header): the left opens it
   * here, the right beside, in split view. They also keep the drop out of
   * the editor, which would paste the page's name as text.
   */
  import Icon from './Icon.svelte';
  import PageIcon from './PageIcon.svelte';
  import { drag, endDrag } from './TreeItem.svelte';
  import { split } from '../split.svelte';
  import { store } from '../store.svelte';

  let { tiled, narrow }: { tiled: boolean; narrow: boolean } = $props();
  let over = $state<'main' | 'side' | null>(null);

  const page = $derived(drag.id ? store.byId.get(drag.id) : undefined);
  const mainLabel = $derived(drag.from === 'side' ? 'Move here' : 'Open here');
  const sideLabel = $derived(drag.from === 'main' || (drag.id && drag.id === store.currentId && store.view === 'page') ? 'Move to the side' : 'Open beside');

  function onover(e: DragEvent, target: 'main' | 'side') {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    over = target;
  }

  function ondrop(e: DragEvent, target: 'main' | 'side') {
    e.preventDefault();
    const { id, from } = drag;
    over = null;
    endDrag();
    if (id) split.drop(id, from, target);
  }
</script>

<!-- However a drag ends (dropped elsewhere, Esc), the targets go. -->
<svelte:window ondragend={() => drag.id && endDrag()} />

{#if page}
  <div class="drop" class:tiled>
    {#if drag.from !== 'main'}
      <div
        class="zone"
        class:over={over === 'main'}
        role="region"
        aria-label={mainLabel}
        ondragover={(e) => onover(e, 'main')}
        ondragleave={() => over === 'main' && (over = null)}
        ondrop={(e) => ondrop(e, 'main')}
      >
        <div class="label">
          <span class="ico"><Icon name="page" size={18} /></span>
          <strong>{mainLabel}</strong>
          <span class="what">{#if page.icon}<PageIcon icon={page.icon} />{/if} {page.title || 'Untitled'}</span>
        </div>
      </div>
    {:else}
      <div class="zone idle"></div>
    {/if}
    {#if !narrow}
      {#if drag.from !== 'side'}
        <div
          class="zone side"
          class:over={over === 'side'}
          style:width={tiled ? `${split.ratio * 100}%` : '50%'}
          role="region"
          aria-label={sideLabel}
          ondragover={(e) => onover(e, 'side')}
          ondragleave={() => over === 'side' && (over = null)}
          ondrop={(e) => ondrop(e, 'side')}
        >
          <div class="label">
            <span class="ico"><Icon name="split" size={18} /></span>
            <strong>{sideLabel}</strong>
            <span class="what">{#if page.icon}<PageIcon icon={page.icon} />{/if} {page.title || 'Untitled'}</span>
          </div>
        </div>
      {:else}
        <div class="zone side idle" style:width={tiled ? `${split.ratio * 100}%` : '50%'}></div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .drop {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    gap: 10px;
    padding: 10px;
    animation: appear 140ms var(--ease) both;
  }
  .drop.tiled {
    padding: 2px 10px 10px;
  }
  @keyframes appear {
    from {
      opacity: 0;
    }
  }
  .zone {
    flex: 1;
    min-width: 0;
    display: grid;
    place-items: center;
    border-radius: var(--r-lg);
    background: color-mix(in srgb, var(--bg) 55%, transparent);
    -webkit-backdrop-filter: blur(2px);
    backdrop-filter: blur(2px);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--text) 14%, transparent);
    transition:
      background-color var(--dur-fast) var(--ease),
      box-shadow var(--dur-fast) var(--ease);
  }
  .zone.side {
    flex: none;
  }
  .zone.idle {
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    pointer-events: none;
  }
  .zone.over {
    background: color-mix(in srgb, var(--accent) 10%, var(--bg));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
  }
  /* The label never takes the pointer, so moving over it doesn't flicker. */
  .label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 18px 22px;
    border-radius: var(--r-lg);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-pop);
    pointer-events: none;
    transition: transform var(--dur-fast) var(--ease);
  }
  .zone.over .label {
    transform: scale(1.04);
  }
  .ico {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--fill-2);
    color: var(--text-2);
  }
  .zone.over .ico {
    background: var(--accent);
    color: var(--on-accent);
  }
  strong {
    font-size: var(--fs-body-ui);
    font-weight: var(--fw-600, 600);
  }
  .what {
    max-width: 220px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: var(--fs-footnote);
    color: var(--text-3);
  }
</style>
