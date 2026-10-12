<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Swatches from '../ui/Swatches.svelte';
  import Switch from '../ui/Switch.svelte';
  import { api } from '../api';
  import { ACCENTS, PALETTE, PALETTES, colorVar, nextColor, type Accent } from '../colors';
  import { planner } from '../planner.svelte';
  import { prefs, type Font, type RemindAssignments, type RemindEvents, type Theme, type WeekStart } from '../prefs.svelte';
  import { importCalendar } from '../ics-import.svelte';
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
  const weekStarts: { value: WeekStart; label: string }[] = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
  ];
  const remindAssignments: { value: RemindAssignments; label: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'evening', label: 'Evening Before' },
    { value: 'morning', label: 'That Morning' },
  ];
  const remindEvents: { value: RemindEvents; label: string }[] = [
    { value: 0, label: 'Off' },
    { value: 5, label: '5 min' },
    { value: 10, label: '10 min' },
    { value: 15, label: '15 min' },
    { value: 30, label: '30 min' },
  ];
  const shortcuts: { label: string; keys: string[][] }[] = [
    { label: 'Search everything', keys: [['Ctrl', 'K']] },
    { label: 'New page', keys: [['Ctrl', 'N']] },
    { label: 'Quick Capture', keys: [['Ctrl', 'Shift', 'Space']] },
    { label: 'Home, Assignments, Calendar, Files, Flashcards', keys: [['Ctrl', '1'], ['Ctrl', '2'], ['Ctrl', '3'], ['Ctrl', '4'], ['Ctrl', '5']] },
    { label: 'Flashcard: show answer, then rate', keys: [['Space'], ['1'], ['2'], ['3'], ['4']] },
    { label: 'Calendar: previous or next', keys: [['←'], ['→']] },
    { label: 'Calendar: today', keys: [['T']] },
    { label: 'Toggle sidebar', keys: [['Ctrl', '\\']] },
    { label: 'Back and forward', keys: [['Alt', '←'], ['Alt', '→']] },
    { label: 'Light or dark', keys: [['Ctrl', 'Shift', 'L']] },
    { label: 'Insert a block', keys: [['/']] },
    { label: 'Link a page, assignment or file', keys: [['@']] },
    { label: 'Add a link', keys: [['Ctrl', 'K']] },
    { label: 'Duplicate block', keys: [['Ctrl', 'D']] },
    { label: 'Indent list item', keys: [['Tab'], ['Shift', 'Tab']] },
  ];

  const accentLabel = $derived(ACCENTS.find((a) => a.key === prefs.accent)?.label ?? 'Graphite');

  async function copyPath() {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.dataDir);
      ui.toast('Folder path copied');
    } catch (e) {
      ui.error(e);
    }
  }

  const addCourse = () => planner.promptCourse();

  async function renameCourse(id: string, name: string) {
    const res = await ui.prompt({ title: 'Rename Course', value: name, confirmLabel: 'Rename', icon: 'book' });
    if (res) void planner.updateCourse(id, { name: res.value });
  }

  function colorMenu(e: MouseEvent, id: string, current: string) {
    ui.openMenuAt(
      e.currentTarget as Element,
      PALETTE.map((p) => ({
        label: p.label,
        dot: colorVar(p.key),
        checked: current === p.key,
        action: () => void planner.updateCourse(id, { color: p.key }),
      })),
    );
  }

  const stats = $derived(
    info
      ? [
          { n: info.pageCount, one: 'Page', many: 'Pages' },
          { n: info.assignmentCount, one: 'Assignment', many: 'Assignments' },
          { n: info.eventCount, one: 'Event', many: 'Events' },
          { n: info.fileCount, one: 'File', many: 'Files' },
        ]
      : [],
  );
</script>

