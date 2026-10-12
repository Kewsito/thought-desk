/**
 * In-memory stand-in for the Rust backend, used only when the UI runs in a
 * plain browser during development (`npm run dev`). Never bundled in builds.
 */

import { mockConvertFileSrc, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import type { Assignment, CalEvent, Course, FileMeta, PageMeta } from './lib/types';

type Row = PageMeta & { content: string; text: string };

const KEY = 'thoughtdesk.devmock.v2';
const load = (): Row[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '') as Row[];
  } catch {
    return [];
  }
};
let rows: Row[] = load();
const persist = () => localStorage.setItem(KEY, JSON.stringify(rows));

function make(parentId: string | null, title = '', icon = '', content = ''): Row {
  const ts = Date.now();
  return {
    id: crypto.randomUUID(),
    parentId,
    title,
    icon,
    position: 0,
    favorite: 0,
    fullWidth: false,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    content,
    text: '',
  };
}

function place(id: string, parentId: string | null, index: number | null) {
  const sibs = rows
    .filter((r) => r.parentId === parentId && r.id !== id && !r.deletedAt)
    .sort((a, b) => a.position - b.position);
  const me = rows.find((r) => r.id === id)!;
  sibs.splice(index === null ? sibs.length : Math.min(index, sibs.length), 0, me);
  sibs.forEach((r, i) => (r.position = i));
}

const subtree = (id: string, pred: (r: Row) => boolean = () => true): Row[] => {
  const out: Row[] = [];
  const walk = (pid: string) => {
    for (const r of rows.filter((x) => x.parentId === pid && pred(x))) {
      out.push(r);
      walk(r.id);
    }
  };
  const root = rows.find((r) => r.id === id);
  if (root) {
    out.push(root);
    walk(id);
  }
  return out;
};

const meta = ({ content: _c, text: _t, ...m }: Row): PageMeta => m;

if (rows.length === 0) {
  const welcome = make(
    null,
    'Getting started',
    '👋',
    '<p>This is the <strong>browser preview</strong> with an in-memory backend.</p><h2>Try it</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Open this page</p></li><li data-type="taskItem" data-checked="false"><p>Type <code>/</code> for blocks</p></li></ul><div data-callout="" data-icon="💡"><p>Callouts hold any blocks.</p></div><p></p>',
  );
  rows.push(welcome);
  const projects = make(null, 'Projects', '🗂️');
  projects.position = 1;
  rows.push(projects);
  const child = make(projects.id, 'Roadmap', '🧭');
  rows.push(child);
  const notes = make(projects.id, 'Meeting notes');
  notes.position = 1;
  rows.push(notes);
  // Every block type on one page, for design review.
  const showcase = make(
    null,
    'Design review',
    '🎨',
    `<p>Thought Desk is a <strong>quiet place</strong> to write. Text can be <em>italic</em>, <u>underlined</u>, <s>struck</s>, <code>inline code</code>, <mark>highlighted</mark> or a <a href="https://example.com">link</a>. Long paragraphs should wrap with a comfortable measure and an even rhythm from line to line, without orphans.</p>
<h1>Heading one</h1>
<p>Body text directly after a heading.</p>
<h2>Heading two</h2>
<ul><li><p>Bulleted item</p><ul><li><p>Nested item</p><ul><li><p>Third level</p></li></ul></li></ul></li><li><p>Another item</p></li></ul>
<ol><li><p>First step</p></li><li><p>Second step</p></li><li><p>Third step</p></li></ol>
<h3>Heading three</h3>
<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>A finished task</p></li><li data-type="taskItem" data-checked="false"><p>Something still to do</p></li></ul>
<blockquote><p>Simplicity is the ultimate sophistication.</p></blockquote>
<div data-callout="" data-icon="💡"><p>Callouts hold any blocks and draw the eye to what matters.</p></div>
<details open=""><summary>A toggle that is open</summary><div data-type="detailsContent"><p>Hidden content, revealed.</p></div></details>
<pre><code>fn main() {
    println!("Hello, Thought Desk");
}</code></pre>
<hr>
<table><tbody><tr><th><p>Name</p></th><th><p>Status</p></th><th><p>Due</p></th></tr><tr><td><p>Launch</p></td><td><p>In progress</p></td><td><p>Oct 20</p></td></tr><tr><td><p>Docs</p></td><td><p>Done</p></td><td><p>Oct 12</p></td></tr></tbody></table>
<p></p>`,
  );
  showcase.position = 2;
  showcase.favorite = Date.now();
  rows.push(showcase);
  persist();
}

