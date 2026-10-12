# Thought Desk

A fast, local-first notes workspace in the spirit of Notion: nested pages, a block editor, full-text search. It has a custom title bar, a vertical sidebar and a strict black-and-white look. Built with **Rust + Tauri 2 + TypeScript** (Svelte 5 components).

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
- **Search:** `Ctrl+K` over titles and contents (SQLite FTS5 with prefix matching and a substring fallback).
- **Trash:** soft delete with *Undo*, restore (with sub-pages), permanent delete, empty trash.
- **Custom title bar:** back/forward, breadcrumbs, save status, favorite, page menu, and Windows-style window controls. Drag anywhere on the bar; double-click maximizes.
- **Export:** copy as Markdown, or export a `.md` file to Downloads.
- **Settings:** light / dark / system theme, Default / Serif / Mono page fonts, small text, spell check.
- Window size and position are remembered, a second launch focuses the running window, and changes autosave and are flushed on close/minimize.

## Keyboard

| Keys | Action |
|---|---|
| `Ctrl+K` / `Ctrl+P` | Search (with text selected in the editor, `Ctrl+K` adds a link) |
| `Ctrl+N` | New page |
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

Everything lives in one SQLite database (`thoughtdesk.db`, WAL mode) plus a `files/` folder for images. On Windows that's `%APPDATA%\app.thoughtdesk.desktop\`, and **Settings → Storage** shows the exact path. Back up that folder to back up your notes.

Set `THOUGHTDESK_DATA_DIR` to use a different folder, e.g. a portable copy on a USB drive.

## Layout

```
src/                     TypeScript + Svelte UI
  App.svelte             shell, global shortcuts, window show/close handling
  lib/store.svelte.ts    page tree state, navigation history, debounced saving
  lib/editor/            TipTap editor: slash menu, @-links, block handle, callouts…
  lib/components/        sidebar, title bar, search, settings, trash, menus
  dev-mock.ts            fake backend for `npm run dev` (dev only, not bundled)
src-tauri/src/
  db.rs                  SQLite schema, tree operations, trash, FTS search (+ tests)
  commands.rs            Tauri commands
  files.rs               image storage, `tdfile://` protocol, unused-file cleanup
  memory.rs              WebView2 suspend/trim while minimized
```

## License

Copyright (C) 2026 Kusule

Thought Desk is free software: you can redistribute it and/or modify it under the terms of the [GNU Affero General Public License](LICENSE) as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. If you distribute a modified version, or let people use one over a network, you must make its source code available under the same license.

The interface uses [Inter](https://rsms.me/inter/) by Rasmus Andersson, bundled under the SIL Open Font License 1.1.