<Modal onclose={() => (ui.settingsOpen = false)} label="Settings">
  <header class="modal-head">
    <h2>Settings</h2>
    <button class="icon-btn" onclick={() => (ui.settingsOpen = false)} aria-label="Close"><Icon name="x" /></button>
  </header>

  <div class="modal-body fade">
    <h3 class="group-title">Appearance</h3>
    <div class="group">
      <div class="group-row">
        <div class="row-label">Theme</div>
        <Segmented options={themes} value={prefs.theme} onchange={(v) => (prefs.theme = v)} label="Theme" />
      </div>
      <div class="group-row stack">
        <div class="row-label">
          Color theme
          <small>Backgrounds and text, in light and dark</small>
        </div>
        <div class="palettes" role="radiogroup" aria-label="Color theme">
          {#each PALETTES as p (p.key)}
            {@const [bg, side, ink] = prefs.resolvedTheme === 'dark' ? p.dark : p.light}
            <button class="palette" class:on={prefs.palette === p.key} role="radio" aria-checked={prefs.palette === p.key} onclick={() => (prefs.palette = p.key)}>
              <span class="mini" style:--bg={bg} style:--side={side} style:--ink={ink}>
                <span class="mini-side"><i></i><i></i><i></i></span>
                <span class="mini-page"><b></b><i></i><i></i><i class="short"></i></span>
              </span>
              <span class="pname">{p.label}</span>
            </button>
          {/each}
        </div>
      </div>
      <div class="group-row">
        <div class="row-label">
          Accent color
          <small>{accentLabel}</small>
        </div>
        <Swatches keys={[...ACCENTS]} value={prefs.accent} onchange={(k) => (prefs.accent = k as Accent)} label="Accent color" />
      </div>
      <div class="group-row tall">
        <div class="row-label">
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
      <div class="group-row">
        <div class="row-label">
          Small text
          <small>Fit more on the page</small>
        </div>
        <Switch on={prefs.smallText} label="Small text" onchange={() => (prefs.smallText = !prefs.smallText)} />
      </div>
    </div>

    <h3 class="group-title">Writing</h3>
    <div class="group">
      <div class="group-row">
        <div class="row-label">
          Check spelling
          <small>Underline words that look misspelled</small>
        </div>
        <Switch on={prefs.spellcheck} label="Check spelling" onchange={() => (prefs.spellcheck = !prefs.spellcheck)} />
      </div>
    </div>

    <h3 class="group-title">Quick Capture</h3>
    <div class="group">
      <div class="group-row">
        <div class="row-label">
          Capture from anywhere
          <small>Ctrl+Shift+Space opens Quick Capture even when Thought Desk is in the background</small>
        </div>
        <Switch on={prefs.globalCapture} label="Capture from anywhere" onchange={() => (prefs.globalCapture = !prefs.globalCapture)} />
      </div>
    </div>

    <h3 class="group-title">Calendar</h3>
    <div class="group">
      <div class="group-row">
        <div class="row-label">Week starts on</div>
        <Segmented options={weekStarts} value={prefs.weekStart} onchange={(v) => (prefs.weekStart = v)} label="Week starts on" />
      </div>
      <div class="group-row">
        <div class="row-label">
          Import a calendar
          <small>Class schedules and due dates from a .ics file (Canvas, Google, Outlook)</small>
        </div>
        <button class="btn small raised" onclick={importCalendar}><Icon name="download" size={13} stroke={2.2} /> Import…</button>
      </div>
    </div>

    <h3 class="group-title">Reminders</h3>
    <div class="group">
      <div class="group-row">
        <div class="row-label">
          Assignments
          <small>Plus one an hour before anything with a due time</small>
        </div>
        <Segmented options={remindAssignments} value={prefs.remindAssignments} onchange={(v) => (prefs.remindAssignments = v)} label="Assignment reminders" />
      </div>
      <div class="group-row">
        <div class="row-label">
          Before events
          <small>Only events with a start time</small>
        </div>
        <Segmented options={remindEvents} value={prefs.remindEvents} onchange={(v) => (prefs.remindEvents = v)} label="Event reminders" />
      </div>
    </div>

    <h3 class="group-title">
      <span>Courses</span>
      <button class="btn small raised" onclick={addCourse}><Icon name="plus" size={13} stroke={2.2} /> Add Course</button>
    </h3>
    <div class="group">
      {#each planner.courses as c (c.id)}
        {@const used = planner.live.filter((a) => a.courseId === c.id).length}
        <div class="group-row compact course">
          <button class="course-color" onclick={(e) => colorMenu(e, c.id, c.color)} data-tip="Change color" aria-label="Change color">
            <span class="dot" style:--dot={colorVar(c.color)}></span>
          </button>
          <div class="row-label course-name">
            {c.name || 'Untitled'}
            <small>{used} assignment{used === 1 ? '' : 's'}</small>
          </div>
          <div class="course-actions">
            <button class="icon-btn" onclick={() => renameCourse(c.id, c.name)} data-tip="Rename" aria-label="Rename"><Icon name="pencil" size={15} /></button>
            <button class="icon-btn" onclick={() => planner.deleteCourse(c.id)} data-tip="Delete" aria-label="Delete"><Icon name="trash" size={15} /></button>
          </div>
        </div>
      {:else}
        <div class="group-row"><div class="row-label"><small>Courses group assignments and events and give them a color.</small></div></div>
      {/each}
    </div>

    <h3 class="group-title">Storage</h3>
    <div class="group">
      {#if info}
        <div class="group-row stats">
          {#each stats as st}
            <div class="stat"><strong>{st.n}</strong><span>{st.n === 1 ? st.one : st.many}</span></div>
          {/each}
        </div>
        <div class="group-row">
          <div class="row-label">Size</div>
          <span class="value">{formatBytes(info.dbBytes)} database · {formatBytes(info.fileBytes)} files</span>
        </div>
        <div class="group-row">
          <div class="row-label path-label">
            Location
            <small class="path" data-tip={info.dataDir}>{info.dataDir}</small>
          </div>
          <button class="btn small raised" onclick={copyPath}>Copy Path</button>
        </div>
      {:else}
        <div class="group-row"><div class="row-label"><small>Loading…</small></div></div>
      {/if}
    </div>
    <p class="group-note">Everything is stored on this computer: one SQLite file plus a files folder. Back up the folder above to keep your work safe.</p>

    <h3 class="group-title">Keyboard</h3>
    <div class="group">
      {#each shortcuts as s}
        <div class="group-row compact">
          <div class="row-label">{s.label}</div>
          <div class="keys">
            {#each s.keys as combo, i}
              {#if i > 0}<span class="or">{s.keys.length > 2 ? '·' : 'or'}</span>{/if}
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
  /* Colour themes: a tiny window drawn in each theme's colours. */
  .palettes {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }
  .palette {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 4px;
    border-radius: var(--r-md);
    color: var(--text-2);
    transition: color var(--dur) var(--ease);
  }
  .palette:hover,
  .palette.on {
    color: var(--text);
  }
  /* 10px tile − 4px padding = 6px picture corners. */
  .mini {
    position: relative;
    display: flex;
    width: 100%;
    aspect-ratio: 4 / 3;
    border-radius: var(--r-xs);
    background: var(--bg);
    box-shadow: 0 0 0 1px var(--hairline);
    overflow: hidden;
    transition: box-shadow var(--dur) var(--ease);
  }
  .palette.on .mini {
    box-shadow:
      0 0 0 2px var(--bg-grouped),
      0 0 0 4px var(--accent);
  }
  .mini-side {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 30%;
    padding: 8px 4px;
    background: var(--side);
  }
  .mini-page {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 6px;
  }
  .mini i,
  .mini b {
    display: block;
    height: 3px;
    border-radius: 2px;
    background: var(--ink);
    opacity: 0.22;
  }
  .mini b {
    width: 60%;
    height: 5px;
    opacity: 0.85;
  }
  .mini i.short {
    width: 50%;
  }
  .pname {
    font-size: var(--fs-footnote);
    font-weight: var(--fw-500);
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
    background: var(--raised);
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
    box-shadow: 0 0 0 2px var(--accent);
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

  /* Courses */
  .course {
    justify-content: flex-start;
    gap: 12px;
    min-height: 48px;
  }
  .course-color {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: var(--r-xs);
    transition: background-color var(--dur-fast) var(--ease);
  }
  .course-color:hover {
    background: var(--fill-2);
  }
  .course-color .dot {
    width: 12px;
    height: 12px;
  }
  .course-name {
    flex: 1;
  }
  .course-actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease);
  }
  .course:hover .course-actions,
  .course-actions:focus-within {
    opacity: 1;
  }
  .course + :global(.course)::before {
    left: 52px;
  }

  /* Storage */
  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
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
  .value {
    font-size: var(--fs-ui);
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }
  .path-label {
    flex: 1;
  }
  .path {
    font-family: var(--font-mono);
    font-size: 12px !important;
    color: var(--text-2) !important;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: text;
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
    gap: 4px;
  }
  .combo kbd {
    min-width: 20px;
    justify-content: center;
    background: var(--raised);
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
