<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';
  import { api } from '../api';
  import { prefs, type Font, type Theme } from '../prefs.svelte';
  import { ui } from '../ui.svelte';
  import { formatBytes } from '../time';
  import type { DataInfo } from '../types';

  let info = $state<DataInfo | null>(null);

  onMount(() => {
    api.dataInfo().then((d) => (info = d), ui.error);
  });

  const themes: { value: Theme; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
    { value: 'system', label: 'System', icon: 'monitor' },
  ];
  const fonts: { value: Font; label: string }[] = [
    { value: 'sans', label: 'Default' },
    { value: 'serif', label: 'Serif' },
    { value: 'mono', label: 'Mono' },
  ];
  const shortcuts: [string, string][] = [
    ['Ctrl+K  /  Ctrl+P', 'Search pages'],
    ['Ctrl+N', 'New page'],
    ['Ctrl+\\', 'Toggle sidebar'],
    ['Alt+←  /  Alt+→', 'Back / forward'],
    ['Ctrl+Shift+L', 'Toggle dark mode'],
    ['Ctrl+,', 'Settings'],
    ['/', 'Insert a block'],
    ['@', 'Link to a page'],
    ['Ctrl+B / I / U', 'Bold / italic / underline'],
    ['Ctrl+E', 'Inline code'],
    ['Ctrl+Shift+H', 'Highlight'],
    ['Ctrl+K (with selection)', 'Add link'],
    ['Ctrl+D', 'Duplicate block'],
    ['Tab / Shift+Tab', 'Indent / outdent list item'],
  ];
</script>

<Modal onclose={() => (ui.settingsOpen = false)} width={600} top="9vh" label="Settings">
  <div class="head">
    <h2>Settings</h2>
    <button class="icon-btn" onclick={() => (ui.settingsOpen = false)} aria-label="Close"><Icon name="x" /></button>
  </div>
  <div class="body">
    <section>
      <h3>Appearance</h3>
      <div class="row">
        <div class="label">
          <span>Theme</span>
          <small>Black on white, white on black, or follow Windows</small>
        </div>
        <div class="segmented">
          {#each themes as t}
            <button class:on={prefs.theme === t.value} onclick={() => (prefs.theme = t.value)}>
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          {/each}
        </div>
      </div>
      <div class="row">
        <div class="label">
          <span>Page font</span>
          <small>Used for page titles and content</small>
        </div>
        <div class="fonts">
          {#each fonts as f}
            <button class="font" class:on={prefs.font === f.value} data-font={f.value} onclick={() => (prefs.font = f.value)}>
              <span class="ag">Ag</span>
              <span class="fname">{f.label}</span>
            </button>
          {/each}
        </div>
      </div>
      <div class="row">
        <div class="label">
          <span>Small text</span>
          <small>Fit more on screen</small>
        </div>
        <button class="switch" class:on={prefs.smallText} onclick={() => (prefs.smallText = !prefs.smallText)} role="switch" aria-checked={prefs.smallText} aria-label="Small text"></button>
      </div>
    </section>

    <section>
      <h3>Editor</h3>
      <div class="row">
        <div class="label">
          <span>Spell check</span>
          <small>Underline misspelled words while typing</small>
        </div>
        <button class="switch" class:on={prefs.spellcheck} onclick={() => (prefs.spellcheck = !prefs.spellcheck)} role="switch" aria-checked={prefs.spellcheck} aria-label="Spell check"></button>
      </div>
    </section>

    <section>
      <h3>Storage</h3>
      {#if info}
        <div class="stats">
          <div><strong>{info.pageCount}</strong><span>pages</span></div>
          <div><strong>{formatBytes(info.dbBytes)}</strong><span>database</span></div>
          <div><strong>{formatBytes(info.fileBytes)}</strong><span>{info.fileCount} images</span></div>
        </div>
        <div class="path" title={info.dataDir}><Icon name="folder" size={14} /> <span>{info.dataDir}</span></div>
        <p class="note">Everything is stored locally in one SQLite file. Back up this folder to keep your notes safe.</p>
      {:else}
        <p class="note">Loading…</p>
      {/if}
    </section>

    <section>
      <h3>Keyboard shortcuts</h3>
      <div class="keys">
        {#each shortcuts as [k, d]}
          <span class="desc">{d}</span><kbd>{k}</kbd>
        {/each}
      </div>
    </section>

    <p class="about">Thought Desk {info?.version ?? ''} · Rust + Tauri · Lightweight by design: uses the system WebView and trims its memory while minimized.</p>
  </div>
</Modal>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 14px 10px 22px;
    flex: none;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .body {
    overflow-y: auto;
    padding: 0 22px 18px;
  }
  section {
    padding: 14px 0 6px;
    border-top: 1px solid var(--border);
  }
  section:first-child {
    border-top: none;
    padding-top: 2px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 0;
  }
  .label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 14px;
  }
  .label small {
    color: var(--text-3);
    font-size: 12.5px;
  }
  .segmented {
    display: flex;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: 8px;
    flex: none;
  }
  .segmented button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-2);
  }
  .segmented button.on {
    background: var(--text);
    color: var(--bg);
  }
  .fonts {
    display: flex;
    gap: 6px;
    flex: none;
  }
  .font {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 64px;
    padding: 6px 0 5px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-2);
  }
  .font.on {
    border-color: var(--text);
    color: var(--text);
    box-shadow: inset 0 0 0 1px var(--text);
  }
  .ag {
    font-size: 20px;
    line-height: 1.2;
  }
  .font[data-font='serif'] .ag {
    font-family: var(--font-serif);
  }
  .font[data-font='mono'] .ag {
    font-family: var(--font-mono);
    font-size: 18px;
  }
  .font[data-font='sans'] .ag {
    font-family: var(--font-sans);
  }
  .fname {
    font-size: 11.5px;
  }
  .switch {
    position: relative;
    flex: none;
    width: 34px;
    height: 20px;
    border-radius: 10px;
    background: var(--border-strong);
    transition: background 120ms;
  }
  .switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--bg);
    transition: transform 140ms;
  }
  .switch.on {
    background: var(--text);
  }
  .switch.on::after {
    transform: translateX(14px);
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 4px 0 10px;
  }
  .stats div {
    display: flex;
    flex-direction: column;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .stats strong {
    font-size: 16px;
    font-weight: 600;
  }
  .stats span {
    font-size: 12px;
    color: var(--text-3);
  }
  .path {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 6px;
    background: var(--hover);
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-2);
    user-select: text;
  }
  .path span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note {
    font-size: 12.5px;
    color: var(--text-3);
    margin: 8px 0 4px;
  }
  .keys {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 16px;
    align-items: center;
    font-size: 13.5px;
    padding-bottom: 6px;
  }
  .desc {
    color: var(--text-2);
  }
  .keys kbd {
    justify-self: end;
  }
  .about {
    margin: 10px 0 0;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-3);
  }
</style>
