/** The shapes the API layer produces. Nothing here knows about MCP. */

/** What the Archive calls a kind of thing: texts, movies, audio, image, software. */
export type MediaType = "texts" | "movies" | "audio" | "image" | "software" | "data" | "web";

/** A catalogue row, trimmed to what picks one item out of a list. */
export interface ItemSummary {
  identifier: string;
  title: string | null;
  creator: string | null;
  year: number | null;
  mediaType: string | null;
  downloads: number | null;
  sourceUrl: string;
}

export interface ItemFile {
  name: string;
  format: string | null;
  /** Bytes, when the Archive states them. */
  size: number | null;
  downloadUrl: string;
}

export interface ItemDetail extends ItemSummary {
  /**
   * Whether the identifier names a collection rather than a single upload. On a
   * collection, the file count and the byte total describe the collection's own
   * record, not the items gathered under it.
   */
  isCollection: boolean;
  description: string | null;
  date: string | null;
  publisher: string | null;
  language: string | null;
  /** Collections this item belongs to, which is how the Archive groups things. */
  collections: string[];
  licenseUrl: string | null;
  /** Total number of files, whatever the caller asked to see. */
  fileCount: number;
  /** Combined size of every file, in bytes. */
  totalBytes: number | null;
  files: ItemFile[];
  /** Every metadata key the Archive published, for the caller who wants it all. */
  raw: Record<string, unknown> | null;
}

/**
 * One match of a phrase inside a digitised document.
 *
 * The index reports no leaf number: what it holds is the position of the search
 * text within the item, which is 1 on almost every match. Nothing here claims a
 * page, because a citation that names one the index does not know is worse than
 * a citation that names none.
 */
export interface InsideHit {
  identifier: string;
  /** Title of the item, which on a bundled document is the container's. */
  title: string | null;
  creator: string | null;
  year: number | null;
  /**
   * The document the passage was found in, when the item bundles several. Null
   * when the item is the document.
   */
  matchedFile: string | null;
  /** True when the passage comes from a document inside the item. */
  insideContainer: boolean;
  /** Passages around the match, as optical recognition read them. */
  excerpts: string[];
  sourceUrl: string;
}

export interface InsideResults {
  /** Occurrences across the whole corpus, not the number returned. */
  total: number;
  hits: InsideHit[];
}

export interface SearchResults {
  total: number;
  items: ItemSummary[];
}

/** A capture of a page, as the Wayback Machine holds it. */
export interface Snapshot {
  /** ISO 8601, converted from the Archive's own YYYYMMDDhhmmss stamp. */
  capturedAt: string;
  url: string;
  status: number | null;
}

export interface NearestSnapshot extends Snapshot {
  /** Whole days between the capture and the date that was asked for. */
  daysFromRequested: number | null;
}

export interface SnapshotHistory {
  url: string;
  /**
   * Captures in this answer. The capture index reports no grand total, so this
   * counts the window alone.
   */
  total: number;
  /** Rows the index sent, whatever survived reading. Paging follows this. */
  rowsReceived: number;
  /**
   * Opens the window after this one. Null when the index reached the end of
   * what it holds for the address.
   */
  resumeKey: string | null;
  first: string | null;
  last: string | null;
  snapshots: Snapshot[];
}

/** A work as Open Library catalogues it, which is where editions live. */
export interface Book {
  key: string;
  title: string;
  authors: string[];
  firstPublishedYear: number | null;
  editionCount: number | null;
  /** Archive identifiers holding a scan, which link a book to a readable copy. */
  archiveIdentifiers: string[];
  /** Median pages across editions, which is what the index holds. Null when it holds none. */
  pageCount: number | null;
  /** Subjects the work is catalogued under, trimmed to the most prominent. */
  subjects: string[];
  sourceUrl: string;
}
