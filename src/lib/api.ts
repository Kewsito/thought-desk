import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import type { DataInfo, Page, PageMeta, PagePatch, SearchHit } from './types';

export const api = {
  listPages: () => invoke<PageMeta[]>('list_pages'),
  getPage: (id: string) => invoke<Page>('get_page', { id }),
  createPage: (parentId: string | null, index: number | null = null, title = '', icon = '') =>
    invoke<PageMeta>('create_page', { parentId, index, title, icon }),
  updatePage: (id: string, patch: PagePatch) => invoke<number>('update_page', { id, patch }),
  movePage: (id: string, parentId: string | null, index: number) =>
    invoke<void>('move_page', { id, parentId, index }),
  duplicatePage: (id: string) => invoke<PageMeta>('duplicate_page', { id }),
  trashPage: (id: string) => invoke<number>('trash_page', { id }),
  restorePage: (id: string) => invoke<void>('restore_page', { id }),
  deletePage: (id: string) => invoke<void>('delete_page', { id }),
  emptyTrash: () => invoke<void>('empty_trash'),
  search: (query: string, limit = 30) => invoke<SearchHit[]>('search', { query, limit }),
  exportMarkdown: (title: string, markdown: string) =>
    invoke<string>('export_markdown', { title, markdown }),
  dataInfo: () => invoke<DataInfo>('data_info'),

  /** Stores a file in the app's data folder and returns a URL the webview can load. */
  async saveFile(file: Blob, ext: string): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = await invoke<string>('save_file', bytes, { headers: { 'x-ext': ext } });
    return fileUrl(name);
  },
};

export function fileUrl(name: string): string {
  return convertFileSrc(name, 'tdfile');
}

/** Rewrites stored file URLs for the current platform's URL scheme. */
export function normalizeFileUrl(src: string): string {
  const m = /^(?:https?:\/\/tdfile\.localhost\/|tdfile:\/\/localhost\/)([A-Za-z0-9.]+)$/.exec(src);
  return m ? fileUrl(m[1]) : src;
}
