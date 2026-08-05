# Changelog

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
