/**
 * What an order by date is allowed to claim.
 *
 * The catalogue ranks on a date a depositor typed, and three properties of that
 * field make the resulting order something other than a chronology: an item the
 * Archive holds no date for carries a placeholder at the start of the calendar,
 * a mistyped date centuries ahead is just as real to the index, and the field
 * carries no era, so an object from before the common era is filed under a year
 * of it. A caller reading the first row as "the oldest" is wrong in all three
 * cases, and nothing in the row says so.
 */

import { describe, expect, it } from "vitest";
import type { ArchiveClient } from "../../src/ia/client.js";
import { runSearchItems, searchItemsDescription } from "../../src/tools/searchItems.js";
import type { SearchItemsArgs } from "../../src/tools/searchItems.js";
import { runSearchBooks } from "../../src/tools/searchBooks.js";
import type { SearchBooksArgs } from "../../src/tools/searchBooks.js";

const clientReturning = (years: Array<number | null>): ArchiveClient =>
  ({
    searchItems: async () => ({
      data: {
        total: years.length,
        items: years.map((year, i) => ({
          identifier: `item-${i}`,
          title: `Item ${i}`,
          creator: null,
          year,
          mediaType: "texts",
          downloads: null,
          sourceUrl: `https://archive.org/details/item-${i}`,
        })),
      },
      cached: false,
    }),
  }) as unknown as ArchiveClient;

async function notesOf(
  sort: SearchItemsArgs["sort"],
  years: Array<number | null>,
): Promise<string> {
  const result = (await runSearchItems(clientReturning(years), {
    query: "book",
    sort,
    limit: 10,
    page: 1,
  } as SearchItemsArgs)) as unknown as { structuredContent: { notes: string[] } };
  return result.structuredContent.notes.join("\n");
}

describe("an order by date", () => {
  it("says what the order rests on when the oldest is asked for", async () => {
    const notes = await notesOf("oldest", [null, 1744, 1876]);

    expect(notes, "a caller told nothing reads the first row as the earliest").toMatch(/date/i);
    expect(notes, "the field is filled in by whoever deposited the item").toMatch(
      /deposit|typed|entered|declar/i,
    );
  });

  it("says the same for the newest, where a mistyped future date leads", async () => {
    const notes = await notesOf("newest", [null, 2017, 1990]);

    expect(notes).toMatch(/date/i);
    expect(notes).toMatch(/descending|later|future|ahead/i);
  });

  it("states that an undated item carries a placeholder the index sorts as a date", async () => {
    const notes = await notesOf("oldest", [null, 1744]);

    expect(notes).toMatch(/placeholder|no date/i);
  });

  it("states that a date before the common era is filed as a year of it", async () => {
    // A clay tablet of 1744 BCE is stored as 1744 and reads as a book of the
    // eighteenth century, which is the first line of a wrong answer.
    const notes = await notesOf("oldest", [null, 1744]);

    expect(notes).toMatch(/BCE|before the common era|era/i);
  });

  it("never calls the result a chronology", async () => {
    const notes = await notesOf("oldest", [null, 1744, 1876]);

    expect(notes).not.toMatch(/in chronological order|chronologically|earliest first/i);
  });

  it("counts the rows of this page that carry no year", async () => {
    // These are the rows the order cannot justify, so their number is the
    // measure of how much of the page is unsupported.
    const notes = await notesOf("oldest", [null, null, null, 1876, 1900]);

    expect(notes).toMatch(/3 of the 5 rows/);
  });

  it("counts nothing when every row carries a year", async () => {
    const notes = await notesOf("oldest", [1744, 1876, 1900]);

    expect(notes, "a count of zero reads as a finding where there is none").not.toMatch(
      /0 of the 3 rows/,
    );
  });

  it("is silent about ordering when the caller asked for none", async () => {
    for (const sort of ["relevance", "downloads", "title"] as const) {
      const notes = await notesOf(sort, [null, 1876]);

      expect(notes, `${sort} does not rank on a date`).not.toMatch(/placeholder/i);
    }
  });
});

describe("a work's year set beside the scans of it", () => {
  const withScans = (firstPublishedYear: number | null, ia: string[]): ArchiveClient =>
    ({
      searchBooks: async () => ({
        data: {
          total: 1,
          books: [
            {
              key: "/works/OL1W",
              title: "Rationale divinorum officiorum",
              authors: ["Guillaume Durand"],
              firstPublishedYear,
              editionCount: 27,
              archiveIdentifiers: ia,
              pageCount: 404,
              subjects: [],
              sourceUrl: "https://openlibrary.org/works/OL1W",
            },
          ],
        },
        cached: false,
      }),
    }) as unknown as ArchiveClient;

  const booksNotes = async (
    year: number | null,
    ia: string[],
    sort: SearchBooksArgs["sort"] = "oldest",
  ): Promise<string> => {
    const result = (await runSearchBooks(withScans(year, ia), {
      query: "Rationale divinorum officiorum",
      sort,
      limit: 10,
      page: 1,
    } as SearchBooksArgs)) as unknown as { structuredContent: { notes: string[] } };
    return result.structuredContent.notes.join("\n");
  };

  it("warns that a scan can be an edition centuries from that year", async () => {
    // A work first published in 1459 whose only scan is an English translation
    // of 1893 hands a caller an identifier that answers a different question
    // from the one the year answers, and an order by date is where the caller
    // came looking for the thing of that year.
    const notes = await booksNotes(1459, ["symbolismofchurc00dura"]);

    expect(notes).toMatch(/edition|translation|reissue/i);
    expect(notes, "the year belongs to the work, the identifier to one printing").toMatch(
      /scan|archive_identifiers/i,
    );
  });

  it("says nothing of the sort when the work has no scan to confuse it with", async () => {
    const notes = await booksNotes(1459, []);

    expect(notes).not.toMatch(/archive_identifiers/);
  });

  it("keeps the warning off an answer nobody ordered by date", async () => {
    // A caveat repeated on every answer stops being read.
    const notes = await booksNotes(1459, ["symbolismofchurc00dura"], "relevance");

    expect(notes).not.toMatch(/archive_identifiers/);
  });
});

describe("what search_items says about its orders", () => {
  it("warns that the date orders are not a chronology", () => {
    expect(searchItemsDescription).toMatch(/oldest|newest/i);
    expect(searchItemsDescription).toMatch(/date/i);
  });

  it("does not offer them as a way to find the earliest thing in the catalogue", () => {
    expect(searchItemsDescription).not.toMatch(/the earliest|the oldest item|truly oldest/i);
  });
});
