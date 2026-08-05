/**
 * Every host, route and response field name the server reads, in one place.
 *
 * The Archive publishes no contract for most of these: they are the routes its
 * own pages call. Naming them here means an upstream rename is a one-file
 * change rather than a hunt through the parsers.
 */

export const HOST = {
  archive: "https://archive.org",
  wayback: "https://web.archive.org",
  openLibrary: "https://openlibrary.org",
} as const;

export const ROUTE = {
  /** Serves both the catalogue and the full-text index, told apart by backend. */
  search: "/services/search/beta/page_production/",
  metadata: "/metadata/",
  /** The single closest capture to a date. */
  nearest: "/wayback/available",
  /** The capture index. Slow on a busy URL, and paged for that reason. */
  index: "/cdx/search/cdx",
  books: "/search.json",
} as const;

/**
 * Which index the search route queries.
 *
 * `fts` reads the text scanned out of the pages themselves, which is why it can
 * answer with a page number. `metadata` reads the catalogue: titles, creators,
 * dates, and nothing of what a book says.
 */
export const BACKEND = { inside: "fts", catalogue: "metadata" } as const;

/** Sort keys accepted by the catalogue, mapped from the words the tools use. */
export const SORT = {
  relevance: "",
  downloads: "downloads:desc",
  newest: "date:desc",
  oldest: "date:asc",
  title: "titleSorter:asc",
} as const;

/**
 * Fields read out of a search hit.
 *
 * A hit carries many more, most of them internal identifiers and timestamps of
 * no use to a caller. Reading only these is what keeps a page of results small.
 */
export const HIT_FIELD = {
  identifier: "identifier",
  title: "title",
  creator: "creator",
  year: "year",
  date: "date",
  mediaType: "mediatype",
  downloads: "downloads",
  /** True when the match came from a document bundled inside the item. */
  inSubfile: "result_in_subfile",
  /** Name of that bundled document, which the item's title does not describe. */
  matchedFile: "file_basename",
} as const;

/** Fields read out of a metadata document. */
export const META_FIELD = {
  title: "title",
  creator: "creator",
  description: "description",
  date: "date",
  year: "year",
  publisher: "publisher",
  language: "language",
  mediaType: "mediatype",
  downloads: "downloads",
  collection: "collection",
  licenseUrl: "licenseurl",
  identifier: "identifier",
} as const;

/** Fields Open Library returns when asked for them by name. */
export const BOOK_FIELD = {
  key: "key",
  title: "title",
  authors: "author_name",
  firstYear: "first_publish_year",
  editions: "edition_count",
  scans: "ia",
  pages: "number_of_pages_median",
  subjects: "subject",
} as const;

/**
 * Fields a discovery query can name, and the index field behind each one.
 *
 * Open Library indexes these separately from the free text, so `subject:grief`
 * finds works catalogued under grief while the word "grief" alone finds every
 * work that merely mentions it somewhere.
 */
export const BOOK_CRITERION = {
  subject: "subject",
  place: "place",
  time: "time",
  person: "person",
  language: "language",
} as const;

/** What the index calls each order this server offers. Relevance sends none. */
export const BOOK_SORT = {
  relevance: "",
  rating: "rating",
  readers: "readinglog",
  newest: "new",
  oldest: "old",
} as const;

/** A work tagged with two hundred subjects would swamp an answer of ten rows. */
export const MOST_SUBJECTS = 12;

/** Public page for an item, which every result carries so it can be cited. */
export const itemUrl = (identifier: string) =>
  `${HOST.archive}/details/${encodeURIComponent(identifier)}`;

export const downloadUrl = (identifier: string, file: string) =>
  `${HOST.archive}/download/${encodeURIComponent(identifier)}/${encodeURI(file)}`;

export const snapshotUrl = (timestamp: string, url: string) =>
  `${HOST.wayback}/web/${timestamp}/${url}`;

export const bookUrl = (key: string) => `${HOST.openLibrary}${key}`;
