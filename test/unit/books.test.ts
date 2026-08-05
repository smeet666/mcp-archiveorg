/**
 * What a list of works may claim, and what it may weigh.
 *
 * A listing is read to pick one row out of many, so every field on it is paid
 * for by all the rows a caller did not want. Two things here cost more than
 * they return: the scans of a heavily digitised work, which run to hundreds of
 * identifiers where a caller passes one to get_item; and the year Open Library
 * records as a first publication, which is taken from edition records and is
 * wrong often enough that ordering on it puts the doubtful rows in front.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ArchiveClient } from "../../src/ia/client.js";
import { MOST_SCANS } from "../../src/ia/paths.js";
import {
  runSearchBooks,
  searchBooksDescription,
  searchBooksOutput,
} from "../../src/tools/searchBooks.js";
import { runSearchInside } from "../../src/tools/searchInside.js";
import type { Book } from "../../src/types.js";

const work = (over: Partial<Book> = {}): Book => ({
  key: "/works/OL1W",
  title: "A Tale of Two Cities",
  authors: ["Charles Dickens"],
  firstPublishedYear: 1800,
  editionCount: 431,
  archiveIdentifiers: Array.from({ length: 213 }, (_, i) => `taleoftwocities${i}`),
  pageCount: 384,
  subjects: ["Fiction"],
  sourceUrl: "https://openlibrary.org/works/OL1W",
  ...over,
});

const booksClient = (books: Book[]): ArchiveClient =>
  ({
    searchBooks: async () => ({ data: { total: books.length, books }, cached: false }),
  }) as unknown as ArchiveClient;

interface Answer {
  structuredContent: {
    books: Array<{
      archive_identifiers: string[];
      scan_count: number;
      first_published_year: number | null;
    }>;
    notes: string[];
  };
  content: Array<{ text: string }>;
}

const ask = async (books: Book[], args: Record<string, unknown> = {}): Promise<Answer> =>
  (await runSearchBooks(booksClient(books), {
    query: "Philip K. Dick",
    sort: "relevance",
    limit: 10,
    page: 1,
    ...args,
  } as never)) as unknown as Answer;

const notesOf = async (books: Book[], args: Record<string, unknown> = {}): Promise<string> =>
  (await ask(books, args)).structuredContent.notes.join(" ");

describe("the scans listed on a row", () => {
  it("stops at a ceiling, so one heavily digitised work cannot swamp the answer", async () => {
    const answer = await ask([work()]);

    expect(
      answer.structuredContent.books[0]!.archive_identifiers.length,
      "213 identifiers on one row of a listing cost more than every other field together",
    ).toBeLessThanOrEqual(MOST_SCANS);
  });

  it("keeps enough of them that a scan which will not open can be replaced", async () => {
    const answer = await ask([work()]);

    expect(
      answer.structuredContent.books[0]!.archive_identifiers.length,
      "a caller passes one to get_item and reaches for the next when it does not read",
    ).toBeGreaterThanOrEqual(2);
  });

  it("says how many scans the work carries, so a trimmed list is not read as all of them", async () => {
    const answer = await ask([work()]);

    expect(answer.structuredContent.books[0]!.scan_count).toBe(213);
  });

  it("counts the scans the work has even when every one of them is listed", async () => {
    const answer = await ask([work({ archiveIdentifiers: ["only-one-scan"] })]);
    const row = answer.structuredContent.books[0]!;

    expect(row.scan_count).toBe(1);
    expect(row.archive_identifiers).toEqual(["only-one-scan"]);
  });

  it("reports a work with no scan as a zero rather than as a missing count", async () => {
    const answer = await ask([work({ archiveIdentifiers: [] })]);

    expect(answer.structuredContent.books[0]!.scan_count).toBe(0);
  });

  it("declares in the field description that a trimmed list is a sample", () => {
    // The JSON Schema is what reaches a client, so the description is read
    // from there rather than from the zod object it was written on.
    const described = JSON.stringify(z.toJSONSchema(searchBooksOutput));

    expect(described, "a caller reading the field has to be told it can be a sample").toMatch(
      /sample/i,
    );
  });

  it("tells the caller in a note when identifiers were left out", async () => {
    const notes = await notesOf([work()]);

    expect(notes, "a silent cut reads as the whole list").toMatch(/scan/i);
    expect(notes, "and the note names the number that exists").toMatch(/213/);
  });

  it("leaves that note out when every identifier was listed", async () => {
    expect(await notesOf([work({ archiveIdentifiers: ["one", "two"] })])).not.toMatch(/scan_count/);
  });

  it("counts scans in the text block from what the work holds, not from what was listed", async () => {
    const answer = await ask([work()]);
    const text = answer.content.map((block) => block.text).join("\n");

    expect(text, "the rendered count names the work's scans").toContain("213 scan");
  });
});

describe("an order built on the year of first publication", () => {
  it("says what the ranking rests on when the caller sorts by date", async () => {
    const notes = await notesOf([work()], { sort: "oldest" });

    expect(
      notes,
      "the rows that lead this order are the ones whose year is least likely to be right",
    ).toMatch(/first_published_year/);
    expect(notes).toMatch(/edition/i);
  });

  it("says it for the newest end of the same field", async () => {
    expect(await notesOf([work()], { sort: "newest" })).toMatch(/first_published_year/);
  });

  it("leaves the note out when nothing was ordered by date", async () => {
    expect(
      await notesOf([work()], { sort: "relevance" }),
      "a note that appears on every answer stops being read",
    ).not.toMatch(/first_published_year/);
  });
});

describe("free text against the Open Library index", () => {
  it("warns in a note that a name reaches works by other authors", async () => {
    const notes = await notesOf([work()]);

    expect(
      notes,
      "a search for one author answered with another's work is the failure here",
    ).toMatch(/'authors' on each row/);
  });

  it("leaves that warning out when the search names criteria instead", async () => {
    expect(await notesOf([work()], { query: undefined, subject: "grief" })).not.toMatch(
      /'authors' on each row/,
    );
  });

  it("says the same things in the tool description, which is read before the call", () => {
    expect(searchBooksDescription).toMatch(/authors/);
    expect(
      searchBooksDescription,
      "a year taken from an edition record cannot be repeated as a first publication",
    ).toMatch(/first_published_year/);
  });
});

describe("the note that tells a caller to keep paging", () => {
  const insideClient = (hits: number, total: number): ArchiveClient =>
    ({
      searchInside: async () => ({
        data: {
          total,
          hits: Array.from({ length: hits }, (_, i) => ({
            identifier: `item-${i}`,
            title: `Item ${i}`,
            creator: null,
            year: null,
            matchedFile: null,
            insideContainer: false,
            excerpts: ["a passage"],
            sourceUrl: `https://archive.org/details/item-${i}`,
          })),
        },
        cached: false,
      }),
    }) as unknown as ArchiveClient;

  it("is written in grammatical English", async () => {
    const result = (await runSearchInside(insideClient(3, 511), {
      query: '"a phrase"',
      limit: 3,
      page: 1,
      max_excerpt_chars: 300,
      max_excerpts_per_match: 3,
    } as never)) as unknown as Answer;
    const notes = result.structuredContent.notes.join(" ");

    expect(notes, "'this count' is singular and cannot take a plural verb").not.toMatch(
      /this count pages/,
    );
    expect(notes, "and the caller still has to be told to ask for the next page").toMatch(/page 2/);
  });
});
