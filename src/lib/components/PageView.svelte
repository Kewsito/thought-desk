<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import Editor from '../editor/Editor.svelte';
  import { randomEmoji } from '../emoji';
  import { store } from '../store.svelte';
  import { ui } from '../ui.svelte';
  import type { Page } from '../types';

  let { page, onstats }: { page: Page; onstats?: (words: number) => void } = $props();

  // Live metadata (title/icon/width) comes from the store, content from `page`.
  const meta = $derived(store.byId.get(page.id));
  let titleEl: HTMLHeadingElement;
  let editor = $state<{ focusStart(): void; focusEnd(): void }>();

  onMount(() => {
    titleEl.textContent = page.title;
  });

  // Focus the title when a page is created or "Rename" is chosen.
  $effect(() => {
    if (ui.focusTitle !== page.id) return;
    ui.focusTitle = null;
    void tick().then(() => {
      titleEl?.focus();
      const sel = window.getSelection();
      sel?.selectAllChildren(titleEl);
      if (!titleEl.textContent) sel?.collapseToEnd();
    });
  });

  function onTitleInput() {
    // Chromium leaves a <br> behind when everything is deleted.
    if (titleEl.textContent === '' && titleEl.innerHTML !== '') titleEl.innerHTML = '';
    store.update(page.id, { title: (titleEl.textContent ?? '').replace(/\s+/g, ' ') });
  }

  function onTitleKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      editor?.focusStart();
      return;
    }
    if (e.key === 'ArrowDown') {
      const sel = window.getSelection();
      const atEnd = sel?.isCollapsed && sel.focusOffset === (sel.focusNode?.textContent?.length ?? 0);
      if (atEnd || !titleEl.textContent) {
        e.preventDefault();
        editor?.focusStart();
      }
    }
  }

  function pickIcon(e: MouseEvent) {
    ui.pickIcon(
      e.currentTarget as Element,
      (emoji) => store.update(page.id, { icon: emoji }, { immediate: true }),
      () => store.update(page.id, { icon: '' }, { immediate: true }),
    );
  }

  // Clicking the empty area under the content puts the caret at the end.
  function onTailClick() {
    editor?.focusEnd();
  }
</script>

<article class="page" class:full={meta?.fullWidth}>
  <div class="head" class:has-icon={!!meta?.icon}>
    {#if meta?.icon}
      <button class="page-icon" onclick={pickIcon} data-tip="Change icon">{meta.icon}</button>
    {:else}
      <div class="head-tools">
        <button class="tool" onclick={() => store.update(page.id, { icon: randomEmoji() }, { immediate: true })}>
          <Icon name="smile" size={15} />
          Add icon
        </button>
      </div>
    {/if}
    <!-- svelte-ignore a11y_missing_content (filled imperatively to keep the caret stable) -->
    <h1
      class="title"
      bind:this={titleEl}
      contenteditable="plaintext-only"
      spellcheck="false"
      data-placeholder="Untitled"
      oninput={onTitleInput}
      onkeydown={onTitleKey}
    ></h1>
  </div>

  <Editor bind:this={editor} {page} {onstats} />

  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="tail" onclick={onTailClick}></div>
</article>

<style>
  .page {
    width: 100%;
    max-width: calc(var(--page-width) + 2 * var(--page-pad));
    margin: 0 auto;
    padding: 0 var(--page-pad);
  }
  .page.full {
    max-width: none;
  }
  .head {
    position: relative;
    padding-top: 88px;
  }
  .head.has-icon {
    padding-top: 56px;
  }
  .page-icon {
    display: grid;
    place-items: center;
    width: 80px;
    height: 80px;
    margin: 0 0 14px -8px;
    font-size: 60px;
    line-height: 1;
    border-radius: var(--r-lg);
    transition:
      background-color var(--dur-fast) var(--ease),
      transform var(--dur) var(--ease-out);
  }
  .page-icon:hover {
    background: var(--fill);
  }
  .page-icon:active {
    transform: scale(0.96);
  }
  /* "Add icon" floats in the space above the title, so it never shifts it. */
  .head-tools {
    position: absolute;
    top: 46px;
    left: -10px;
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity var(--dur) var(--ease);
  }
  .head:hover .head-tools,
  .head-tools:focus-within {
    opacity: 1;
  }
  .tool {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px 0 8px;
    border-radius: var(--r-sm);
    font-size: var(--fs-ui);
    font-weight: var(--fw-500);
    color: var(--text-3);
    transition:
      background-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }
  .tool:hover {
    background: var(--fill);
    color: var(--text-2);
  }
  .title {
    margin: 0 0 10px;
    font-family: var(--font-page);
    font-size: 40px;
    font-weight: var(--fw-700);
    line-height: 1.15;
    letter-spacing: -0.03em;
    color: var(--text);
    overflow-wrap: break-word;
    text-wrap: balance;
    outline: none;
    cursor: text;
  }
  :global(:root[data-font="serif"]) .title {
    letter-spacing: -0.015em;
  }
  :global(:root[data-font="mono"]) .title {
    font-size: 34px;
    letter-spacing: -0.02em;
  }
  :global(:root.small-text) .title {
    font-size: 34px;
  }
  .title:empty::before {
    content: attr(data-placeholder);
    color: var(--text-4);
  }
  .tail {
    min-height: 35vh;
    cursor: text;
  }
</style>
