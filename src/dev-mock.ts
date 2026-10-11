/**
 * In-memory stand-in for the Rust backend, used only when the UI runs in a
 * plain browser during development (`npm run dev`). Never bundled in builds.
 */

import { mockConvertFileSrc, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import type { PageMeta } from './lib/types';

type Row = PageMeta & { content: string; text: string };

const KEY = 'thoughtdesk.devmock';
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
  persist();
}

mockWindows('main');
mockConvertFileSrc('windows');
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
        return null;
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
        return { dataDir: 'C:\\(browser preview)', dbBytes: JSON.stringify(rows).length, fileBytes: 0, fileCount: 0, pageCount: rows.filter((r) => !r.deletedAt).length, version: 'dev' };
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
  }
});

console.info('[dev] Using in-memory backend mock');
