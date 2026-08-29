# Changelog

## 2.0.1

- **Every tool is documented, with its arguments and what its answer carries.**
  The README is written for a person deciding whether to install and for a
  program installing on its own, and a test holds both halves to what the server
  registers.
- **The privacy policy travels in the package.** It states the hosts contacted,
  what a request carries, what is held and for how long.
- **The manifest names every tool the server registers**, which a host reads
  before installing anything.

## 2.0.0

- **This server now needs node 24 or later.** Node 20 reached its end of
  support on 2026-04-30 and node 22 is no longer what this code is built and
  typed against. That is what makes this a major version: an install on an
  older node is refused rather than left to fail somewhere later.
- **Every refusal of an argument opens with `invalid_input`.** A value outside
  its bounds, of the wrong type, or outside the set an argument reads used to
  come back in the validator's own words, with no code to branch on.
- **A container image is published for each version**, on ghcr, for amd64 and
  arm64. The readme carries the configuration that runs it.
- The published package carries its changelog, and the entry point it declares
  for the package root now publishes its types.

## 1.5.4

### Fixed

- A search whose backend failed is reported as a service that did not answer
  whichever way the Archive says so. It marks the failed service on some
  answers and describes it in a sentence on others, quoting the status that
  service returned: `The search backend encountered an exception (the FTS API
request failed, the error reported was: HTTP 502)`. Only the marked wording
  was recognised, so the sentence came back as `invalid_input` telling the
  caller to look for an unbalanced quotation mark in a search that had none,
  and the retry that would have ridden out a passing failure was skipped.
- The same failure arriving with HTTP 200 is read the same way. The full-text
  route answers a query it will not run with a success status and no rows, and
  carries a failure of its own services in that envelope too; every one of them
  was reported as a query the caller wrote wrongly.
- The live canary declares an assertion inconclusive when the Archive did not
  answer at all, rather than failing it. A route that changed shape is what the
  canary exists to catch, and a night when the search backend is down was
  filing an issue about a contract nobody broke.

## 1.5.3

### Fixed

- A search whose backend failed inside the Archive is reported as a service that
  did not answer, rather than as a search the caller wrote wrongly. The Archive
  answers such a failure with the status it also uses to refuse a request, and
  states a reason for it that is marked as an error of its own, beside the
  service that did not respond. That reason was read as a verdict on the query,
  so a well-formed search came back as `invalid_input` while the same words were
  answered again as soon as the service recovered. A stated reason carrying such
  a marker is asked again and, if it stands, reported as a failure behind the
  Archive, with the Archive's own words kept so it can be recognised.

## 1.5.2

### Fixed

- A refusal the Archive states no reason for is no longer reported as a mistake
  in the request. The Archive answers HTTP 400 both to a request it objects to
  and to one it declines to serve at that moment, and only the first carries a
  sentence naming what was wrong. Every 400 was read as the second kind, so a
  perfectly well-formed search came back as `invalid_input` advising the caller
  to check their quotation marks, and the same words were answered a minute
  later. A refusal with no stated reason is now asked again and, if it stands,
  reported as a failure of the request to be served rather than of the caller to
  write it.
- A refusal the Archive does explain repeats the Archive's own sentence, so a
  search whose quotation mark is never closed says which structure was opened
  and where, rather than listing the characters that can break a query.

## 1.5.1

- The README carries the same badge row as every server here: npm, CI, the
  licence, the MCP registry entry, the Glama score, and one-click installs for
  Cursor and VS Code. Each install link encodes this package. npm serves the
  README frozen at publish time, so a release is what puts it there.

## 1.5.0

- `search_items` could not find `AT&T`, `R&D` or `M&Ms`: the catalogue's query
  parser refuses an ampersand written against a word, and the refusal came back
  as an invitation to check quotation marks and brackets the query did not
  carry. The index folds punctuation before it matches, so such a term now
  reaches it written with a space and held together by quotes, which returns the
  records printing the ampersand; the answer names the term as it was sent. An
  ampersand standing alone between spaces, and the doubled one the index reads
  as AND, are left as they were written.
- One hint about query syntax was attached to every request the Archive refused,
  including those of `get_item`, `get_snapshot` and `list_snapshots`, which send
  no query at all. A refusal now names what the request actually carried: the
  words of a search, the identifier of an item, or the web address of a capture
  lookup.
- `get_item` answered a full address or a path with `parse_failure` and an
  invitation to open a bug report, dressing a typing mistake as a fault of the
  server. The metadata route reads what it is handed up to the first slash, so
  `https://archive.org/details/nasa` arrived as a request for an item called
  `https:`. Such a value is now refused as an argument, and the refusal hands
  back the identifier sitting inside it. A record the Archive answers with an
  error of its own repeats what it said instead of blaming the shape.
- `get_snapshot` reported a value that names no web address as an address the
  Wayback Machine never captured, in the same words as a genuine miss. A value
  with no host in it is refused, because looking it up produces an empty answer
  in the shape of an absence.
- `days_from_requested` reported 1 for a capture taken on the day asked about
  and 0 for one an hour away, because a date with no time names the first
  instant of that day and the part-day was rounded up. The gap is counted in
  whole days, so a capture from the evening of the day named is 0.
- `search_books` returned, in its `query` field, a value the caller never sent:
  a search by `subject` came back as `subject "grief"`, wrapped in the quotation
  marks this server publishes as the way to ask for a phrase, beside a note
  about free text being matched loosely. `query` now holds the caller's own
  words, or null when the search was made of criteria alone, and `searched_for`
  states in words what the answer answers.
