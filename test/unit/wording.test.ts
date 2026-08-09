/**
 * What an answer's own sentences claim.
 *
 * A caller reads the rendered lines and the notes rather than the payload, so a
 * sentence is part of the answer: advice about a notation the query never used
 * sends a caller to change something that is already so, a count whose noun and
 * verb disagree reads as a template rather than a measurement, and a field
 * whose description names a closed set of values is a promise the catalogue
 * breaks on the first row outside it.
 */

import { describe, expect, it } from "vitest";
import type { ArchiveClient } from "../../src/ia/client.js";
import { runSearchInside } from "../../src/tools/searchInside.js";
import { runSearchItems } from "../../src/tools/searchItems.js";
import { runSearchBooks } from "../../src/tools/searchBooks.js";
import { itemSummarySchema } from "../../src/tools/shared.js";
import type { ItemSummary } from "../../src/types.js";

interface Answer {
  content: Array<{ text: string }>;
  structuredContent?: Record<string, unknown>;
}

const textOf = (answer: Answer) => answer.content.map((part) => part.text).join("\n");
const notesOf = (answer: Answer) =>
  ((answer.structuredContent?.notes as string[]) ?? []).join("\n");

const row = (fields: Partial<ItemSummary> = {}): ItemSummary => ({
  identifier: "an-item",
  title: "Mahakavi Akbar",
  titleAsFiled: null,
  creator: null,
  year: 1940,
  mediaType: "texts",
  downloads: null,
  sourceUrl: "https://archive.org/details/an-item",
  ...fields,
});

const itemsClient = (total: number, items: ItemSummary[]): ArchiveClient =>
  ({
    searchItems: async () => ({ data: { total, items }, cached: false }),
  }) as unknown as ArchiveClient;

const insideClient = (total: number, hits: unknown[]): ArchiveClient =>
  ({
    searchInside: async () => ({ data: { total, hits }, cached: false }),
  }) as unknown as ArchiveClient;

const booksClient = (total: number): ArchiveClient =>
  ({
    searchBooks: async () => ({
      data: {
        total,
        books: [
          {
            key: "/works/OL1W",
            title: "Moby Dick",
            authors: ["Herman Melville"],
            firstPublishedYear: 1851,
            editionCount: 1116,
            archiveIdentifiers: [],
            pageCount: 452,
            subjects: [],
            sourceUrl: "https://openlibrary.org/works/OL1W",
          },
        ],
      },
      cached: false,
    }),
  }) as unknown as ArchiveClient;

const searchItems = async (args: Record<string, unknown>, client: ArchiveClient): Promise<Answer> =>
  (await runSearchItems(client, args as never)) as unknown as Answer;

describe("a row that matched on an escape", () => {
  it("says the words searched for are in the text the record filed", async () => {
    // "nbsp" is in the catalogue's index because the record spells the
    // character out, and the title handed back holds the space that spelling
    // stands for. Without a word about it, the row is in the list for a reason
    // nothing on it shows.
    const answer = await searchItems(
      { query: "nbsp", sort: "relevance", limit: 10, page: 1 },
      itemsClient(1, [row({ titleAsFiled: "Mahakavi Akbar &nbsp;&nbsp;" })]),
    );

    expect(notesOf(answer)).toMatch(/escape/i);
  });

  it("says nothing of the sort when the row shows the words it matched on", async () => {
    const answer = await searchItems(
      { query: "mahakavi", sort: "relevance", limit: 10, page: 1 },
      itemsClient(1, [row({ titleAsFiled: "Mahakavi Akbar &nbsp;&nbsp;" })]),
    );

    expect(notesOf(answer), "a note carried by every answer is a note nobody reads").not.toMatch(
      /escape/i,
    );
  });
});

describe("the kind of thing a row says it is", () => {
  it("does not publish a closed list the catalogue files rows outside of", () => {
    // A search for collections comes back with `media_type: "collection"` on
    // every row, which the filter cannot ask for and a closed list denies.
    const described = itemSummarySchema.shape.media_type.description ?? "";

    expect(described, "the catalogue files kinds the filter does not offer").toMatch(/collection/i);
  });
});

