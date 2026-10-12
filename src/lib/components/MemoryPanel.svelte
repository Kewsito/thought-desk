<script lang="ts">
  /** Settings → Memory: how much RAM Thought Desk is using, live. */
  import { onMount } from 'svelte';
  import Switch from '../ui/Switch.svelte';
  import { memory } from '../memory.svelte';
  import { prefs } from '../prefs.svelte';

  onMount(() => memory.watch());

  const MB = 1024 * 1024;
  const mb = (n: number) => `${Math.round(n / MB)} MB`;
  const gb = (n: number) => `${Math.round((n / 1024 ** 3) * 10) / 10} GB`;

  const m = $derived(memory.current);
  const share = $derived(m && m.systemTotal ? (m.total / m.systemTotal) * 100 : 0);

  /** The last minute as a line: scaled to its own range, with headroom. */
  const W = 160;
  const H = 40;
  const spark = $derived.by(() => {
    const pts = memory.history;
    if (pts.length < 2) return null;
    const max = Math.max(...pts) * 1.05;
    const min = Math.min(...pts) * 0.95;
    const span = Math.max(1, max - min);
    const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - ((v - min) / span) * (H - 4) - 2]);
    const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return { line, area: `${line} L${W},${H} L0,${H} Z` };
  });

  const parts = $derived(
    m
      ? [
          { key: 'webview', label: 'Web view', note: `Draws the window and runs the editor · ${m.processes} process${m.processes === 1 ? '' : 'es'}`, bytes: m.webview },
          { key: 'app', label: 'App core', note: 'Database, files and reminders', bytes: m.app },
        ]
      : [],
  );
</script>

<h3 class="group-title">Memory</h3>
<div class="group">
  {#if m}
    <div class="group-row tall now">
      <div class="row-label">
        <span class="big">{mb(m.total)}</span>
        <small>{share < 0.1 ? 'under 0.1' : share.toFixed(1)}% of this computer’s {gb(m.systemTotal)} · peak {mb(memory.peak)}</small>
      </div>
      {#if spark}
        <svg class="spark" width={W} height={H} viewBox="0 0 {W} {H}" aria-label="Memory over the last minute" role="img">
          <path d={spark.area} class="area" />
          <path d={spark.line} class="line" />
        </svg>
      {/if}
    </div>
    <div class="group-row stack parts">
      <div class="bar" aria-hidden="true">
        {#each parts as p (p.key)}
          <span class="seg {p.key}" style:flex-grow={p.bytes}></span>
        {/each}
      </div>
      {#each parts as p (p.key)}
        <div class="part">
          <span class="swatch {p.key}"></span>
          <span class="part-label">{p.label}<small>{p.note}</small></span>
          <span class="part-value">{mb(p.bytes)}</span>
        </div>
      {/each}
      {#if m.jsHeap}
        <div class="part sub">
          <span class="swatch none"></span>
          <span class="part-label">Page scripts<small>Part of the web view: open pages, lists and the editor</small></span>
          <span class="part-value">{mb(m.jsHeap)}</span>
        </div>
      {/if}
    </div>
  {:else}
    <div class="group-row"><div class="row-label"><small>Measuring…</small></div></div>
  {/if}
  <div class="group-row">
    <div class="row-label">
      Show in sidebar
      <small>Keep an eye on it while you work</small>
    </div>
    <Switch on={prefs.showMemory} label="Show memory in sidebar" onchange={() => (prefs.showMemory = !prefs.showMemory)} />
  </div>
</div>
<p class="group-note">Measured the way Task Manager does (working set), every two seconds. Minimizing the window frees most of the web view’s share.</p>

<style>
  .now {
    gap: 24px;
  }
  .big {
    font-size: 24px;
    line-height: 32px;
    font-weight: var(--fw-700);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .spark {
    flex: none;
    overflow: visible;
  }
  .spark .line {
    fill: none;
    stroke: var(--tint);
    stroke-width: 1.5;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .spark .area {
    fill: color-mix(in srgb, var(--tint) 12%, transparent);
  }
  .parts {
    gap: 10px;
  }
  .bar {
    display: flex;
    gap: 2px;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
  }
  .seg {
    flex-basis: 0;
    min-width: 4px;
    transition: flex-grow var(--dur-slow) var(--ease);
  }
  .webview {
    background: var(--tint);
  }
  .app {
    background: color-mix(in srgb, var(--tint) 40%, var(--fill-3));
  }
  .part {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .part.sub {
    padding-left: 18px;
  }
  .swatch {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
  .swatch.none {
    display: none;
  }
  .part-label {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    font-size: var(--fs-body-ui);
    font-weight: var(--fw-500);
  }
  .part-label small {
    font-size: var(--fs-footnote);
    font-weight: var(--fw-400);
    color: var(--text-3);
  }
  .part-value {
    font-size: var(--fs-body-ui);
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }
</style>