- Entities were read back inside fields that kept their HTML tags, so `title`
  and `description` were neither the markup the record carries nor the text
  their schema promises. Both are read as text: the elements a deposit form
  produces are resolved, the ones ending a line become one, and a bracketed word
  that is not an element, such as `the <unknown> author`, stands as written.
- `search_inside` advised asking for page 101 while its own schema stops at 100.
  An answer sitting on the last page says that paging stops there and that the
  matches beyond it are reached by narrowing the words.
- `get_item` forgave the space around an identifier without a word and refused a
  capital without one. The trimming is now stated in a note, and an identifier
  carrying capitals that finds nothing says that identifiers are matched exactly
  and names the lower-case spelling.
- `get_snapshot` reported an address as never captured when only the date it was
  asked about came back empty: `example.com` at `2013-07-30` answered "the
  Wayback Machine holds no capture of example.com", while the same call carrying
  a time returned a capture from that very day. A date is a restriction on the
  lookup, so an empty answer under it is set aside and the address is asked about
  on its own; the answer says the date was dropped and how far the capture it
  found sits from it. An address the index holds nothing for at all is still an
  absence, in those words. The same tool accepted `2020-02-30`, rolled it to 29
  February and reported a capture as "0 day(s) from the date asked for" for a day
  the calendar does not have; such a day is now refused.
- `get_snapshot` answered about a different address from the one asked for:
  `http://invalid@example.com/` and `http://www.example.com/` both returned a
  capture of `http://example.com/`, headed under the wording the caller typed.
  The Wayback Machine keeps those forms as separate addresses with separate
  histories, so every capture now carries the `address` it is of, and an answer
  resolved to a neighbour says so rather than presenting it as the address that
  was asked about. A port the scheme implies names the same address, so an early
  capture written `http://example.com:80/` raises nothing. An address carrying a
  line break or a tab is refused, instead of being trimmed on the way out and
  answered with a capture of whatever survived.
- `list_snapshots` merged captures of several addresses under one heading, which
  made its own note about collapsed captures false: consecutive rows differed
  because they were different addresses, not because the page had changed. Each
  row now names the address it captured, and an answer covering more than one
  says how many, so a count of the rows is not read as a count of captures of any
  single address.
- `search_books` said nothing at all about an answer holding no work, so a
  language code Open Library does not use read as the catalogue holding no
  Sartre. An empty answer now says the criteria hold at once and that one value
  the catalogue does not use empties it, names the three-letter codes the
  language field is matched against, and states that free text reads titles and
  authors alone.
- `search_items` past the last page of a match set stated that the catalogue held
  nothing, contradicted by its own note counting the matches. A page holding no
  row while the search matched some now says where it sits, how many pages the
  matches fill, and that the rows are on the pages before it. The same holds for
  `search_books`. A search that genuinely matched nothing still says so.
- A year range on `search_items` filters the catalogue's declared date, the same
  field the date orders rank, and that field carries no era: a range of 1700 to
  1750 answers with Babylonian tablets of 1712 and 1726 BCE, filed as years of
  the common era. A range of 1 to 100 answers with rows whose year is
  unreadable, every one of them. An answer holding a range now says which field
  was filtered, that the field carries no era, and how many of the rows shown
  carry no year this server could read. The caveats travel with an answer
  resting on that field, by a range or by an order, and with no other.
- The note explaining why a row heads the `oldest` order named a single cause,
  an undated item's placeholder, on rows that carry a date. `BIUSante_ms02045`
  is deposited with the date `15` for a fifteenth-century manuscript and the
  index files it at the year 15. The note now names both causes, the placeholder
  and the date read as a fragment, and attributes neither to a particular row.
- `search_inside` described double quotes as matching a phrase whole. Quoting
  holds the words together and in the order given; the index folds accents, case
  and punctuation before it matches, so `"bûcher"` answers with pages printing
  `Bücher` and `Bucher`. The description states what quoting does and what it
  leaves to the index.
- The caveat about the date field carrying no era rode on every answer resting
  on that field, including a range of 2020 to 2024 whose rows are deposits made
  as the Archive collected them. It now travels where a year can be read two
  ways, which is a range or a row reaching back before the Archive began taking
  deposits.
- The explanation of what heads the `oldest` order, a placeholder date and a
  date read as a fragment, appeared on pages where every row carries a year,
  such as page 40 of a deep result. It now travels with the rows it describes,
  which are the rows this server reads no year on; the order still says which
  field it ranks and who filled it in.
- A title filed with its characters written as escapes came back padded with the
  spaces those escapes stand for, so `Mahakavi Akbar &nbsp;&nbsp;` read as a
  title cut short. Such a value now ends where its words end. A search matching
  such a record matches the text as filed, so the words searched for can be
  absent from every field shown: an answer holding such a row says so, and names
  escapes and markup as where those words live.
- `media_type` on a catalogue row was described as one of texts, movies, audio,
  image, software or data, and a search for a collection fills every row with
  `collection`, which the filter cannot ask for. The field is described as the
  kind the catalogue files a row under, naming the common values and the kinds
  outside them.
- Escaped characters were read back only in the exact case the table holds, so
  `&Amp;` reached a caller as five characters. A name is now read back in any
  case where the table holds a single character under it, and left standing
  where case is what picks the character, as it is between `&Egrave;` and
  `&egrave;`.
- A full-text search matching nothing advised matching the words separately,
  without quotes, on queries carrying none: advice to undo something already so.
  That advice now goes to a quoted query alone, and an unquoted one is told its
  words were matched separately.
- Counts and the words around them disagreed on one: `1 of 1 items`, `4521 works
match and 1 are shown`, `1 work(s) here hold more`. A count now agrees with its
  noun and its verb.

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
