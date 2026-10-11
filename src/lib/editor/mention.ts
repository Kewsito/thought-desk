import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { store } from '../store.svelte';
import { rank, suggestionRenderer, type MenuEntry } from './suggestion.svelte';

/** "@" opens a page picker that inserts an inline link to the chosen page. */
export const MentionSuggest = Extension.create({
  name: 'mentionSuggest',
  addProseMirrorPlugins() {
    return [
      Suggestion<MenuEntry, MenuEntry>({
        editor: this.editor,
        pluginKey: new PluginKey('mentionSuggest'),
        char: '@',
        allowSpaces: true,
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => {
          const pages = store.pages
            .filter((p) => !p.deletedAt)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((p) => {
              const path = store.ancestors(p.id).map((a) => a.title || 'Untitled');
              return {
                id: p.id,
                title: p.title || 'Untitled',
                description: path.length ? path.join(' / ') : undefined,
                emoji: p.icon || undefined,
                icon: p.icon ? undefined : 'page',
                group: query ? undefined : 'Recent pages',
                run: (editor, range) => {
                  editor
                    .chain()
                    .focus()
                    .insertContentAt(range, [{ type: 'mention', attrs: { id: p.id } }, { type: 'text', text: ' ' }])
                    .run();
                },
              } satisfies MenuEntry as MenuEntry;
            });
          const results: MenuEntry[] = rank(pages, query, 8);
          const title = query.trim();
          if (title) {
            results.push({
              id: '__create__',
              title: `New page “${title}”`,
              description: 'Create it inside this page',
              icon: 'page-plus',
              run: (editor, range) => {
                editor.chain().focus().deleteRange(range).run();
                void store.create(store.currentId, { open: false, title }).then((meta) => {
                  if (!meta || editor.isDestroyed) return;
                  editor
                    .chain()
                    .focus()
                    .insertContent([{ type: 'mention', attrs: { id: meta.id } }, { type: 'text', text: ' ' }])
                    .run();
                });
              },
            });
          }
          return results;
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: suggestionRenderer('No pages found'),
      }),
    ];
  },
});
