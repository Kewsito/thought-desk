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
  fileBytes: number;
  fileCount: number;
  pageCount: number;
  version: string;
}
