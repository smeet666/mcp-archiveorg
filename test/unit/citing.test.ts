/**
 * What a caller can cite from the text block alone.
 *
 * Many clients render nothing but that block. A row it prints without a link
 * is a row a model must either drop or invent an address for, and inventing one
 * from an identifier is the easier of the two.
 */

import { describe, expect, it } from "vitest";
import { runSearchBooks } from "../../src/tools/searchBooks.js";
import { runSearchItems } from "../../src/tools/searchItems.js";
import { runListSnapshots } from "../../src/tools/listSnapshots.js";
import type { ArchiveClient } from "../../src/ia/client.js";

const textOf = (result: any) => result.content[0].text as string;

const itemsClient = (): ArchiveClient =>
  ({
    searchItems: async () => ({
      data: {
        total: 207,
        items: [
          {
            identifier: "a-real-record",
            title: "A Real Record",
            creator: "Someone",
            year: 1954,
            mediaType: "audio",
            downloads: 12,
            sourceUrl: "https://archive.org/details/a-real-record",
          },
          {
            identifier: "a-compilation",
            title: "A Compilation Naming Many Artists",
            creator: "Someone Else",
            year: 2013,
            mediaType: "audio",
            downloads: 8,
            sourceUrl: "https://archive.org/details/a-compilation",
          },
        ],
      },
      cached: false,
    }),
  }) as unknown as ArchiveClient;

const booksClient = (): ArchiveClient =>
  ({
    searchBooks: async () => ({
      data: {
        total: 3,
        books: [
          {
            key: "/works/OL1W",
            title: "A Work",
            authors: ["An Author"],
            firstPublishedYear: 1893,
            editionCount: 4,
            archiveIdentifiers: ["a-scan"],
            sourceUrl: "https://openlibrary.org/works/OL1W",
          },
        ],
      },
      cached: false,
    }),
  }) as unknown as ArchiveClient;

const snapshotsClient = (): ArchiveClient =>
  ({
    listSnapshots: async () => ({
      data: {
        url: "example.invalid",
        total: 1,
        rowsReceived: 1,
        resumeKey: null,
        first: "2001-04-28T10:22:48.000Z",
        last: "2001-04-28T10:22:48.000Z",
        snapshots: [
          {
            capturedAt: "2001-04-28T10:22:48.000Z",
            url: "https://web.archive.org/web/20010428102248/http://example.invalid/",
            status: 200,
          },
        ],
      },
      cached: false,
    }),
  }) as unknown as ArchiveClient;

describe("the text block of a catalogue search", () => {
  it("prints an address for every row it lists", async () => {
    const text = textOf(
      await runSearchItems(itemsClient(), {
        query: "someone",
        sort: "relevance",
        limit: 10,
        page: 1,
      } as never),
    );

    expect(text, "an identifier alone invites a model to build a URL from it").toContain(
      "https://archive.org/details/a-real-record",
    );
    expect(text).toContain("https://archive.org/details/a-compilation");
  });
});

describe("the text block of a book search", () => {
  it("prints an address for every work it lists", async () => {
    const text = textOf(
      await runSearchBooks(booksClient(), { query: "a work", limit: 10, page: 1 } as never),
    );

    expect(text).toContain("https://openlibrary.org/works/OL1W");
  });
});

describe("the text block of a capture list", () => {
  it("prints the capture itself, not only its date", async () => {
    const text = textOf(
      await runListSnapshots(snapshotsClient(), { url: "example.invalid", limit: 20 } as never),
    );

    expect(text, "a date without its capture cannot be opened").toContain(
      "https://web.archive.org/web/20010428102248/",
    );
  });
});

describe("what a catalogue search matches on", () => {
  it("says that a result may name the query only in its description", async () => {
    // A compilation whose sleeve notes mention an artist ranks alongside that
    // artist's own records, and nothing in a row distinguishes the two.
    const result: any = await runSearchItems(itemsClient(), {
      query: "someone",
      sort: "relevance",
      limit: 10,
      page: 1,
    } as never);

    expect(
      (result.structuredContent.notes as string[]).join(" "),
      "a model told these all match will treat a passing mention as authorship",
    ).toMatch(/description/i);
  });
});
