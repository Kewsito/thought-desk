<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import AssignmentRow from '../ui/AssignmentRow.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import EventRow from '../ui/EventRow.svelte';
  import FileTile from '../ui/FileTile.svelte';
  import { clock } from '../clock.svelte';
  import { PALETTE, colorVar } from '../colors';
  import { addDays, occurrences } from '../dates';
  import { library } from '../library.svelte';
  import { planner } from '../planner.svelte';
  import { store } from '../store.svelte';
  import { formatBytes, relativeTime } from '../time';
  import { ui } from '../ui.svelte';
  import type { CoursePatch, FileMeta } from '../types';

  let { id }: { id: string } = $props();

  const course = $derived(planner.courseById.get(id));
  const folder = $derived.by(() => {
    const p = course?.pageId ? store.byId.get(course.pageId) : undefined;
    return p && !p.deletedAt ? p : undefined;
  });

  /** This course's classes and events over the next two weeks. */
  const upcoming = $derived.by(() => {
    const last = addDays(clock.today, 13);
    return planner.liveEvents
      .filter((e) => e.courseId === id)
      .flatMap((e) => occurrences(e, clock.today, last))
      .sort((a, b) => a.start.localeCompare(b.start) || (a.event.startTime ?? '').localeCompare(b.event.startTime ?? ''))
      .slice(0, 6);
  });
  const thisWeek = $derived(upcoming.filter((o) => o.start <= addDays(clock.today, 6)).length);

  const assignments = $derived(planner.live.filter((a) => a.courseId === id));
  const open = $derived(assignments.filter((a) => a.status !== 'done'));
  const done = $derived(assignments.length - open.length);

  const notes = $derived(folder ? (store.childrenMap.get(folder.id) ?? []) : []);

  /** Files attached to this course's assignments. */
  const files = $derived.by(() => {
    const seen = new Map<string, FileMeta>();
    for (const a of assignments) {
      for (const fid of a.fileIds) {
        const f = library.byId.get(fid);
        if (f && !f.deletedAt) seen.set(f.id, f);
      }
    }
    return [...seen.values()].sort((a, b) => b.createdAt - a.createdAt);
  });

  const summary = $derived.by(() => {
    const parts: string[] = [];
    if (course?.teacher) parts.push(course.teacher);
    parts.push(thisWeek ? `${thisWeek} class${thisWeek === 1 ? '' : 'es'} this week` : 'No classes this week');
    parts.push(open.length ? `${open.length} open assignment${open.length === 1 ? '' : 's'}` : 'All caught up');
    return parts.join(' · ');
  });

  const details: { key: keyof CoursePatch & ('teacher' | 'email' | 'officeHours' | 'room'); label: string; icon: string; placeholder: string }[] = [
    { key: 'teacher', label: 'Teacher', icon: 'user', placeholder: 'Add name' },
    { key: 'email', label: 'Email', icon: 'mail', placeholder: 'Add email' },
    { key: 'officeHours', label: 'Office hours', icon: 'clock', placeholder: 'Add hours' },
    { key: 'room', label: 'Room', icon: 'map-pin', placeholder: 'Add room' },
  ];

  function menu(e: MouseEvent) {
    const c = course;
    if (!c) return;
    ui.openMenuAt(
      e.currentTarget as Element,
      [
        {
          label: 'Rename…',
          icon: 'pencil',
          action: async () => {
            const res = await ui.prompt({ title: 'Rename Course', value: c.name, confirmLabel: 'Rename', icon: 'book' });
            if (res) planner.updateCourse(c.id, { name: res.value });
          },
        },
        { label: folder ? 'Open Notes Folder' : 'Create Notes Folder', icon: 'folder', action: () => void openFolder() },
        { separator: true },
        { header: 'Color' },
        ...PALETTE.map((p) => ({
          label: p.label,
          dot: colorVar(p.key),
          checked: c.color === p.key,
          action: () => planner.updateCourse(c.id, { color: p.key }),
        })),
        { separator: true },
        { label: 'Delete Course', icon: 'trash', danger: true, action: () => void planner.deleteCourse(c.id) },
      ],
      { alignRight: true },
    );
  }

  async function openFolder() {
    const pageId = await planner.courseFolder(id);
    if (pageId) store.open(pageId);
  }
</script>

