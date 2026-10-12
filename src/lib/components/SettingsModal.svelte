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
    { value: 'system', label: 'Auto', icon: 'monitor' },
  ];
  const fonts: { value: Font; label: string }[] = [
    { value: 'sans', label: 'Default' },
    { value: 'serif', label: 'Serif' },
    { value: 'mono', label: 'Mono' },
  ];
  const shortcuts: { label: string; keys: string[][] }[] = [
    { label: 'Search pages', keys: [['Ctrl', 'K']] },
    { label: 'New page', keys: [['Ctrl', 'N']] },
    { label: 'Toggle sidebar', keys: [['Ctrl', '\\']] },
    { label: 'Back and forward', keys: [['Alt', '←'], ['Alt', '→']] },
    { label: 'Light or dark', keys: [['Ctrl', 'Shift', 'L']] },
    { label: 'Insert a block', keys: [['/']] },
    { label: 'Link to a page', keys: [['@']] },
    { label: 'Add a link', keys: [['Ctrl', 'K']] },
    { label: 'Duplicate block', keys: [['Ctrl', 'D']] },
    { label: 'Indent list item', keys: [['Tab'], ['Shift', 'Tab']] },
  ];

  async function copyPath() {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.dataDir);
      ui.toast('Folder path copied');
    } catch (e) {
      ui.error(e);
    }
  }
</script>

