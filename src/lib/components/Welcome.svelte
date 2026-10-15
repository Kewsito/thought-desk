<script lang="ts">
  /**
   * The first thing a new install shows: a name for Home to greet you by,
   * how the app looks (applied as you choose), three things worth knowing,
   * and off you go. Everything here can be changed later in Settings.
   */
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import WindowControls from './WindowControls.svelte';
  import Swatches from '../ui/Swatches.svelte';
  import { ACCENTS, type Accent } from '../colors';
  import { prefs, type Font, type Theme } from '../prefs.svelte';
  import { store } from '../store.svelte';

  const STEPS = ['welcome', 'look', 'tour', 'done'] as const;
  let step = $state(0);
  /** Which way the last move went, so steps slide the right way. */
  let dir = $state(1);
  let name = $state(prefs.name);
  let nameEl = $state<HTMLInputElement>();
  let nextEl = $state<HTMLButtonElement>();

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const first = $derived(name.trim().split(/\s+/)[0] ?? '');

  const themes: { value: Theme; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'Match system' },
  ];
  const fonts: { value: Font; label: string; note: string }[] = [
    { value: 'sans', label: 'Default', note: 'Clean and modern' },
    { value: 'serif', label: 'Serif', note: 'Like a printed book' },
    { value: 'mono', label: 'Mono', note: 'Like a typewriter' },
  ];

  onMount(() => {
    void tick().then(() => nameEl?.focus());
  });

  async function go(to: number) {
    if (to < 0 || to >= STEPS.length) return;
    if (STEPS[step] === 'welcome') prefs.name = name.trim();
    dir = to > step ? 1 : -1;
    step = to;
    await tick();
    // Keyboard users keep going with Enter.
    if (STEPS[step] === 'welcome') nameEl?.focus();
    else nextEl?.focus();
  }

  function finish() {
    prefs.name = name.trim();
    prefs.welcomed = true;
    store.go('home');
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey) return;
    // Enter on a button presses that button; anywhere else it moves on.
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    if (step === STEPS.length - 1) finish();
    else void go(step + 1);
  }

  /** Steps slide in from the side they come from. */
  function slide(_node: Element, { from }: { from: number }) {
    return {
      duration: reduced ? 0 : 320,
      css: (t: number) => {
        const e = 1 - Math.pow(1 - t, 3);
        return `opacity:${e}; transform: translateX(${(1 - e) * 24 * from}px)`;
      },
    };
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="welcome" role="dialog" aria-modal="true" aria-label="Welcome to Thought Desk" tabindex="-1" {onkeydown}>
  <header class="bar" data-tauri-drag-region>
    <div class="grow" data-tauri-drag-region></div>
    <WindowControls />
  </header>

  <div class="stage">
    {#key step}
      <section class="step" in:slide={{ from: dir }}>
        {#if STEPS[step] === 'welcome'}
          <svg class="logo" width="64" height="64" viewBox="0 0 1024 1024" aria-hidden="true">
            <rect x="64" y="64" width="896" height="896" rx="230" fill="var(--text)" />
            <circle cx="512" cy="430" r="150" fill="var(--bg)" />
            <rect x="262" y="660" width="500" height="68" rx="34" fill="var(--bg)" />
          </svg>
          <h1>Welcome to Thought Desk</h1>
          <p class="lead">Your notes, classes and deadlines in one quiet place. Everything stays on this computer.</p>
          <label class="name">
            <span>What should we call you?</span>
            <input bind:this={nameEl} bind:value={name} placeholder="Your name" maxlength="40" autocomplete="given-name" spellcheck="false" />
          </label>
        {:else if STEPS[step] === 'look'}
          <h1>Make it yours</h1>
          <p class="lead">Pick what feels right. You can change any of it later in Settings.</p>

          <div class="field-label">Appearance</div>
          <div class="choices three" role="radiogroup" aria-label="Appearance">
            {#each themes as t (t.value)}
              <button class="choice" class:on={prefs.theme === t.value} role="radio" aria-checked={prefs.theme === t.value} onclick={() => (prefs.theme = t.value)}>
                <span class="window {t.value}" aria-hidden="true">
                  <span class="half light"><i class="side"></i><i class="line"></i><i class="line short"></i></span>
                  <span class="half dark"><i class="side"></i><i class="line"></i><i class="line short"></i></span>
                </span>
                <span class="choice-label">{t.label}</span>
              </button>
            {/each}
          </div>

          <div class="field-label">Accent color</div>
          <div class="accent">
            <Swatches keys={[...ACCENTS]} value={prefs.accent === 'custom' ? 'graphite' : prefs.accent} onchange={(k) => (prefs.accent = k as Accent)} label="Accent color" />
          </div>

          <div class="field-label">Writing font</div>
          <div class="choices three" role="radiogroup" aria-label="Writing font">
            {#each fonts as f (f.value)}
              <button class="choice font" class:on={prefs.font === f.value} role="radio" aria-checked={prefs.font === f.value} onclick={() => (prefs.font = f.value)}>
                <span class="sample {f.value}" aria-hidden="true">Aa</span>
                <span class="choice-label">{f.label}</span>
                <span class="note">{f.note}</span>
              </button>
            {/each}
          </div>
        {:else if STEPS[step] === 'tour'}
          <h1>Three things to know</h1>
          <p class="lead">That's all you need to get going.</p>
          <ul class="tips">
            <li>
              <span class="keys"><kbd>/</kbd></span>
              <span class="tip"><strong>Type / for anything</strong>Headings, to-dos, tables, math and databases: type / on an empty line and pick one.</span>
            </li>
            <li>
              <span class="keys"><kbd>Ctrl</kbd><kbd>K</kbd></span>
              <span class="tip"><strong>Find anything</strong>Pages, assignments, events and files, as fast as you can type.</span>
            </li>
            <li>
              <span class="keys"><span class="home-ico"><Icon name="home" size={16} /></span></span>
              <span class="tip"><strong>Home has your day</strong>Today's classes, what's due soon and every open to-do, in one place.</span>
            </li>
          </ul>
          <p class="aside">Forgot a shortcut? <kbd>Ctrl</kbd><kbd>/</kbd> shows them all.</p>
        {:else}
          <div class="done-mark" aria-hidden="true"><Icon name="check" size={30} stroke={2.4} /></div>
          <h1>{first ? `You're all set, ${first}.` : "You're all set."}</h1>
          <p class="lead">Home will help you add your courses and class schedule next. Start whenever you're ready.</p>
        {/if}
      </section>
    {/key}
  </div>

  <footer class="nav">
    <div class="nav-side">
      {#if step > 0}
        <button class="btn ghost" onclick={() => go(step - 1)}><Icon name="arrow-left" size={15} /> Back</button>
      {/if}
    </div>
    <div class="dots" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
      {#each STEPS as s, i (s)}<span class="dot" class:on={i === step} class:past={i < step}></span>{/each}
    </div>
    <div class="nav-side end">
      {#if step < STEPS.length - 1}
        <button class="btn primary" bind:this={nextEl} onclick={() => go(step + 1)}>
          {step === 0 && !name.trim() ? 'Skip' : 'Continue'} <Icon name="arrow-right" size={15} />
        </button>
      {:else}
        <button class="btn primary" bind:this={nextEl} onclick={finish}>Start using Thought Desk</button>
      {/if}
    </div>
  </footer>
</div>

<style>
  .welcome {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(1400px 520px at 50% -24%, color-mix(in srgb, var(--accent) 5%, transparent), transparent 72%),
      var(--bg);
    color: var(--text);
    outline: none;
  }
  .bar {
    display: flex;
    align-items: center;
    height: 40px;
    flex: none;
  }
  .grow {
    flex: 1;
    align-self: stretch;
  }
  .stage {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    overflow-y: auto;
    padding: 12px 24px;
  }
  .step {
    grid-area: 1 / 1;
    width: min(540px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .logo {
    margin-bottom: 22px;
  }
  h1 {
    margin: 0;
    font-size: 30px;
    font-weight: var(--fw-700, 700);
    letter-spacing: -0.02em;
    line-height: 1.15;
  }
  .lead {
    max-width: 420px;
    margin: 10px 0 0;
    font-size: var(--fs-body-ui, 15px);
    line-height: 1.5;
    color: var(--text-2);
  }
  .name {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(340px, 100%);
    margin-top: 34px;
    text-align: left;
    font-size: var(--fs-footnote);
    font-weight: var(--fw-500);
    color: var(--text-2);
  }
  .name input {
    height: 44px;
    padding: 0 14px;
    border: none;
    border-radius: var(--r-md);
    background: var(--fill-2);
    font-size: 17px;
    color: var(--text);
    box-shadow: inset 0 0 0 1px transparent;
    transition: box-shadow var(--dur-fast) var(--ease);
  }
  .name input:focus {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }
  .field-label {
    align-self: flex-start;
    margin: 26px 0 10px;
    font-size: var(--fs-footnote);
    font-weight: var(--fw-600, 600);
    color: var(--text-2);
  }
  .choices {
    display: grid;
    gap: 10px;
    width: 100%;
  }
  .choices.three {
    grid-template-columns: repeat(3, 1fr);
  }
  .choice {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 10px 12px;
    border-radius: var(--r-lg);
    background: var(--bg-grouped);
    box-shadow: inset 0 0 0 1px var(--separator);
    transition:
      box-shadow var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease);
  }
  .choice:hover {
    box-shadow: inset 0 0 0 1px var(--text-3);
  }
  .choice:active {
    transform: scale(0.98);
  }
  .choice.on {
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  .choice-label {
    font-size: var(--fs-ui);
    font-weight: var(--fw-600, 600);
  }
  .note {
    margin-top: -6px;
    font-size: var(--fs-caption);
    color: var(--text-3);
  }

  /* A tiny window in each look; "Match system" is half of each. */
  .window {
    position: relative;
    display: flex;
    width: 100%;
    aspect-ratio: 16 / 10;
    border-radius: var(--r-sm);
    overflow: hidden;
    box-shadow: 0 0 0 1px var(--hairline);
  }
  .half {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 9px 8px 0 30%;
  }
  .half.light {
    background: #ffffff;
    --ink: #d4d4d8;
    --side: #f2f2f4;
  }
  .half.dark {
    background: #1c1c1e;
    --ink: #48484a;
    --side: #2a2a2c;
  }
  .window.light .half.dark,
  .window.dark .half.light {
    display: none;
  }
  .window.system .half.dark .side {
    display: none;
  }
  .window.system .half.dark {
    padding-left: 8px;
  }
  .side {
    position: absolute;
    inset: 0 auto 0 0;
    width: 24%;
    background: var(--side);
  }
  .line {
    display: block;
    height: 5px;
    border-radius: 3px;
    background: var(--ink);
  }
  .line.short {
    width: 60%;
  }
  .accent {
    align-self: flex-start;
  }
  .sample {
    display: grid;
    place-items: center;
    height: 40px;
    font-size: 30px;
    line-height: 1;
    font-family: var(--font-ui);
  }
  .sample.serif {
    font-family: var(--font-serif);
  }
  .sample.mono {
    font-family: var(--font-mono);
    font-size: 27px;
  }

  .tips {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    margin: 28px 0 0;
    padding: 0;
    text-align: left;
  }
  .tips li {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 16px;
    border-radius: var(--r-lg);
    background: var(--bg-grouped);
    box-shadow: inset 0 0 0 1px var(--separator);
  }
  .keys {
    display: flex;
    justify-content: center;
    gap: 3px;
    width: 76px;
    flex: none;
  }
  .keys kbd {
    min-width: 26px;
    height: 26px;
    justify-content: center;
    font-size: 13px;
    background: var(--raised);
    box-shadow:
      0 0 0 0.5px var(--hairline),
      0 1px 0 var(--hairline);
    color: var(--text);
  }
  .home-ico {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
  }
  .tip {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--fs-footnote);
    line-height: 1.45;
    color: var(--text-2);
  }
  .tip strong {
    font-size: var(--fs-ui);
    font-weight: var(--fw-600, 600);
    color: var(--text);
  }
  .aside {
    margin: 18px 0 0;
    font-size: var(--fs-footnote);
    color: var(--text-3);
  }
  .aside kbd {
    margin: 0 1px;
  }
  .done-mark {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    margin-bottom: 22px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
  }

  .nav {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    padding: 18px 28px 26px;
    flex: none;
  }
  .nav-side {
    display: flex;
  }
  .nav-side.end {
    justify-content: flex-end;
  }
  .nav .btn {
    height: 38px;
    padding: 0 18px;
    gap: 6px;
  }
  .btn.ghost {
    padding: 0 12px;
    background: transparent;
    color: var(--text-2);
  }
  .btn.ghost:hover {
    background: var(--fill);
    color: var(--text);
  }
  .dots {
    display: flex;
    gap: 7px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--fill-3, var(--separator));
    transition:
      background-color var(--dur) var(--ease),
      width var(--dur) var(--ease);
  }
  .dot.past {
    background: var(--text-3);
  }
  .dot.on {
    width: 20px;
    border-radius: 4px;
    background: var(--text);
  }
</style>