describe("advice about quoting", () => {
  it("is kept off a query that carries no quotation mark", async () => {
    const answer = (await runSearchInside(insideClient(0, []), {
      query: "zzqxwv nonexistent phrase",
      limit: 3,
      page: 1,
      max_excerpts_per_match: 2,
      max_excerpt_chars: 200,
    } as never)) as unknown as Answer;

    expect(
      notesOf(answer),
      "there is nothing here to unquote, so the advice points at nothing",
    ).not.toMatch(/unquoted|without quotes|remove the quot/i);
  });

  it("is given to a query that does carry one, where it can be acted on", async () => {
    const answer = (await runSearchInside(insideClient(0, []), {
      query: '"call me ishmael today"',
      limit: 3,
      page: 1,
      max_excerpts_per_match: 2,
      max_excerpt_chars: 200,
    } as never)) as unknown as Answer;

    expect(notesOf(answer)).toMatch(/quot/i);
  });
});

describe("a count and the words around it", () => {
  it("agrees with itself when a catalogue search shows one row", async () => {
    const answer = await searchItems(
      { query: "apollo", sort: "relevance", limit: 1, page: 1 },
      itemsClient(1, [row()]),
    );

    expect(textOf(answer), "one item is not 'items'").not.toMatch(/\b1 of 1 items\b/);
  });

  it("agrees with itself when one row of many is shown", async () => {
    const answer = await searchItems(
      { query: "apollo", sort: "relevance", limit: 1, page: 1 },
      itemsClient(5760, [row()]),
    );

    expect(notesOf(answer), "one row is shown, not are shown").not.toMatch(/\b1 are shown\b/);
  });

  it("agrees with itself on a work catalogue search", async () => {
    const answer = (await runSearchBooks(booksClient(1361), {
      query: "moby dick",
      sort: "relevance",
      limit: 1,
      page: 1,
    } as never)) as unknown as Answer;

    expect(notesOf(answer)).not.toMatch(/\b1 are shown\b/);
  });

  it("agrees with itself on a full-text search", async () => {
    const hit = {
      identifier: "an-item",
      title: "Moby Dick",
      creator: null,
      year: 1851,
      matchedFile: null,
      insideContainer: false,
      excerpts: ["call me ishmael"],
      sourceUrl: "https://archive.org/details/an-item",
    };
    const answer = (await runSearchInside(insideClient(4521, [hit]), {
      query: '"call me ishmael"',
      limit: 1,
      page: 1,
      max_excerpts_per_match: 2,
      max_excerpt_chars: 200,
    } as never)) as unknown as Answer;

    expect(notesOf(answer)).not.toMatch(/\b1 are shown\b/);

    const alone = (await runSearchInside(insideClient(1, [hit]), {
      query: '"call me ishmael"',
      limit: 1,
      page: 1,
      max_excerpts_per_match: 2,
      max_excerpt_chars: 200,
    } as never)) as unknown as Answer;

    expect(textOf(alone), "one document is not 'documents'").not.toMatch(/\b1 of 1 documents\b/);
  });

  it("names a single work in the singular where a count qualifies it", async () => {
    const client = {
      searchBooks: async () => ({
        data: {
          total: 1,
          books: [
            {
              key: "/works/OL1W",
              title: "Moby Dick",
              authors: ["Herman Melville"],
              firstPublishedYear: 1851,
              editionCount: 1116,
              archiveIdentifiers: ["a", "b", "c", "d", "e", "f"],
              pageCount: 452,
              subjects: [],
              sourceUrl: "https://openlibrary.org/works/OL1W",
            },
          ],
        },
        cached: false,
      }),
    } as unknown as ArchiveClient;

    const answer = (await runSearchBooks(client, {
      query: "moby dick",
      sort: "relevance",
      limit: 10,
      page: 1,
    } as never)) as unknown as Answer;

    expect(notesOf(answer), "one work holds more, it does not hold more").not.toMatch(
      /1 work\(s\) here hold /,
    );
  });
});
