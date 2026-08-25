#!/usr/bin/env node
/**
 * Writes the JSON corpus the tests read instead of calling the Archive.
 *
 * The shapes mirror what each route returns, and every title, name and passage
 * is invented: no Archive content is stored in this repository, and a
 * deterministic corpus means a test that fails is a change in this code rather
 * than a change in a catalogue. The search envelope and the item document carry
 * nodes the parsers must ignore, so a test cannot pass by reading a response
 * too literally.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");
mkdirSync(OUT, { recursive: true });

const write = (name, value) => {
  writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`${name}: ${JSON.stringify(value).length} bytes`);
};

/** The envelope every search answer arrives in, most of it of no use here. */
const envelope = (hits) => ({
  version: "fixture",
  session_context: { username: "(guest user)", is_guest: true, note: "ignored by the parsers" },
  request: { client_request_parameters: { note: "ignored by the parsers" } },
  caching: { note: "ignored by the parsers" },
  elapsed_secs: 0.12,
  response: { header: { note: "ignored" }, body: { hits }, hit_schema: { note: "ignored" } },
});

write(
  "search-catalogue.json",
  envelope({
    total: 431,
    hits: [
      {
        fields: {
          identifier: "the-glass-orchard-1971",
          title: "The Glass Orchard",
          creator: ["Vashti Reame", "Orchard Pictures"],
          year: 1971,
          date: "1971-06-04",
          mediatype: "movies",
          downloads: 8421,
        },
      },
      {
        fields: {
          identifier: "letters-from-the-salt-flats",
          title: "Letters from the Salt Flats",
          creator: "Ines Marchetti",
          year: "1954",
          mediatype: "texts",
          downloads: "311",
        },
      },
      // A row with no identifier cannot be linked to anything, so it is skipped
      // and counted rather than published half-formed.
      { fields: { title: "A row with no identifier", year: 1990 } },
    ],
  }),
);

write("search-empty.json", envelope({ total: 0, hits: [] }));

write(
  "search-unreadable.json",
  envelope({
    total: 12,
    hits: [{ fields: { title: "No identifier here" } }, { fields: {} }],
  }),
);

write("search-no-body.json", { version: "fixture", response: { header: {} } });

write(
  "inside.json",
  envelope({
    total: 4177,
    hits: [
      {
        fields: {
          identifier: "the-salt-almanac-1893",
          title: "The Salt Almanac",
          creator: "Ines Marchetti",
          year: 1893,
          // The index reports where the search text sits in the item, which is
          // 1 on almost every match. It is not a leaf of the book.
          page_num: 1,
          result_in_subfile: false,
        },
        highlight: {
          text: [
            "the wind came off the flats and {{{the lamps went out}}} one by one along the road",
            "nothing moved until {{{the lamps went out}}} and the dogs began",
          ],
        },
      },
      {
        fields: {
          identifier: "orchard-quarterly-v3",
          title: "Orchard Quarterly, Volume 3",
          year: "1902",
          page_num: 1,
          // A bundled item: the passage is in a document the item's own title
          // does not describe.
          result_in_subfile: true,
          file_basename: "orchard-quarterly-1902-04",
        },
        highlight: { text: ["a report that {{{the lamps went out}}} before the vote"] },
      },
    ],
  }),
);

write("item.json", {
  created: 1_700_000_000,
  files: [
    { name: "the-glass-orchard.pdf", format: "PDF", size: "4821004" },
    { name: "the-glass-orchard_djvu.txt", format: "DjVuTXT", size: "182004" },
    { name: "__ia_thumb.jpg", format: "Item Tile", size: "9821" },
    // A file with no name cannot be linked to, so it is left out.
    { format: "Metadata", size: "12" },
  ],
  item_size: 5_012_340,
  metadata: {
    identifier: "the-glass-orchard-1971",
    title: "The Glass Orchard",
    creator: ["Vashti Reame", "Orchard Pictures"],
    description: "A field recording made across two winters in the salt country.",
    date: "1971-06-04",
    year: "1971",
    publisher: "Orchard Pictures",
    language: "eng",
    mediatype: "movies",
    downloads: 8421,
    collection: ["feature_films", "moviesandfilms"],
    licenseurl: "https://creativecommons.org/licenses/by/4.0/",
  },
  ignored_block: { note: "the parsers must not read this" },
});

write("item-no-licence.json", {
  files: [],
  item_size: 0,
  metadata: { identifier: "letters-from-the-salt-flats", title: "Letters from the Salt Flats" },
});

/** An identifier that does not exist answers with an empty document. */
write("item-missing.json", {});

write("snapshot.json", {
  url: "example.invalid",
  archived_snapshots: {
    closest: {
      status: "200",
      available: true,
      url: "http://web.archive.org/web/20010428102248/http://example.invalid/",
      timestamp: "20010428102248",
    },
  },
});

write("snapshot-none.json", { url: "example.invalid", archived_snapshots: {} });

write("snapshot-error-status.json", {
  url: "example.invalid",
  archived_snapshots: {
    closest: {
      status: "404",
      available: true,
      url: "http://web.archive.org/web/20190101/x",
      timestamp: "20190101000000",
    },
  },
});

/** The capture index answers as rows, the first naming the columns. */
write("history.json", [
  ["timestamp", "original", "statuscode"],
  ["20010428102248", "http://example.invalid/", "200"],
  ["20020122140100", "http://example.invalid/", "200"],
  ["20040915071122", "http://example.invalid/", "404"],
]);

write("history-empty.json", []);

/** Columns in another order, which is why they are read by name. */
write("history-reordered.json", [
  ["statuscode", "timestamp", "original"],
  ["301", "20030101000000", "http://example.invalid/"],
]);

write("books.json", {
  numFound: 1361,
  docs: [
    {
      key: "/works/OL1W",
      title: "The Salt Almanac",
      author_name: ["Ines Marchetti"],
      first_publish_year: 1893,
      edition_count: 44,
      ia: ["the-salt-almanac-1893", "saltalmanac0000marc"],
    },
    {
      key: "/works/OL2W",
      title: "Orchard Quarterly",
      author_name: [],
      first_publish_year: null,
      edition_count: 3,
    },
    // No title and no key: nothing here can be cited, so it is skipped.
    { author_name: ["Anonymous"] },
  ],
});

write("books-empty.json", { numFound: 0, docs: [] });

console.log("fixtures written to test/fixtures");
