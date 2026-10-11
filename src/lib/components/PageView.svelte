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
  <div class="head">
    {#if meta?.icon}
      <button class="page-icon" onclick={pickIcon} title="Change icon">{meta.icon}</button>
    {/if}
    <div class="head-tools">
      {#if !meta?.icon}
        <button class="tool" onclick={() => store.update(page.id, { icon: randomEmoji() }, { immediate: true })}>
          <Icon name="smile" size={15} /> Add icon
        </button>
      {/if}
    </div>
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
    --page-width: 720px;
    width: 100%;
    max-width: calc(var(--page-width) + 2 * var(--page-pad));
    margin: 0 auto;
    padding: 0 var(--page-pad);
  }
  .page.full {
    max-width: none;
  }
  .head {
    padding-top: 64px;
    position: relative;
  }
  .page-icon {
    display: block;
    font-size: 64px;
    line-height: 1.1;
    padding: 4px;
    margin: 0 0 4px -6px;
    border-radius: 8px;
  }
  .page-icon:hover {
    background: var(--hover);
  }
  .head-tools {
    display: flex;
    gap: 4px;
    height: 30px;
    margin-left: -8px;
    opacity: 0;
    transition: opacity 120ms;
  }
  .head:hover .head-tools {
    opacity: 1;
  }
  .tool {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 13.5px;
    color: var(--text-3);
  }
  .tool:hover {
    background: var(--hover);
    color: var(--text-2);
  }
  .title {
    margin: 4px 0 12px;
    font-size: 2.5em;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: -0.02em;
    outline: none;
    word-break: break-word;
    color: var(--text);
    cursor: text;
  }
  .title:empty::before {
    content: attr(data-placeholder);
    color: var(--text-4);
  }
  .tail {
    min-height: 30vh;
    cursor: text;
  }
</style>