{#snippet toggle(on: boolean, label: string, onchange: () => void)}
  <button class="switch round" class:on onclick={onchange} role="switch" aria-checked={on} aria-label={label}>
    <span class="knob round"></span>
  </button>
{/snippet}

<Modal onclose={() => (ui.settingsOpen = false)} width={580} top="8vh" label="Settings">
  <header class="head">
    <h2>Settings</h2>
    <button class="icon-btn" onclick={() => (ui.settingsOpen = false)} aria-label="Close"><Icon name="x" /></button>
  </header>

  <div class="body">
    <h3>Appearance</h3>
    <div class="group">
      <div class="row">
        <div class="label">Theme</div>
        <div class="segmented" role="radiogroup" aria-label="Theme">
          {#each themes as t}
            <button class:on={prefs.theme === t.value} role="radio" aria-checked={prefs.theme === t.value} onclick={() => (prefs.theme = t.value)}>
              <Icon name={t.icon} size={14} stroke={2} />
              {t.label}
            </button>
          {/each}
        </div>
      </div>
      <div class="row tall">
        <div class="label">
          Page font
          <small>Titles and writing</small>
        </div>
        <div class="fonts" role="radiogroup" aria-label="Page font">
          {#each fonts as f}
            <button class="font" class:on={prefs.font === f.value} data-font={f.value} role="radio" aria-checked={prefs.font === f.value} onclick={() => (prefs.font = f.value)}>
              <span class="ag">Ag</span>
              <span class="fname">{f.label}</span>
            </button>
          {/each}
        </div>
      </div>
      <div class="row">
        <div class="label">
          Small text
          <small>Fit more on the page</small>
        </div>
        {@render toggle(prefs.smallText, 'Small text', () => (prefs.smallText = !prefs.smallText))}
      </div>
    </div>

    <h3>Writing</h3>
    <div class="group">
      <div class="row">
        <div class="label">
          Check spelling
          <small>Underline words that look misspelled</small>
        </div>
        {@render toggle(prefs.spellcheck, 'Check spelling', () => (prefs.spellcheck = !prefs.spellcheck))}
      </div>
    </div>

    <h3>Storage</h3>
    <div class="group">
      {#if info}
        <div class="row stats">
          <div class="stat"><strong>{info.pageCount}</strong><span>{info.pageCount === 1 ? 'Page' : 'Pages'}</span></div>
          <div class="stat"><strong>{formatBytes(info.dbBytes)}</strong><span>Database</span></div>
          <div class="stat"><strong>{formatBytes(info.fileBytes)}</strong><span>{info.fileCount === 1 ? '1 image' : `${info.fileCount} images`}</span></div>
        </div>
        <div class="row">
          <div class="label path-label">
            Location
            <small class="path" data-tip={info.dataDir}>{info.dataDir}</small>
          </div>
          <button class="btn small" onclick={copyPath}>Copy path</button>
        </div>
      {:else}
        <div class="row"><div class="label"><small>Loading…</small></div></div>
      {/if}
    </div>
    <p class="note">Everything is stored on this computer in a single SQLite file. Back up the folder above to keep your notes safe.</p>

    <h3>Keyboard</h3>
    <div class="group">
      {#each shortcuts as s}
        <div class="row compact">
          <div class="label">{s.label}</div>
          <div class="keys">
            {#each s.keys as combo, i}
              {#if i > 0}<span class="or">or</span>{/if}
              <span class="combo">{#each combo as k}<kbd>{k}</kbd>{/each}</span>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    <p class="about">Thought Desk {info?.version ?? ''}</p>
  </div>
</Modal>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
    padding: 0 14px 0 24px;
    flex: none;
  }
  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: var(--fw-650);
    letter-spacing: -0.016em;
  }
  .body {
    overflow-y: auto;
    padding: 0 24px 28px;
    /* Content softly fades under the sheet edge instead of being cut. */
    mask-image: linear-gradient(to bottom, #000 calc(100% - 20px), transparent);
  }
  h3 {
    margin: 18px 0 8px 4px;
    font-size: var(--fs-ui);
    font-weight: var(--fw-600);
    color: var(--text-2);
  }
  h3:first-child {
    margin-top: 2px;
  }

  /* Inset grouped list */
  .group {
    background: var(--bg-grouped);
    border-radius: var(--r-md);
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 48px;
    padding: 8px 14px 8px 16px;
  }
  .row.tall {
    min-height: 76px;
  }
  .row.compact {
    min-height: 38px;
    padding-top: 4px;
    padding-bottom: 4px;
  }
  /* Hairline separators inset from the leading edge, like iOS/macOS lists. */
  .row + .row::before {
    content: '';
    position: absolute;
    top: 0;
    left: 16px;
    right: 0;
    height: 1px;
    background: var(--hairline);
  }
  .label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    font-size: var(--fs-body-ui);
    font-weight: var(--fw-500);
    color: var(--text);
  }
  .label small {
    font-size: var(--fs-footnote);
    font-weight: 400;
    color: var(--text-3);
  }

  /* Segmented control */
  .segmented {
    display: flex;
    flex: none;
    padding: 2px;
    border-radius: var(--r-sm);
    background: var(--fill-2);
  }
  .segmented button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 12px;
    border-radius: 6px;
    font-size: var(--fs-ui);
    font-weight: var(--fw-500);
    color: var(--text-2);
    transition:
      background-color var(--dur) var(--ease),
      color var(--dur) var(--ease),
      box-shadow var(--dur) var(--ease);
  }
  .segmented button:hover:not(.on) {
    color: var(--text);
  }
  .segmented button.on {
    background: var(--bg-elevated);
    color: var(--text);
    box-shadow:
      0 0 0 0.5px var(--hairline),
      var(--shadow-sm);
  }
  :global(:root[data-theme='dark']) .segmented button.on {
    background: #48484a;
  }

  /* Font picker */
  .fonts {
    display: flex;
    gap: 8px;
    flex: none;
  }
  .font {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    width: 64px;
    height: 56px;
    border-radius: var(--r-sm);
    background: var(--bg-elevated);
    box-shadow: 0 0 0 1px var(--hairline);
    color: var(--text-2);
    transition:
      box-shadow var(--dur) var(--ease),
      color var(--dur) var(--ease);
  }
  .font:hover {
    color: var(--text);
  }
  .font.on {
    color: var(--text);
    box-shadow: 0 0 0 2px var(--text);
  }
  .ag {
    font-size: 21px;
    line-height: 1.15;
  }
  .font[data-font='sans'] .ag {
    font-family: var(--font-sans);
    font-weight: var(--fw-500);
  }
  .font[data-font='serif'] .ag {
    font-family: var(--font-serif);
  }
  .font[data-font='mono'] .ag {
    font-family: var(--font-mono);
    font-size: 18px;
  }
  .fname {
    font-size: var(--fs-caption);
    font-weight: var(--fw-500);
  }

  /* Switch */
  .switch {
    position: relative;
    flex: none;
    width: 38px;
    height: 22px;
    border-radius: 11px;
    background: var(--fill-3);
    transition: background-color var(--dur) var(--ease);
  }
  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow:
      0 0 0 0.5px rgba(0, 0, 0, 0.04),
      0 2px 4px rgba(0, 0, 0, 0.15),
      0 1px 1px rgba(0, 0, 0, 0.06);
    transition:
      transform var(--dur-slow) var(--spring),
      background-color var(--dur) var(--ease);
  }
  .switch.on {
    background: var(--accent);
  }
  .switch.on .knob {
    transform: translateX(16px);
    background: var(--on-accent);
  }

  /* Storage */
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0;
    padding: 14px 16px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .stat + .stat {
    padding-left: 16px;
    box-shadow: inset 1px 0 0 var(--hairline);
  }
  .stat strong {
    font-size: 17px;
    font-weight: var(--fw-600);
    letter-spacing: -0.012em;
    font-variant-numeric: tabular-nums;
  }
  .stat span {
    font-size: var(--fs-footnote);
    color: var(--text-3);
  }
  .path-label {
    flex: 1;
  }
  .path {
    font-family: var(--font-mono);
    font-size: 11.5px !important;
    color: var(--text-2) !important;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: text;
  }
  .btn.small {
    height: 26px;
    min-width: 0;
    padding: 0 10px;
    font-size: var(--fs-ui);
    background: var(--bg-elevated);
    box-shadow: 0 0 0 0.5px var(--hairline), var(--shadow-sm);
  }
  :global(:root[data-theme='dark']) .btn.small {
    background: #3a3a3c;
  }
  .note {
    margin: 8px 4px 0;
    font-size: var(--fs-footnote);
    line-height: 1.45;
    color: var(--text-3);
  }

  /* Keyboard */
  .keys {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: none;
  }
  .combo {
    display: flex;
    gap: 3px;
  }
  .combo kbd {
    min-width: 20px;
    justify-content: center;
    background: var(--bg-elevated);
    box-shadow: 0 0 0 0.5px var(--hairline), 0 1px 0 var(--hairline);
    color: var(--text-2);
  }
  .or {
    font-size: var(--fs-caption);
    color: var(--text-3);
  }

  .about {
    margin: 20px 0 0;
    text-align: center;
    font-size: var(--fs-footnote);
    color: var(--text-3);
  }
</style>
