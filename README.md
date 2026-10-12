# Thought Desk

A fast, local-first notes workspace in the spirit of Notion: nested pages, a block editor, full-text search, plus assignments, a calendar and a file library that all link together. It has a custom title bar, a vertical sidebar and a black-and-white look with optional accent colors. Built with **Rust + Tauri 2 + TypeScript** (Svelte 5 components).

## Why it's light

| | Thought Desk | Typical Electron notes app |
|---|---|---|
| Installer / binary | ~4.4 MB exe | 80–200 MB |
| Memory, open | ~115 MB | 300–600 MB |
| Memory, minimized | ~95 MB | unchanged |

*Private working set summed over all processes, measured on Windows 11 with the release build.*

- **System WebView instead of a bundled Chromium.** Tauri renders with the WebView2 runtime that ships with Windows.
- **Tiny frontend runtime.** Svelte compiles to plain DOM code; the JS heap sits around 3–5 MB.
- **Only one editor is alive at a time.** Opening a page destroys the previous editor; the sidebar only loads page titles, never bodies.
- **Trims itself when minimized.** The Rust side hides and suspends the WebView and sets WebView2's memory target to *low*. Everything is restored when the window comes back. See `src-tauri/src/memory.rs`.
- **Size-optimized release profile** (LTO, `opt-level = "s"`, stripped, `panic = "abort"`).

## Features

- **Block editor:** headings, to-dos, bullets, numbers, toggles, quotes, callouts, code, tables (resizable columns), images, dividers.
- **`/` command menu** with fuzzy matching, and **Markdown shortcuts** (`#`, `-`, `1.`, `[]`, `>`, ```` ``` ````, `---`).
- **Block handle:** hover a block, drag `⋮⋮` to move it, click it for *Turn into / Duplicate / Move / Delete*, or press `+` to insert below.
- **Formatting bubble** on selection: bold, italic, underline, strike, code, highlight, links, and turn into.
- **Pages:** nested pages, sub-page blocks (`/page`), and inline page links (`@`) that stay in sync when pages are renamed.
- **Sidebar:** drag pages to reorder or nest, favorites, collapsible sections, resizable width (double-click the edge to reset).
- **Assignments:** due dates (with optional times), courses with colors, status (to do / in progress / done), priority, notes, attachments and a linked notes page. Grouped as Overdue, Today, Tomorrow, This Week, Later; quick add, course filters and search.
- **Calendar:** month view with a day agenda (due assignments, events, pages written that day) and a week view with a time grid. Events can be all-day or timed, span days, repeat daily/weekly/monthly, carry a course, color and location, and link a notes page. Drag events and assignments to reschedule.
- **Files:** one library for everything you add: imports, drops, attachments and images in pages. Grid or list, filters by type and an *Unused* filter, previews for images, PDFs, audio, video and text, *Open in default app*, *Show in folder*, *Save a copy*, and where each file is used.
- **One workspace:** `@` links a page to pages, assignments, events or files (assignment chips show a live check and due date); `/assignment`, `/event` and `/file` create or insert them from a page; a notes page links back to its assignment; due assignments show in the calendar; files dropped anywhere land in the library.
- **Search:** `Ctrl+K` over pages (SQLite FTS5 with prefix matching and a substring fallback), assignments, events and files, with quick *Go to* and *Create* actions.
- **Trash:** one trash for pages, assignments, events and files: soft delete with *Undo*, restore (pages with their sub-pages), permanent delete, empty trash.
- **Custom title bar:** back/forward, breadcrumbs, save status, favorite, page menu, and Windows-style window controls. Drag anywhere on the bar; double-click maximizes.
- **Export:** copy as Markdown, or export a `.md` file to Downloads.
- **Settings:** light / dark / system theme, accent color (Graphite plus nine colors), Default / Serif / Mono page fonts, small text, spell check, first day of the week, courses.
- Window size and position are remembered, a second launch focuses the running window, and changes autosave and are flushed on close/minimize.

## Keyboard

| Keys | Action |
|---|---|
| `Ctrl+K` / `Ctrl+P` | Search (with text selected in the editor, `Ctrl+K` adds a link) |
| `Ctrl+N` | New page |
| `Ctrl+1` / `Ctrl+2` / `Ctrl+3` | Assignments / Calendar / Files |
| `←` / `→`, `T` | Calendar: previous or next month or week, today |
| `Ctrl+\` | Toggle sidebar |
| `Alt+←` / `Alt+→`, mouse back/forward | Navigate history |
| `Ctrl+Shift+L` | Toggle dark mode |
| `Ctrl+,` | Settings |
| `Ctrl+D` | Duplicate block |
| `Ctrl+Click` on a link | Open in browser |

## Develop

Requirements: Node 20+, Rust (stable, MSVC toolchain on Windows), WebView2 runtime (preinstalled on Windows 10/11).

```bash
git clone https://github.com/kusule1351-hue/thought-desk.git
cd thought-desk
npm install
npm run app        # desktop app with hot reload (tauri dev)
npm run dev        # UI only, in a browser, with an in-memory fake backend
npm run check      # type-check the frontend
npm run bundle     # release build + Windows installer
```

```bash
cd src-tauri && cargo test   # storage tests
```

## Data

Everything lives in one SQLite database (`thoughtdesk.db`, WAL mode) plus a `files/` folder for the file library (stored under random names; the database keeps their real names). On Windows that's `%APPDATA%\app.thoughtdesk.desktop\`, and **Settings → Storage** shows the exact path. Back up that folder to back up your notes.

Set `THOUGHTDESK_DATA_DIR` to use a different folder, e.g. a portable copy on a USB drive.

## Layout

```
src/                     TypeScript + Svelte UI
  App.svelte             shell, global shortcuts, window show/close handling
  lib/store.svelte.ts    page tree state, navigation history (pages and views), debounced saving
  lib/planner.svelte.ts  courses, assignments and events
  lib/library.svelte.ts  the file library
  lib/editor/            TipTap editor: slash menu, @-links, block handle, callouts, file blocks…
  lib/views/             Assignments, Calendar (month and week) and Files
  lib/sheets/            assignment and event editors, file preview
  lib/components/        sidebar, title bar, search, settings, trash, menus
  lib/ui/                shared controls: segmented control, switch, swatches, rows…
  dev-mock.ts            fake backend for `npm run dev` (dev only, not bundled)
src-tauri/src/
  db.rs                  SQLite schema and migrations, page tree, trash, FTS search (+ tests)
  planner.rs             courses, assignments, events (+ tests)
  library.rs             file library: import, rename, usage (+ tests)
  commands.rs            Tauri commands
  files.rs               `tdfile://` protocol, stray-file cleanup
  memory.rs              WebView2 suspend/trim while minimized
```

## License

Copyright (C) 2026 Kusule

Thought Desk is free software: you can redistribute it and/or modify it under the terms of the [GNU Affero General Public License](LICENSE) as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. If you distribute a modified version, or let people use one over a network, you must make its source code available under the same license.

The interface uses [Inter](https://rsms.me/inter/) by Rasmus Andersson, bundled under the SIL Open Font License 1.1.