// ------------------------------------------------- planner and file library

interface PlannerData {
  courses: Course[];
  assignments: Assignment[];
  events: CalEvent[];
  files: FileMeta[];
}
const PLANNER_KEY = 'thoughtdesk.devmock.planner.v1';
const BLOBS_KEY = 'thoughtdesk.devmock.blobs.v1';
const iso = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const loadPlanner = (): PlannerData | null => {
  try {
    return JSON.parse(localStorage.getItem(PLANNER_KEY) ?? '') as PlannerData;
  } catch {
    return null;
  }
};
/** File bytes as data URLs, keyed by stored name (stands in for the files/ folder). */
const blobs: Record<string, string> = (() => {
  try {
    return JSON.parse(localStorage.getItem(BLOBS_KEY) ?? '{}');
  } catch {
    return {};
  }
})();
const persistBlobs = () => {
  try {
    localStorage.setItem(BLOBS_KEY, JSON.stringify(blobs));
  } catch {
    /* over quota: files just won't survive a reload */
  }
};

let planner: PlannerData = loadPlanner() ?? seedPlanner();
const persistPlanner = () => localStorage.setItem(PLANNER_KEY, JSON.stringify(planner));

function seedPlanner(): PlannerData {
  const ts = Date.now();
  const course = (name: string, color: string, position: number): Course => ({ id: crypto.randomUUID(), name, color, position, createdAt: ts });
  const bio = course('Biology', 'green', 0);
  const hist = course('History', 'orange', 1);
  const cs = course('Computer Science', 'blue', 2);
  const assignment = (title: string, c: Course | null, dueDate: string | null, extra: Partial<Assignment> = {}): Assignment => ({
    id: crypto.randomUUID(),
    title,
    courseId: c?.id ?? null,
    dueDate,
    dueTime: null,
    status: 'todo',
    priority: 0,
    notes: '',
    pageId: null,
    fileIds: [],
    createdAt: ts,
    updatedAt: ts,
    completedAt: null,
    deletedAt: null,
    ...extra,
  });
  const event = (title: string, startDate: string, startTime: string | null, endTime: string | null, extra: Partial<CalEvent> = {}): CalEvent => ({
    id: crypto.randomUUID(),
    title,
    startDate,
    startTime,
    endDate: startDate,
    endTime,
    color: '',
    courseId: null,
    location: '',
    notes: '',
    repeat: 'none',
    repeatUntil: null,
    pageId: null,
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    ...extra,
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="#e8f5e9"/><circle cx="320" cy="210" r="120" fill="#34c759" opacity=".35"/><circle cx="320" cy="210" r="60" fill="#34c759"/><text x="320" y="390" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#1d1d1f">Plant cell</text></svg>`;
  const text = 'Week 1 — Introduction\nWeek 2 — Cells\nWeek 3 — Genetics\nMidterm in week 7.';
  const file = (name: string, mime: string, data: string): FileMeta => {
    const stored = `${crypto.randomUUID().replace(/-/g, '')}.${name.split('.').pop()}`;
    blobs[stored] = data;
    return { id: crypto.randomUUID(), name, stored, mime, size: data.length, createdAt: ts, updatedAt: ts, deletedAt: null, missing: false };
  };
  const diagram = file('Plant cell.svg', 'image/svg+xml', `data:image/svg+xml;base64,${btoa(svg)}`);
  const syllabus = file('Biology syllabus.txt', 'text/plain', `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`);
  persistBlobs();
  return {
    courses: [bio, hist, cs],
    assignments: [
      assignment('Lab report: osmosis', bio, iso(1), { dueTime: '23:59', priority: 3, status: 'doing', fileIds: [diagram.id] }),
      assignment('Read chapter 4', hist, iso(0), { priority: 1 }),
      assignment('Problem set 3', cs, iso(4), { dueTime: '17:00', priority: 2 }),
      assignment('Essay outline', hist, iso(-1)),
      assignment('Group project proposal', cs, iso(9)),
      assignment('Flashcards for quiz', bio, null),
      assignment('Weekly reflection', null, iso(-3), { status: 'done', completedAt: ts }),
    ],
    events: [
      event('Biology lecture', iso(-2), '09:00', '10:30', { courseId: bio.id, repeat: 'weekly', location: 'Hall B' }),
      event('History seminar', iso(-1), '13:00', '14:00', { courseId: hist.id, repeat: 'weekly' }),
      event('Study group', iso(1), '16:00', '18:00', { color: 'purple', location: 'Library' }),
      event('Midterm exam', iso(6), '10:00', '12:00', { courseId: cs.id }),
      event('Spring break', iso(12), null, null, { endDate: iso(16), color: 'teal' }),
    ],
    files: [diagram, syllabus],
  };
}

const patchFields = <T extends object>(target: T, patch: Record<string, any>, keys: (keyof T)[]) => {
  for (const k of keys) if (patch[k as string] !== undefined) (target as any)[k] = patch[k as string];
};

mockWindows('main');
mockConvertFileSrc('windows');
{
  const internals = (window as any).__TAURI_INTERNALS__;
  const convert = internals.convertFileSrc;
  internals.convertFileSrc = (path: string, protocol: string) => blobs[path] ?? convert(path, protocol);
}
mockIPC((cmd, payload) => {
  const a = (payload ?? {}) as Record<string, any>;
  const find = (id: string) => {
    const r = rows.find((x) => x.id === id);
    if (!r) throw 'Page not found';
    return r;
  };
  try {
    switch (cmd) {
      case 'list_pages':
        return rows.map(meta);
      case 'get_page':
        return { ...find(a.id) };
      case 'create_page': {
        const r = make(a.parentId ?? null, a.title ?? '', a.icon ?? '');
        rows.push(r);
        place(r.id, r.parentId, a.index ?? null);
        return meta(r);
      }
      case 'update_page': {
        const r = find(a.id);
        const p = a.patch ?? {};
        if (p.title !== undefined) r.title = p.title;
        if (p.icon !== undefined) r.icon = p.icon;
        if (p.content !== undefined) r.content = p.content;
        if (p.text !== undefined) r.text = p.text;
        if (p.favorite !== undefined) r.favorite = p.favorite ? Date.now() : 0;
        if (p.fullWidth !== undefined) r.fullWidth = p.fullWidth;
        if (p.title !== undefined || p.icon !== undefined || p.content !== undefined) r.updatedAt = Date.now();
        return r.updatedAt;
      }
      case 'move_page': {
        const r = find(a.id);
        const old = r.parentId;
        r.parentId = a.parentId ?? null;
        place(r.id, r.parentId, a.index);
        rows.filter((x) => x.parentId === old && !x.deletedAt).sort((x, y) => x.position - y.position).forEach((x, i) => (x.position = i));
        return null;
      }
      case 'duplicate_page': {
        const src = find(a.id);
        const copy = { ...src, id: crypto.randomUUID(), title: src.title ? `${src.title} (copy)` : '', favorite: 0 };
        rows.push(copy);
        place(copy.id, copy.parentId, src.position + 1);
        return meta(copy);
      }
      case 'trash_page': {
        const ts = Date.now();
        for (const r of subtree(a.id, (x) => !x.deletedAt)) if (!r.deletedAt) r.deletedAt = ts;
        return ts;
      }
      case 'restore_page': {
        const r = find(a.id);
        const ts = r.deletedAt;
        for (const x of subtree(a.id, (y) => y.deletedAt === ts)) x.deletedAt = null;
        const parent = rows.find((x) => x.id === r.parentId);
        if (parent?.deletedAt) r.parentId = null;
        place(r.id, r.parentId, null);
        return null;
      }
      case 'delete_page': {
        const gone = new Set(subtree(a.id).map((r) => r.id));
        rows = rows.filter((r) => !gone.has(r.id));
        return null;
      }
      case 'empty_trash':
        rows = rows.filter((r) => !r.deletedAt);
        planner.assignments = planner.assignments.filter((x) => !x.deletedAt);
        planner.events = planner.events.filter((x) => !x.deletedAt);
        for (const f of planner.files.filter((x) => x.deletedAt)) delete blobs[f.stored];
        planner.files = planner.files.filter((x) => !x.deletedAt);
        persistBlobs();
        return null;
      case 'list_courses':
        return planner.courses;
      case 'create_course': {
        const c: Course = { id: crypto.randomUUID(), name: a.name, color: a.color, position: planner.courses.length, createdAt: Date.now() };
        planner.courses.push(c);
        return c;
      }
      case 'update_course': {
        const c = planner.courses.find((x) => x.id === a.id)!;
        patchFields(c, a.patch, ['name', 'color']);
        return c;
      }
      case 'delete_course':
        planner.courses = planner.courses.filter((x) => x.id !== a.id);
        for (const x of [...planner.assignments, ...planner.events]) if (x.courseId === a.id) x.courseId = null;
        return null;
      case 'list_assignments':
        return planner.assignments;
      case 'create_assignment':
      case 'update_assignment': {
        let x = planner.assignments.find((y) => y.id === a.id);
        const p = (a.patch ?? a.input) as Record<string, any>;
        if (!x) {
          const ts = Date.now();
          x = { id: crypto.randomUUID(), title: '', courseId: null, dueDate: null, dueTime: null, status: 'todo', priority: 0, notes: '', pageId: null, fileIds: [], createdAt: ts, updatedAt: ts, completedAt: null, deletedAt: null };
          planner.assignments.push(x);
        }
        if (p.status !== undefined && p.status !== x.status) x.completedAt = p.status === 'done' ? Date.now() : null;
        patchFields(x, p, ['title', 'courseId', 'dueDate', 'dueTime', 'status', 'priority', 'notes', 'pageId', 'fileIds']);
        if (!x.dueDate) x.dueTime = null;
        x.fileIds = x.fileIds.filter((id) => planner.files.some((f) => f.id === id));
        x.updatedAt = Date.now();
        return x;
      }
      case 'list_events':
        return planner.events;
      case 'create_event':
      case 'update_event': {
        let x = planner.events.find((y) => y.id === a.id);
        const p = (a.patch ?? a.input) as Record<string, any>;
        if (!x) {
          const ts = Date.now();
          x = { id: crypto.randomUUID(), title: '', startDate: p.startDate, startTime: null, endDate: p.startDate, endTime: null, color: '', courseId: null, location: '', notes: '', repeat: 'none', repeatUntil: null, pageId: null, createdAt: ts, updatedAt: ts, deletedAt: null };
          planner.events.push(x);
        }
        patchFields(x, p, ['title', 'startDate', 'startTime', 'endDate', 'endTime', 'color', 'courseId', 'location', 'notes', 'repeat', 'repeatUntil', 'pageId']);
        if (x.endDate < x.startDate) x.endDate = x.startDate;
        if (!x.startTime) x.endTime = null;
        else if (!x.endTime || (x.endDate === x.startDate && x.endTime < x.startTime)) x.endTime = x.startTime;
        x.updatedAt = Date.now();
        return { ...x };
      }
      case 'list_files':
        return planner.files.map((f) => ({ ...f, missing: !blobs[f.stored] }));
      case 'update_file': {
        const f = planner.files.find((x) => x.id === a.id)!;
        if (a.patch?.name) f.name = a.patch.name;
        return f;
      }
      case 'file_usage':
        return planner.files
          .filter((f) => !f.deletedAt)
          .map((f) => ({ fileId: f.id, pageIds: rows.filter((r) => !r.deletedAt && (r.content.includes(f.id) || r.content.includes(f.stored))).map((r) => r.id) }))
          .filter((u) => u.pageIds.length);
      case 'open_file':
      case 'reveal_file':
        console.info(`[dev] ${cmd}`, a.id);
        return null;
      case 'export_file':
        return `C:\\Downloads\\${planner.files.find((f) => f.id === a.id)?.name}`;
      case 'trash_item':
      case 'restore_item':
      case 'delete_item': {
        const list = (planner as any)[a.table] as { id: string; deletedAt: number | null }[];
        const ts = Date.now();
        if (cmd === 'trash_item') list.find((x) => x.id === a.id)!.deletedAt = ts;
        else if (cmd === 'restore_item') list.find((x) => x.id === a.id)!.deletedAt = null;
        else {
          (planner as any)[a.table] = list.filter((x) => x.id !== a.id);
          if (a.table === 'files') {
            const f = planner.files.find((x) => x.id === a.id);
            if (f) delete blobs[f.stored];
            for (const x of planner.assignments) x.fileIds = x.fileIds.filter((id) => id !== a.id);
            persistBlobs();
          }
        }
        return ts;
      }
      case 'search': {
        const q = String(a.query ?? '').trim().toLowerCase();
        const live = rows.filter((r) => !r.deletedAt);
        const hits = q
          ? live.filter((r) => r.title.toLowerCase().includes(q) || r.text.toLowerCase().includes(q))
          : [...live].sort((x, y) => y.updatedAt - x.updatedAt);
        return hits.slice(0, a.limit ?? 30).map((r) => {
          const i = r.text.toLowerCase().indexOf(q);
          const snippet = q && i >= 0 ? `${r.text.slice(Math.max(0, i - 30), i)}\u0001${r.text.slice(i, i + q.length)}\u0002${r.text.slice(i + q.length, i + 80)}` : '';
          return { id: r.id, title: r.title, icon: r.icon, snippet, updatedAt: r.updatedAt };
        });
      }
      case 'data_info':
        return {
          dataDir: 'C:\\(browser preview)',
          dbBytes: JSON.stringify(rows).length + JSON.stringify(planner).length,
          fileBytes: planner.files.reduce((n, f) => n + f.size, 0),
          fileCount: planner.files.filter((f) => !f.deletedAt).length,
          pageCount: rows.filter((r) => !r.deletedAt).length,
          assignmentCount: planner.assignments.filter((x) => !x.deletedAt).length,
          eventCount: planner.events.filter((x) => !x.deletedAt).length,
          version: 'dev',
        };
      case 'export_markdown':
        console.info(a.markdown);
        return `C:\\Downloads\\${a.title}.md`;
      case 'plugin:window|is_maximized':
        return false;
      default:
        return null;
    }
  } finally {
    persist();
    persistPlanner();
  }
});

// save_file sends raw bytes with the name in headers, which mockIPC drops.
{
  const internals = (window as any).__TAURI_INTERNALS__;
  const invoke = internals.invoke;
  internals.invoke = async (cmd: string, args: unknown, options?: { headers?: Record<string, string> }) => {
    if (cmd !== 'save_file') return invoke(cmd, args, options);
    const bytes = args as Uint8Array;
    const name = decodeURIComponent(options?.headers?.['x-name'] ?? 'Untitled');
    const mime = decodeURIComponent(options?.headers?.['x-mime'] ?? '') || 'application/octet-stream';
    const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : 'bin';
    const stored = `${crypto.randomUUID().replace(/-/g, '')}.${ext}`;
    blobs[stored] = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(new Blob([bytes as BlobPart], { type: mime }));
    });
    persistBlobs();
    const ts = Date.now();
    const meta: FileMeta = { id: crypto.randomUUID(), name, stored, mime, size: bytes.byteLength, createdAt: ts, updatedAt: ts, deletedAt: null, missing: false };
    planner.files.push(meta);
    persistPlanner();
    return meta;
  };
}

console.info('[dev] Using in-memory backend mock');
