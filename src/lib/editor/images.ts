import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { api } from '../api';
import { ui } from '../ui.svelte';

const MAX_BYTES = 25 * 1024 * 1024;

function extensionOf(file: File): string {
  const fromType = file.type.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const fromName = file.name.includes('.') ? file.name.split('.').pop() : undefined;
  return (fromType || fromName || 'png').toLowerCase();
}

export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Saves an image into the app's data folder and inserts it at `pos`. */
export async function insertImage(editor: Editor, file: File, pos?: number) {
  if (!file.type.startsWith('image/')) return;
  if (file.size > MAX_BYTES) {
    ui.toast('Images must be smaller than 25 MB');
    return;
  }
  try {
    const src = await api.saveFile(file, extensionOf(file));
    if (editor.isDestroyed) return;
    const node = { type: 'image', attrs: { src, alt: file.name.replace(/\.[^.]+$/, '') } };
    if (pos === undefined) editor.chain().focus().insertContent(node).run();
    else editor.chain().focus().insertContentAt(pos, node).run();
  } catch (e) {
    ui.error(e);
  }
}

/** Handles images pasted or dropped into the editor. */
export const ImageDrop = Extension.create({
  name: 'imageDrop',
  addProseMirrorPlugins() {
    const editor = this.editor;
    const images = (list?: FileList | null) => Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
    return [
      new Plugin({
        key: new PluginKey('imageDrop'),
        props: {
          handlePaste(_view, event) {
            const files = images(event.clipboardData?.files);
            if (files.length === 0) return false;
            event.preventDefault();
            void (async () => {
              for (const f of files) await insertImage(editor, f);
            })();
            return true;
          },
          handleDrop(view, event, _slice, moved) {
            if (moved) return false;
            const files = images(event.dataTransfer?.files);
            if (files.length === 0) return false;
            event.preventDefault();
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
            void (async () => {
              for (const f of files) await insertImage(editor, f, at);
            })();
            return true;
          },
        },
      }),
    ];
  },
});
