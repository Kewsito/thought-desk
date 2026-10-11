<script lang="ts">
  import type { Editor } from '@tiptap/core';
  import { BubbleMenuPlugin } from '@tiptap/extension-bubble-menu';
  import { NodeSelection } from '@tiptap/pm/state';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { onMount, tick } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import { ui } from '../ui.svelte';
  import { KINDS, currentKind, turnInto } from './blocks';

  let { editor }: { editor: Editor } = $props();

  let el: HTMLDivElement;
  let linkInput = $state<HTMLInputElement>();
  let mode = $state<'format' | 'link'>('format');
  let href = $state('');
  // Bumped on every transaction so the active states re-render.
  let version = $state(0);

  const active = $derived.by(() => {
    void version;
    return {
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      code: editor.isActive('code'),
      highlight: editor.isActive('highlight'),
      link: editor.isActive('link'),
      kind: KINDS.find((k) => k.kind === currentKind(editor))?.label ?? 'Text',
    };
  });

  onMount(() => {
    const key = 'textBubble';
    editor.registerPlugin(
      BubbleMenuPlugin({
        pluginKey: key,
        editor,
        element: el,
        updateDelay: 120,
        shouldShow: ({ editor, state, from, to }) => {
          if (!editor.isEditable || from === to) return false;
          if (state.selection instanceof NodeSelection) return false;
          if (editor.isActive('codeBlock') || editor.isActive('image')) return false;
          return state.doc.textBetween(from, to, ' ').trim().length > 0 || mode === 'link';
        },
        options: {
          strategy: 'fixed',
          placement: 'top',
          offset: 8,
          flip: true,
          shift: { padding: 8 },
          onHide: () => (mode = 'format'),
        },
      }),
    );
    // Deferred: transactions can fire while Svelte is tearing components
    // down (e.g. the blur on destroy), where state writes aren't allowed.
    let alive = true;
    let queued = false;
    const bump = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (alive) version++;
      });
    };
    editor.on('transaction', bump);
    const onEditLink = () => {
      if (!editor.state.selection.empty) void startLink();
    };
    window.addEventListener('td:edit-link', onEditLink);
    return () => {
      alive = false;
      editor.off('transaction', bump);
      window.removeEventListener('td:edit-link', onEditLink);
      if (!editor.isDestroyed) editor.unregisterPlugin(key);
    };
  });

  async function startLink() {
    href = editor.getAttributes('link').href ?? '';
    mode = 'link';
    await tick();
    linkInput?.focus();
    linkInput?.select();
  }

  function applyLink() {
    const url = href.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!url) chain.unsetLink().run();
    else chain.setLink({ href: /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('#') ? url : `https://${url}` }).run();
    mode = 'format';
  }

  function removeLink() {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    mode = 'format';
  }

  function openTurnInto(e: MouseEvent) {
    ui.openMenuAt(
      e.currentTarget as Element,
      KINDS.map((k) => ({
        label: k.label,
        icon: k.icon,
        checked: k.label === active.kind,
        action: () => turnInto(editor, k.kind),
      })),
    );
  }

  const keep = (e: MouseEvent) => e.preventDefault();
</script>

<div class="bubble popover" bind:this={el} style="visibility: hidden">
  {#if mode === 'format'}
    <button class="kind" onmousedown={keep} onclick={openTurnInto}>
      {active.kind}
      <Icon name="chevron-down" size={12} />
    </button>
    <span class="sep"></span>
    <button class:on={active.bold} onmousedown={keep} onclick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)"><Icon name="bold" size={15} stroke={2.2} /></button>
    <button class:on={active.italic} onmousedown={keep} onclick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)"><Icon name="italic" size={15} stroke={2} /></button>
    <button class:on={active.underline} onmousedown={keep} onclick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)"><Icon name="underline" size={15} stroke={2} /></button>
    <button class:on={active.strike} onmousedown={keep} onclick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough (Ctrl+Shift+S)"><Icon name="strike" size={15} stroke={2} /></button>
    <button class:on={active.code} onmousedown={keep} onclick={() => editor.chain().focus().toggleCode().run()} title="Inline code (Ctrl+E)"><Icon name="code" size={15} stroke={2} /></button>
    <button class:on={active.highlight} onmousedown={keep} onclick={() => editor.chain().focus().toggleHighlight().run()} title="Highlight (Ctrl+Shift+H)"><Icon name="highlight" size={15} stroke={2} /></button>
    <span class="sep"></span>
    <button class:on={active.link} onmousedown={keep} onclick={startLink} title="Link (Ctrl+K)"><Icon name="link" size={15} stroke={2} /> <span class="txt">Link</span></button>
  {:else}
    <form
      class="link-form"
      onsubmit={(e) => {
        e.preventDefault();
        applyLink();
      }}
    >
      <input
        bind:this={linkInput}
        bind:value={href}
        placeholder="Paste or type a link…"
        spellcheck="false"
        onkeydown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            mode = 'format';
            editor.commands.focus();
          }
        }}
      />
      {#if active.link}
        <button type="button" onmousedown={keep} onclick={() => href && openUrl(href).catch(ui.error)} title="Open link"><Icon name="arrow-right" size={15} /></button>
        <button type="button" onmousedown={keep} onclick={removeLink} title="Remove link"><Icon name="unlink" size={15} /></button>
      {/if}
      <button type="submit" class="apply" title="Apply"><Icon name="enter" size={15} /></button>
    </form>
  {/if}
</div>

<style>
  .bubble {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 3px;
    white-space: nowrap;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 28px;
    min-width: 28px;
    justify-content: center;
    padding: 0 6px;
    border-radius: 5px;
    color: var(--text);
  }
  button:hover {
    background: var(--hover);
  }
  button.on {
    background: var(--text);
    color: var(--bg);
  }
  .kind {
    font-size: 13px;
    padding: 0 8px;
  }
  .txt {
    font-size: 13px;
  }
  .sep {
    width: 1px;
    height: 18px;
    background: var(--border);
    margin: 0 3px;
  }
  .link-form {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .link-form input {
    width: 260px;
    height: 28px;
    padding: 0 8px;
    border: none;
    background: transparent;
    font-size: 13px;
  }
</style>
