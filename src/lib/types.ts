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
}

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
}

export type AssignmentPatch = Partial<
  Pick<Assignment, 'title' | 'courseId' | 'dueDate' | 'dueTime' | 'status' | 'priority' | 'notes' | 'pageId' | 'fileIds'>
>;

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
}

export type EventPatch = Partial<
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
}

export interface FileUsage {
  fileId: string;
  pageIds: string[];
}

/** Everything that can sit in the trash. */
export type TrashTable = 'pages' | 'assignments' | 'events' | 'files';
