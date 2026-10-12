/** Courses, assignments and calendar events, and every action on them. */

import { api } from './api';
import { Autosave } from './autosave';
import { colorVar, nextColor } from './colors';
import { clock } from './clock.svelte';
import { addDays } from './dates';
import { store } from './store.svelte';
import { ui } from './ui.svelte';
import type { Assignment, AssignmentPatch, CalEvent, Course, EventPatch } from './types';

const byDue = (a: Assignment, b: Assignment) =>
  (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
  (a.dueTime ?? '24:00').localeCompare(b.dueTime ?? '24:00') ||
  b.priority - a.priority ||
  a.createdAt - b.createdAt;

class Planner {
  courses = $state<Course[]>([]);
  assignments = $state<Assignment[]>([]);
  events = $state<CalEvent[]>([]);
  loaded = $state(false);

  courseById = $derived(new Map(this.courses.map((c) => [c.id, c])));
  assignmentById = $derived(new Map(this.assignments.map((a) => [a.id, a])));
  eventById = $derived(new Map(this.events.map((e) => [e.id, e])));

  /** Live assignments, soonest due first. */
  live = $derived(this.assignments.filter((a) => !a.deletedAt).sort(byDue));
  liveEvents = $derived(this.events.filter((e) => !e.deletedAt));

  /** Open assignments that are overdue or due within a week (sidebar badge). */
  dueSoon = $derived.by(() => {
    const horizon = addDays(clock.today, 7);
    return this.live.filter((a) => a.status !== 'done' && a.dueDate !== null && a.dueDate <= horizon);
  });

  /** Live assignments keyed by due date, for the calendar. */
  dueByDate = $derived.by(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of this.live) {
      if (!a.dueDate) continue;
      let list = map.get(a.dueDate);
      if (!list) map.set(a.dueDate, (list = []));
      list.push(a);
    }
    return map;
  });

  #assignmentSaver = new Autosave<AssignmentPatch, Assignment>(
    (id, patch) => api.updateAssignment(id, patch),
    (id, saved) => {
      const a = this.assignmentById.get(id);
      if (!a) return;
      a.updatedAt = saved.updatedAt;
      a.completedAt = saved.completedAt;
      if (!this.#assignmentSaver.has(id)) a.fileIds = saved.fileIds;
    },
    (id, e) => this.assignmentById.has(id) && ui.error(e),
  );

  #eventSaver = new Autosave<EventPatch, CalEvent>(
    (id, patch) => api.updateEvent(id, patch),
    (id, saved) => {
      const e = this.eventById.get(id);
      if (!e || this.#eventSaver.has(id)) return;
      // The backend normalizes ranges (end never before start), so take its word.
      Object.assign(e, saved);
    },
    (id, e) => this.eventById.has(id) && ui.error(e),
  );

  async load() {
    const [courses, assignments, events] = await Promise.all([
      api.listCourses(),
      api.listAssignments(),
      api.listEvents(),
    ]);
    this.courses = courses;
    this.assignments = assignments;
    this.events = events;
    this.loaded = true;
  }

  flush() {
    return Promise.all([this.#assignmentSaver.flush(), this.#eventSaver.flush()]);
  }

  // ------------------------------------------------------------- colours

  courseColor(courseId: string | null | undefined): string {
    const c = courseId ? this.courseById.get(courseId) : undefined;
    return c ? colorVar(c.color) : 'var(--accent)';
  }

  eventColor(e: CalEvent): string {
    return e.color ? colorVar(e.color) : this.courseColor(e.courseId);
  }

  // ------------------------------------------------------------- courses

  async addCourse(name: string, color?: string): Promise<Course | null> {
    try {
      const course = await api.createCourse(name, color ?? nextColor(this.courses.map((c) => c.color)));
      this.courses.push(course);
      return course;
    } catch (e) {
      ui.error(e);
      return null;
    }
  }

  async updateCourse(id: string, patch: { name?: string; color?: string }) {
    const c = this.courseById.get(id);
    if (c) Object.assign(c, patch);
    try {
      await api.updateCourse(id, patch);
    } catch (e) {
      ui.error(e);
    }
  }

  async deleteCourse(id: string) {
    const c = this.courseById.get(id);
    if (!c) return;
    const used = this.live.filter((a) => a.courseId === id).length + this.liveEvents.filter((e) => e.courseId === id).length;
    const ok = await ui.confirm({
      title: 'Delete Course?',
      message: used
        ? `“${c.name}” will be removed from ${used} item${used === 1 ? '' : 's'}. The assignments and events stay.`
        : `“${c.name}” will be deleted.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteCourse(id);
      this.courses = this.courses.filter((x) => x.id !== id);
      for (const a of this.assignments) if (a.courseId === id) a.courseId = null;
      for (const e of this.events) if (e.courseId === id) e.courseId = null;
    } catch (e) {
      ui.error(e);
    }
  }

  // ---------------------------------------------------------- assignments

  /** Opens the sheet for a new assignment, prefilled with `draft`. */
  newAssignment(draft: AssignmentPatch = {}) {
    ui.assignmentSheet = { id: null, draft };
  }

  openAssignment(id: string) {
    if (this.assignmentById.get(id)?.deletedAt) return;
    ui.assignmentSheet = { id, draft: {} };
  }

  async addAssignment(input: AssignmentPatch): Promise<Assignment | null> {
    try {
      const a = await api.createAssignment(input);
      this.assignments.push(a);
      return a;
    } catch (e) {
      ui.error(e);
      return null;
    }
  }

  updateAssignment(id: string, patch: AssignmentPatch, { immediate = false } = {}) {
    const a = this.assignmentById.get(id);
    if (!a) return;
    if (patch.status !== undefined && patch.status !== a.status) {
      a.completedAt = patch.status === 'done' ? Date.now() : null;
    }
    if (patch.dueDate === null) patch = { ...patch, dueTime: null };
    Object.assign(a, patch);
    this.#assignmentSaver.queue(id, patch, immediate);
  }

  toggleDone(id: string) {
    const a = this.assignmentById.get(id);
    if (a) this.updateAssignment(id, { status: a.status === 'done' ? 'todo' : 'done' }, { immediate: true });
  }

  // --------------------------------------------------------------- events

  newEvent(draft: EventPatch = {}) {
    ui.eventSheet = { id: null, draft };
  }

  openEvent(id: string) {
    if (this.eventById.get(id)?.deletedAt) return;
    ui.eventSheet = { id, draft: {} };
  }

  async addEvent(input: EventPatch): Promise<CalEvent | null> {
    try {
      const ev = await api.createEvent(input);
      this.events.push(ev);
      return ev;
    } catch (e) {
      ui.error(e);
      return null;
    }
  }

  updateEvent(id: string, patch: EventPatch, { immediate = false } = {}) {
    const ev = this.eventById.get(id);
    if (!ev) return;
    Object.assign(ev, patch);
    this.#eventSaver.queue(id, patch, immediate);
  }

  // ---------------------------------------------------------------- trash

  async trash(kind: 'assignments' | 'events', id: string) {
    const item = kind === 'assignments' ? this.assignmentById.get(id) : this.eventById.get(id);
    if (!item) return;
    try {
      await this.flush();
      item.deletedAt = await api.trashItem(kind, id);
      if (ui.assignmentSheet?.id === id) ui.assignmentSheet = null;
      if (ui.eventSheet?.id === id) ui.eventSheet = null;
      ui.toast(`Moved “${item.title || 'Untitled'}” to Trash`, { label: 'Undo', run: () => void this.restore(kind, id) });
    } catch (e) {
      ui.error(e);
    }
  }

  async restore(kind: 'assignments' | 'events', id: string) {
    try {
      await api.restoreItem(kind, id);
      const item = kind === 'assignments' ? this.assignmentById.get(id) : this.eventById.get(id);
      if (item) item.deletedAt = null;
    } catch (e) {
      ui.error(e);
    }
  }

  /** Permanently deletes (from the Trash; the caller confirms). */
  async deleteForever(kind: 'assignments' | 'events', id: string) {
    try {
      await api.deleteItem(kind, id);
      if (kind === 'assignments') this.assignments = this.assignments.filter((a) => a.id !== id);
      else this.events = this.events.filter((e) => e.id !== id);
    } catch (e) {
      ui.error(e);
    }
  }

  // ----------------------------------------------------------- notes pages

  /**
   * Creates a page for longer notes, starting with a link back to the
   * assignment or event, and links it. Returns the new page id.
   */
  async createNotesPage(kind: 'assignment' | 'event', id: string): Promise<string | null> {
    const item = kind === 'assignment' ? this.assignmentById.get(id) : this.eventById.get(id);
    if (!item) return null;
    const meta = await store.create(null, {
      open: false,
      title: item.title || 'Untitled',
      icon: kind === 'assignment' ? '📝' : '🗓️',
    });
    if (!meta) return null;
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: kind === 'assignment' ? 'Notes for ' : 'Notes from ' },
            { type: 'mention', attrs: { id, kind } },
          ],
        },
        { type: 'paragraph' },
      ],
    };
    store.update(meta.id, { content: JSON.stringify(doc), text: `Notes for ${item.title}` }, { immediate: true });
    if (kind === 'assignment') this.updateAssignment(id, { pageId: meta.id }, { immediate: true });
    else this.updateEvent(id, { pageId: meta.id }, { immediate: true });
    return meta.id;
  }
}

export const planner = new Planner();
