import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { store } from '../store.svelte';
import { ui } from '../ui.svelte';
import { insertImage, pickImageFile } from './images';
import { rank, suggestionRenderer, type MenuEntry } from './suggestion.svelte';

const clear = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

export const SLASH_ITEMS: MenuEntry[] = [
  {
    id: 'text',
    group: 'Basic Blocks',
    title: 'Text',
    description: 'Plain paragraph',
    icon: 'text',
    keywords: 'paragraph plain',
    run: (e, r) => clear(e, r).setParagraph().run(),
  },
  {
    id: 'h1',
    group: 'Basic Blocks',
    title: 'Heading 1',
    description: 'Big section heading',
    label: 'H1',
    hint: '#',
    keywords: 'title h1 big',
    run: (e, r) => clear(e, r).setHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    group: 'Basic Blocks',
    title: 'Heading 2',
    description: 'Medium section heading',
    label: 'H2',
    hint: '##',
    keywords: 'subtitle h2',
    run: (e, r) => clear(e, r).setHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    group: 'Basic Blocks',
    title: 'Heading 3',
    description: 'Small section heading',
    label: 'H3',
    hint: '###',
    keywords: 'h3',
    run: (e, r) => clear(e, r).setHeading({ level: 3 }).run(),
  },
  {
    id: 'todo',
    group: 'Basic Blocks',
    title: 'To-do List',
    description: 'Track tasks with checkboxes',
    icon: 'todo',
    hint: '[]',
    keywords: 'todo task checkbox check checklist',
    run: (e, r) => clear(e, r).toggleTaskList().run(),
  },
  {
    id: 'bullet',
    group: 'Basic Blocks',
    title: 'Bulleted List',
    description: 'A simple bulleted list',
    icon: 'list',
    hint: '-',
    keywords: 'unordered ul bullets',
    run: (e, r) => clear(e, r).toggleBulletList().run(),
  },
  {
    id: 'numbered',
    group: 'Basic Blocks',
    title: 'Numbered List',
    description: 'A list with numbering',
    icon: 'list-ordered',
    hint: '1.',
    keywords: 'ordered ol numbers',
    run: (e, r) => clear(e, r).toggleOrderedList().run(),
  },
  {
    id: 'toggle',
    group: 'Basic Blocks',
    title: 'Toggle',
    description: 'Hide content inside a toggle',
    icon: 'toggle',
    keywords: 'collapse details expand fold',
    // New toggles start open so Enter in the summary moves into the body.
    run: (e, r) => clear(e, r).setParagraph().setDetails().updateAttributes('details', { open: true }).run(),
  },
  {
    id: 'quote',
    group: 'Basic Blocks',
    title: 'Quote',
    description: 'Capture a quotation',
    icon: 'quote',
    hint: '>',
    keywords: 'blockquote citation',
    run: (e, r) => clear(e, r).setParagraph().toggleBlockquote().run(),
  },
  {
    id: 'callout',
    group: 'Basic Blocks',
    title: 'Callout',
    description: 'Make a note stand out',
    icon: 'callout',
    keywords: 'note info tip warning box',
    run: (e, r) => clear(e, r).setParagraph().setCallout().run(),
  },
  {
    id: 'divider',
    group: 'Basic Blocks',
    title: 'Divider',
    description: 'Separate sections',
    icon: 'divider',
    hint: '---',
    keywords: 'hr rule line separator',
    run: (e, r) => clear(e, r).setHorizontalRule().run(),
  },
  {
    id: 'code',
    group: 'Basic Blocks',
    title: 'Code',
    description: 'A block of code',
    icon: 'code',
    hint: '```',
    keywords: 'snippet pre programming',
    run: (e, r) => clear(e, r).setCodeBlock().run(),
  },
  {
    id: 'table',
    group: 'Basic Blocks',
    title: 'Table',
    description: 'Rows and columns',
    icon: 'table',
    keywords: 'grid spreadsheet',
    run: (e, r) => clear(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: 'image',
    group: 'Media',
    title: 'Image',
    description: 'Upload from your computer',
    icon: 'image',
    keywords: 'picture photo upload png jpg',
    run: (e, r) => {
      clear(e, r).run();
      void pickImageFile().then((file) => file && insertImage(e, file));
    },
  },
  {
    id: 'page',
    group: 'Pages',
    title: 'Page',
    description: 'Embed a sub-page inside this page',
    icon: 'page-plus',
    keywords: 'subpage new child nested',
    run: (e, r) => {
      clear(e, r).run();
      const parent = store.currentId;
      void store.create(parent, { open: false }).then((meta) => {
        if (!meta || e.isDestroyed) return;
        e.chain().focus().insertContent({ type: 'pageLink', attrs: { id: meta.id } }).run();
        store.open(meta.id);
        ui.focusTitle = meta.id;
      });
    },
  },
  {
    id: 'link',
    group: 'Pages',
    title: 'Link to Page',
    description: 'Mention another page',
    icon: 'at',
    hint: '@',
    keywords: 'mention reference wiki',
    run: (e, r) => clear(e, r).insertContent('@').run(),
  },
  {
    id: 'date',
    group: 'Inline',
    title: 'Today’s Date',
    description: new Date().toLocaleDateString(undefined, { dateStyle: 'long' }),
    icon: 'calendar',
    keywords: 'today now time day',
    run: (e, r) =>
      clear(e, r)
        .insertContent(new Date().toLocaleDateString(undefined, { dateStyle: 'long' }) + ' ')
        .run(),
  },
];

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion<MenuEntry, MenuEntry>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return $from.parent.type.name !== 'codeBlock' && !$from.parent.type.spec.code;
        },
        items: ({ query }) =>
          query ? rank(SLASH_ITEMS, query, 12).map((i) => ({ ...i, group: undefined })) : SLASH_ITEMS,
        command: ({ editor, range, props }) => props.run(editor, range),
        render: suggestionRenderer('No matching blocks'),
      }),
    ];
  },
});
