# mcp-archiveorg

## Tagline

Search inside digitised books, browse the Internet Archive, read Wayback captures.

## Description

An MCP server for the Internet Archive. Three questions, three tools. Find a
phrase written inside a scanned book, newspaper or document. Find a work in the
catalogue by title, creator or subject. See what a web page looked like on a
given date.

Searching inside the books is the part nothing else does. It reads the text
optical character recognition took off millions of scanned pages, so it answers
"which book contains this sentence", and returns the passage with a link.

The server is careful about what it refuses to claim. There is no page number,
because the index holds none. Excerpts are machine-read and can carry
misreadings, and say so. A Wayback capture always reports how many days
separate it from the date asked for, because the closest one can be years away.

## Setup Requirements

- `IA_USER_AGENT` (optional): Identify your own client. The project's own identifier is appended, so the Archive can always reach a human.
- `IA_MIN_INTERVAL_MS` (optional): Minimum gap between requests. Default 1000, and values below 500 are refused.
- `IA_TIMEOUT_MS` (optional): Per-request deadline. Default 20000.
- `IA_HISTORY_TIMEOUT_MS` (optional): Deadline for the capture index, which is slow by design. Default 60000.
- `IA_CACHE_TTL_MS` (optional): In-memory cache lifetime. Default 900000. Set 0 to turn it off.
- `IA_LOG_LEVEL` (optional): silent, error, info or debug. Default error, on stderr.

No API key and no account are needed.

## Category

Education & Research

## Features

- Full-text search inside scanned books, newspapers and documents
- Catalogue search across films, books, audio, software and images
- Read one item record section by section, including its files
- Book search over Open Library, with author, year and editions
- The Wayback capture closest to a date, with the gap always stated
- The capture history of a page, oldest first, paged by cursor
- Says when a match sits inside a bundle, and names the file that holds it
- States that scanned text is machine-read, so quotes are marked as such
- Reports what may be reused rather than letting silence read as permission
- Self-paced requests and an honest User-Agent, out of respect for a non-profit

## Getting Started

- "Which book contains the sentence 'it was a bright cold day in April'?"
- "What did the BBC home page look like in December 1998?"
- "Find recordings of Georges Brassens in the Archive"
- Tool: search_inside — Finds a phrase in the text of scanned pages
- Tool: search_items — Searches the catalogue by title, creator or subject
- Tool: get_item — Reads one record, section by section
- Tool: search_books — Finds a work on Open Library, with editions and scans
- Tool: get_snapshot — The Wayback capture closest to a date
- Tool: list_snapshots — The capture history of a page

## Tags

internet-archive, wayback-machine, books, full-text-search, open-library, archives, research, history, no-api-key

## Documentation URL

https://github.com/smeet666/mcp-archiveorg#readme
