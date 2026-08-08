# Changelog

## 1.4.0

- Ordering a catalogue search by `oldest` or `newest` produced an answer whose
  leading rows carried no date at all. The index files an item it holds no date
  for under a stand-in at the very start of the calendar, which is smaller than
  every real date and therefore heads an ascending order; the mirror holds for
  `newest`, led by years typed centuries ahead. Nothing said so, and the first
  row read as the oldest or newest thing the Archive holds. Both orders now
  carry notes saying what the order ranks on, that the field carries a year and
  no era so a date before the common era is filed as a year of it, and how many
  rows on the page returned carry no year at all. Rows are returned in the
  index's own order, unchanged: nothing is reordered, backfilled or filtered.
- On `search_books`, a row's year describes the work while its identifiers
  describe printings of it, so a work first published in 1459 can list a scan of
  a translation from 1893. A date-ordered answer holding such a row now says so.
- Text an uploader wrote as an HTML entity reached callers unread, so a title
  deposited as `&Ecirc;tre libre avec Sartre` was returned that way. Named and
  numeric entities are now decoded wherever text from a record is rendered:
  titles, creators, descriptions, publishers, languages, book authors, subjects
  and full-text excerpts. Identifiers, file names, dates and addresses are left
  exactly as deposited, since those name things the Archive addresses by their
  spelling. Decoding is single-pass, so `&amp;Ecirc;` yields `&Ecirc;` rather
  than a letter nobody typed, and `AT&T` is untouched. A word optical
  recognition misread is left as it was read.

## 1.3.0

- An argument no tool declared was read and dropped, and the answer came back
  computed on the defaults with nothing said about it. A caller who mistyped a
  name, or wrote one a tool answering a neighbouring question takes, was
  answered as confidently as one who had asked what they meant. Every tool now
  refuses an argument it does not declare, under the `invalid_input` code,
  naming the argument and offering the declared name when one is close:
  `identifer` on `get_item` is answered with `identifier`, `limit_per_page` on
  `search_items` with `limit`.
- The schema each tool publishes now carries `additionalProperties: false`, so a
  client reads the rule before it calls rather than discovering it from a
  refusal.

## 1.2.0

- `search_books` listed every scan of every edition on each row, which for a
  much-digitised work ran to hundreds of identifiers and made a page of six
  results heavier than most whole documents this server returns. A row now
  carries at most three, which is what a caller uses: one goes to `get_item`,
  and the next replaces a scan that will not open.
- Every row gains `scan_count`, the number of scans the work actually has, so a
  shortened list is never read as all of them. The field description says the
  list is a sample whenever the count is larger, and a note names how many were
  left out and where the rest are.
- `first_published_year` is the year Open Library derives from its edition
  records, and a reissue or a mistyped edition can put it centuries from the
  real date. Sorting by `newest` or `oldest` ranks on that field, so those rows
  lead the answer. The tool description, the field and a note on any date-sorted
  answer now say so, rather than presenting the ranking as settled.
- A free-text search says that Open Library matches parts of words across titles
  and authors, so a search for one author returns works by another whose name
  merely contains it. `search_items` already carried the same warning about
  descriptions.
- Fix the grammar of the note `search_inside` writes when the matches run past
  the page in hand.

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
