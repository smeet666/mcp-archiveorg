# Changelog

## 1.1.0

- `search_books` finds a book you cannot name. It took a title or an author, so
  a reader arriving with a shape rather than a name had nothing to ask with.
  It now also takes `subject`, `place`, `time`, `person` and `language`, ranges
  on the year of first publication and on the page count, and a `sort` by rating
  or by readers. The criteria combine, and existing calls are untouched: a
  `query` on its own behaves exactly as it did.
- Every result carries `page_count` and `subjects`. Filtering on a page count
  the answer never returned would have been a promise it could not keep.
- A call naming no criterion at all is refused rather than answered with the
  catalogue, which would read as a result instead of as a mistake. So is a year
  or page range whose ends are the wrong way round.
- Point the one-click Cursor install at the package this project publishes. The
  link carried a name npm does not serve, so the install it offered could not
  succeed.

## 1.0.0

First stable release. The tool names, the argument names and the shape of the
structured output are settled and will not change without a major version.

Six tools over the Internet Archive, with no API key and no account.

- `search_inside` reads the text optical recognition took off millions of
  scanned pages, so it answers a question no catalogue can: which book contains
  this phrase.
- `search_items` searches the catalogue, `search_books` searches Open Library
  for the work behind a scan, and `get_item` reads one record section by
  section.
- `get_snapshot` and `list_snapshots` read the Wayback Machine.

Two things this release is careful about, both learned the hard way.

The full-text index reports where the search text sits inside an item, which is
1 on nearly every match. It is not a leaf of the book. Nothing here publishes a
page number, and no link claims one: a citation naming a page the index does not
know is worse than a citation naming none.

A failure is never reported as an empty result. The site answers a query it
will not run with HTTP 200 and no rows, and reading only the rows turns "I
refused this" into "there is none of it". A refused query is `invalid_input`
carrying what the site objected to, an unreadable answer is `parse_failure`, and
only an empty record is an absence.
