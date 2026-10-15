/**
 * Ways to start an empty page: lecture notes, a study guide, a flashcard
 * deck, a checklist. Each is editor JSON, plus a title and icon for a page
 * that has none yet.
 */

import type { JSONContent } from '@tiptap/core';
import { newCardId } from './flashcard';

export interface Starter {
  key: string;
  label: string;
  icon: string;
  /** Shown on hover. */
  hint: string;
  /** A title for a page that has none (today's date is filled in). */
  title: (date: string) => string;
  content: () => JSONContent[];
}

const text = (t: string): JSONContent => ({ type: 'text', text: t });
const heading = (t: string, level = 2): JSONContent => ({ type: 'heading', attrs: { level }, content: [text(t)] });
const paragraph = (t = ''): JSONContent => (t ? { type: 'paragraph', content: [text(t)] } : { type: 'paragraph' });
const bullets = (...items: string[]): JSONContent => ({
  type: 'bulletList',
  content: items.map((t) => ({ type: 'listItem', content: [paragraph(t)] })),
});
const todos = (...items: string[]): JSONContent => ({
  type: 'taskList',
  content: items.map((t) => ({ type: 'taskItem', attrs: { checked: false }, content: [paragraph(t)] })),
});
const card = (front = '', back = ''): JSONContent => ({
  type: 'flashcard',
  attrs: { id: newCardId() },
  content: [
    { type: 'flashcardFront', content: front ? [text(front)] : [] },
    { type: 'flashcardBack', content: back ? [text(back)] : [] },
  ],
});

export const STARTERS: Starter[] = [
  {
    key: 'lecture',
    label: 'Lecture notes',
    icon: '📝',
    hint: 'Key ideas, questions and a summary',
    title: (date) => `Lecture notes · ${date}`,
    content: () => [
      heading('Key ideas'),
      bullets(''),
      heading('Questions to ask'),
      bullets(''),
      heading('Summary'),
      paragraph(),
      heading('Follow up'),
      todos('Review these notes before the next class'),
    ],
  },
  {
    key: 'study',
    label: 'Study guide',
    icon: '📚',
    hint: 'Topics to cover, key terms as flashcards, practice questions',
    title: () => 'Study guide',
    content: () => [
      heading('Topics'),
      todos(''),
      heading('Key terms'),
      paragraph('Each card is a term on the front and its meaning on the back. Study them from Flashcards.'),
      card(),
      heading('Practice questions'),
      bullets(''),
    ],
  },
  {
    key: 'cards',
    label: 'Flashcards',
    icon: '🗂️',
    hint: 'Type a question, Enter for the answer, Enter again for the next card',
    title: () => 'Flashcards',
    content: () => [card()],
  },
  {
    key: 'checklist',
    label: 'Checklist',
    icon: '✅',
    hint: 'A list of things to do (they show on Home too)',
    title: () => 'To do',
    content: () => [todos('')],
  },
];
