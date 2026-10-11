import { Node, mergeAttributes } from '@tiptap/core';
import { mount, unmount } from 'svelte';
import PageChip from './PageChip.svelte';
import { store } from '../store.svelte';

const titleOf = (id: string) => store.byId.get(id)?.title || 'Untitled';

function chipView(block: boolean) {
  return ({ node }: { node: { attrs: Record<string, any> } }) => {
    const dom = document.createElement(block ? 'div' : 'span');
    dom.className = block ? 'page-link' : 'page-mention';
    dom.contentEditable = 'false';
    const id = node.attrs.id as string;
    const chip = mount(PageChip, { target: dom, props: { id, block } });
    return {
      dom,
      update: (updated: { type: { name: string }; attrs: Record<string, any> }) =>
        updated.type.name === (block ? 'pageLink' : 'mention') && updated.attrs.id === id,
      destroy: () => void unmount(chip),
      ignoreMutation: () => true,
    };
  };
}

const idAttr = {
  id: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-page-id'),
    renderHTML: (attrs: Record<string, any>) => ({ 'data-page-id': attrs.id }),
  },
};

/** A block that links to a (usually child) page. */
export const PageLink = Node.create({
  name: 'pageLink',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: () => idAttr,
  parseHTML: () => [{ tag: 'div[data-page-link]' }],
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-page-link': '' })];
  },
  renderText: ({ node }) => titleOf(node.attrs.id),
  addNodeView: () => chipView(true),
});

/** An inline link to a page, inserted with "@". */
export const Mention = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes: () => idAttr,
  parseHTML: () => [{ tag: 'span[data-page-mention]' }],
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-page-mention': '' })];
  },
  renderText: ({ node }) => titleOf(node.attrs.id),
  addNodeView: () => chipView(false),
});
