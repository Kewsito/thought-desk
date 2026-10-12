export interface PageMeta {
  id: string;
  parentId: string | null;
  title: string;
  icon: string;
  position: number;
  /** 0 when not a favorite, otherwise when it was favorited (ms). */
  favorite: number;
  fullWidth: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  tags: string[];
}

export interface Page extends PageMeta {
  /** Editor JSON (or HTML for seeded pages that were never edited). */
  content: string;
}

export interface PagePatch {
  title?: string;
  icon?: string;
  content?: string;
  text?: string;
  favorite?: boolean;
  fullWidth?: boolean;
}

export interface SearchHit {
  id: string;
  title: string;
  icon: string;
  /** Excerpt with matches wrapped in \u0001 ... \u0002. */
  snippet: string;
  updatedAt: number;
}

export interface DataInfo {
  dataDir: string;
  dbBytes: number;
  /** Bytes of everything in the files folder. */
  fileBytes: number;
  /** Live files in the library. */
  fileCount: number;
  pageCount: number;
  assignmentCount: number;
  eventCount: number;
  version: string;
}

export interface Course {
  id: string;
  name: string;
  /** Palette key, see colors.ts. */
  color: string;
  position: number;
  createdAt: number;
  teacher: string;
  email: string;
  officeHours: string;
  room: string;
  /** The page holding this course's notes; lecture notes go inside it. */
  pageId: string | null;
  /** Grade category → weight in percent. Empty: the grade is total points. */
  weights: Record<string, number>;
}

export type CoursePatch = Partial<
  Pick<Course, 'name' | 'color' | 'teacher' | 'email' | 'officeHours' | 'room' | 'pageId' | 'weights'>
>;

export type AssignmentStatus = 'todo' | 'doing' | 'done';

export interface Assignment {
  id: string;
  title: string;
  courseId: string | null;
  /** Local calendar date, "YYYY-MM-DD". */
  dueDate: string | null;
  /** Local time, "HH:MM"; null means "end of the day". */
  dueTime: string | null;
  status: AssignmentStatus;
  /** 0 none, 1 low, 2 medium, 3 high. */
  priority: number;
  notes: string;
  pageId: string | null;
  fileIds: string[];
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  deletedAt: number | null;
  tags: string[];
  /** UID of the calendar entry it was imported from. */
  sourceUid: string | null;
  /** Points earned and possible, once graded. */
  score: number | null;
  maxScore: number | null;
  /** Grade category ("Homework", "Exams"), weighted by the course. */
  category: string;
}

export type AssignmentPatch = Partial<
  Pick<
    Assignment,
    'title' | 'courseId' | 'dueDate' | 'dueTime' | 'status' | 'priority' | 'notes' | 'pageId' | 'fileIds' | 'score' | 'maxScore' | 'category'
  >
> & { sourceUid?: string };

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly';

export interface CalEvent {
  id: string;
  title: string;
  startDate: string;
  /** null for all-day events. */
  startTime: string | null;
  endDate: string;
  endTime: string | null;
  /** Palette key; empty means "use the course color". */
  color: string;
  courseId: string | null;
  location: string;
  notes: string;
  repeat: Repeat;
  repeatUntil: string | null;
  pageId: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  tags: string[];
  /** Dates a repeating event skips. */
  exdates: string[];
  sourceUid: string | null;
}

/** The notes page for one session of an event. */
export interface OccurrencePage {
  eventId: string;
  date: string;
  pageId: string;
}

/** Spaced-repetition progress of a flashcard. */
export interface CardReview {
  /** Next due date. */
  due: string;
  /** Days until the next review (0 = again today). */
  interval: number;
  ease: number;
  reps: number;
  lapses: number;
}

/** A page's flashcards, counted for today. */
export interface Deck {
  pageId: string;
  /** Cards with something on the front. */
  count: number;
  /** Studied before and due today (or earlier). */
  due: number;
  /** Never studied. */
  fresh: number;
  /** Learned well enough to be shown three weeks apart. */
  mastered: number;
}

/** A flashcard block in a page. */
export interface Card {
  pageId: string;
  id: string;
  front: string;
  back: string;
  review: CardReview | null;
}

export interface Reminder {
  key: string;
  /** When (ms since the epoch). */
  at: number;
  title: string;
  body: string;
}

export type EventPatch = { exdates?: string[]; sourceUid?: string } & Partial<
  Pick<
    CalEvent,
    | 'title'
    | 'startDate'
    | 'startTime'
    | 'endDate'
    | 'endTime'
    | 'color'
    | 'courseId'
    | 'location'
    | 'notes'
    | 'repeat'
    | 'repeatUntil'
    | 'pageId'
  >
>;

export interface FileMeta {
  id: string;
  /** Display name, with extension. */
  name: string;
  /** Name of the bytes inside the data folder (its tdfile URL). */
  stored: string;
  mime: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  /** The bytes are gone from disk. */
  missing: boolean;
  tags: string[];
}

export interface Tag {
  name: string;
  /** Palette key, or empty for the default. */
  color: string;
}

/** An unchecked to-do item inside a page. */
export interface Todo {
  pageId: string;
  /** Position among the page's to-dos, in document order. */
  index: number;
  text: string;
  /** Raw content of the item; proves it hasn't changed when toggling. */
  key: string;
}

export interface FileUsage {
  fileId: string;
  pageIds: string[];
}

/** Everything that can sit in the trash. */
export type TrashTable = 'pages' | 'assignments' | 'events' | 'files';