{#if course}
  <div class="view course">
    <header class="view-head">
      <div>
        <div class="eyebrow">Course</div>
        <h1 class="view-title"><span class="course-dot" style:--c={colorVar(course.color)}></span>{course.name || 'Untitled'}</h1>
        <p class="view-sub">{summary}</p>
      </div>
      <div class="view-actions">
        <button class="icon-btn" onclick={menu} data-tip="Course options" aria-label="Course options"><Icon name="more" /></button>
        <button class="btn" onclick={() => planner.newAssignment({ courseId: id })}><Icon name="plus" size={15} stroke={2.2} /> Assignment</button>
        <button class="btn primary" onclick={() => void planner.courseNotes(id)}><Icon name="note" size={15} stroke={2} /> Take Notes</button>
      </div>
    </header>

    <div class="columns">
      <div class="col">
        <section>
          <h2 class="group-title">
            <span>Up Next</span>
            <button class="see-all" onclick={() => planner.newEvent({ courseId: id })}>Add Class <Icon name="plus" size={12} stroke={2.2} /></button>
          </h2>
          {#if upcoming.length}
            <div class="group">
              {#each upcoming as occ (occ.key)}
                <EventRow {occ} showDate />
              {/each}
            </div>
          {:else}
            <div class="group">
              <EmptyState compact icon="calendar" title="No classes in the next two weeks" text="Add the class schedule, or import it from your school's calendar." />
            </div>
          {/if}
        </section>

        <section>
          <h2 class="group-title">
            <span>Assignments</span>
            <span class="count">{done ? `${done} done` : ''}</span>
          </h2>
          {#if open.length}
            <div class="group">
              {#each open as a (a.id)}
                <AssignmentRow {a} showCourse={false} />
              {/each}
            </div>
          {:else}
            <div class="group">
              <EmptyState compact icon="assignment" title="Nothing open" text="Assignments for this course show up here." />
            </div>
          {/if}
        </section>
      </div>

      <div class="col">
        <section>
          <h2 class="group-title"><span>Details</span></h2>
          <div class="group">
            {#each details as d (d.key)}
              <div class="group-row compact detail">
                <span class="detail-icon"><Icon name={d.icon} size={15} /></span>
                <span class="detail-label">{d.label}</span>
                <label class="field">
                  <input
                    value={course[d.key]}
                    placeholder={d.placeholder}
                    spellcheck="false"
                    aria-label={d.label}
                    oninput={(e) => planner.updateCourse(id, { [d.key]: e.currentTarget.value }, { typing: true })}
                  />
                </label>
              </div>
            {/each}
          </div>
        </section>

        <section>
          <h2 class="group-title">
            <span>Notes</span>
            <button class="see-all" onclick={() => void planner.newCourseNote(id)}>New Note <Icon name="plus" size={12} stroke={2.2} /></button>
          </h2>
          <div class="group">
            {#each notes.slice(0, 8) as p (p.id)}
              <button class="group-row compact link-row" onclick={() => store.open(p.id)}>
                <span class="page-icon">{#if p.icon}{p.icon}{:else}<Icon name="page" size={16} />{/if}</span>
                <span class="page-title">{p.title || 'Untitled'}</span>
                <span class="meta">{relativeTime(p.updatedAt)}</span>
              </button>
            {:else}
              <EmptyState compact icon="note" title="No notes yet" text="Take Notes in class and each lecture lands here, dated." />
            {/each}
            {#if notes.length > 8}
              <button class="group-row compact link-row more" onclick={() => folder && store.open(folder.id)}>
                <span class="page-icon"><Icon name="folder" size={16} /></span>
                <span class="page-title">All {notes.length} notes</span>
                <Icon name="chevron-right" size={12} stroke={2.2} />
              </button>
            {/if}
          </div>
        </section>

        {#if files.length}
          <section>
            <h2 class="group-title"><span>Files</span><span class="count">{files.length}</span></h2>
            <div class="group">
              {#each files.slice(0, 6) as f (f.id)}
                <button class="group-row compact link-row" onclick={() => library.preview(f.id)}>
                  <FileTile file={f} size={24} />
                  <span class="page-title">{f.name}</span>
                  <span class="meta">{formatBytes(f.size)}</span>
                </button>
              {/each}
            </div>
          </section>
        {/if}
      </div>
    </div>
  </div>
{:else}
  <div class="view">
    <EmptyState icon="book" title="This course was deleted" text="Its assignments, events and notes are still in their places." />
  </div>
{/if}

<style>
  .course-dot {
    display: inline-block;
    width: 14px;
    height: 14px;
    margin: 0 12px 4px 2px;
    border-radius: 50%;
    background: var(--c);
    vertical-align: middle;
  }
  .col > section + section {
    margin-top: 24px;
  }
  .columns {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 0 32px;
    align-items: start;
  }
  .see-all {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: var(--h-xs);
    padding: 0 6px 0 8px;
    margin-right: -6px;
    border-radius: var(--r-xs);
    font-size: var(--fs-footnote);
    font-weight: var(--fw-500);
    color: var(--text-3);
    transition:
      background-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }
  .see-all:hover {
    background: var(--fill);
    color: var(--text);
  }
  .count {
    font-weight: var(--fw-500);
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }

  .detail {
    justify-content: flex-start;
    gap: 12px;
  }
  .detail-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    color: var(--text-3);
  }
  .detail-label {
    flex: none;
    width: 96px;
    font-size: var(--fs-body-ui);
    font-weight: var(--fw-500);
    color: var(--text);
  }
  .detail .field {
    flex: 1;
  }

  .link-row {
    width: 100%;
    justify-content: flex-start;
    gap: 12px;
    text-align: left;
    transition: background-color var(--dur-fast) var(--ease);
  }
  .link-row:hover {
    background: var(--fill);
  }
  .group > .link-row:first-child {
    border-top-left-radius: var(--r-md);
    border-top-right-radius: var(--r-md);
  }
  .group > .link-row:last-child {
    border-bottom-left-radius: var(--r-md);
    border-bottom-right-radius: var(--r-md);
  }
  .page-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    font-size: 16px;
    color: var(--text-3);
  }
  .page-title {
    flex: 1;
    min-width: 0;
    font-size: var(--fs-body-ui);
    font-weight: var(--fw-500);
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .more {
    color: var(--text-3);
  }
  .more .page-title {
    color: var(--text-2);
  }
  .meta {
    flex: none;
    font-size: var(--fs-footnote);
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 980px) {
    .columns {
      grid-template-columns: minmax(0, 1fr);
    }
    .columns > .col + .col {
      margin-top: 24px;
    }
  }
</style>
