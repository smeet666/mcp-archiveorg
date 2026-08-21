/**
 * What an absence is allowed to mean, and what an answer is allowed to be about.
 *
 * Two claims sit behind every test here. The first: an answer that found
 * nothing must say where it looked, because "no capture near this date", "no
 * row on this page" and "the Archive holds nothing" are three different
 * statements and only the last is about the world. The second: an answer is
 * about the address that was asked for, so a capture of a neighbouring address
 * is named as such rather than served under the wording the caller typed.
 */

import { describe, expect, it } from "vitest";
import { notFound } from "../../src/errors.js";
import type { ArchiveClient } from "../../src/ia/client.js";
import type { Book, NearestSnapshot, Snapshot } from "../../src/types.js";
import { runGetSnapshot } from "../../src/tools/getSnapshot.js";
import { runListSnapshots, listSnapshotsDescription } from "../../src/tools/listSnapshots.js";
import { runSearchBooks } from "../../src/tools/searchBooks.js";
import { runSearchItems } from "../../src/tools/searchItems.js";

interface Answer {
  content: Array<{ text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

const textOf = (answer: Answer) => answer.content.map((block) => block.text).join("\n");
const notesOf = (answer: Answer) =>
  ((answer.structuredContent?.notes as string[]) ?? []).join("\n");

const capture = (over: Partial<NearestSnapshot> = {}): NearestSnapshot => ({
  capturedAt: "2013-07-30T21:46:23.000Z",
  url: "http://web.archive.org/web/20130730214623/http://example.com/",
  status: 200,
  address: "http://example.com/",
  daysFromRequested: null,
  ...over,
});

/**
 * A Wayback Machine that holds captures of the address but answers nothing when
 * a moment in time is named, which is the shape that turns a date with no
 * capture into a claim about the whole address.
 */
const holdsCapturesButNotAtADate = (): ArchiveClient =>
  ({
    getSnapshot: async (target: string, at?: Date) => {
      if (at !== undefined) throw notFound(`The Wayback Machine holds no capture of ${target}.`);
      return { data: capture(), cached: false };
    },
  }) as unknown as ArchiveClient;

const holdsNothing = (): ArchiveClient =>
  ({
    getSnapshot: async (target: string) => {
      throw notFound(`The Wayback Machine holds no capture of ${target}.`);
    },
  }) as unknown as ArchiveClient;

const answersWith = (snapshot: NearestSnapshot): ArchiveClient =>
  ({
    getSnapshot: async () => ({ data: snapshot, cached: false }),
  }) as unknown as ArchiveClient;

describe("get_snapshot, a day the calendar does not have", () => {
  it("refuses it rather than rolling it into the next month", async () => {
    const answer = (await runGetSnapshot(answersWith(capture()), {
      url: "example.com",
      at: "2020-02-30",
    } as never)) as unknown as Answer;

    expect(answer.isError, "a date nobody can point at cannot be answered with a capture").toBe(
      true,
    );
    expect(textOf(answer)).toContain("[invalid_input]");
    expect(textOf(answer), "the refusal names the day it cannot read").toContain("2020-02-30");
    expect(
      textOf(answer),
      "reporting a capture as 0 days from a date that does not exist is the failure here",
    ).not.toMatch(/day\(s\) from the date asked for/);
  });

  it("still reads the last day of a leap February", async () => {
    const answer = (await runGetSnapshot(answersWith(capture()), {
      url: "example.com",
      at: "2020-02-29",
    } as never)) as unknown as Answer;

    expect(answer.isError, "29 February 2020 exists and must be answered").toBeUndefined();
  });
});

describe("get_snapshot, a date the index answers nothing for", () => {
  it("does not report the address as never captured", async () => {
    const answer = (await runGetSnapshot(holdsCapturesButNotAtADate(), {
      url: "example.com",
      at: "2013-07-30",
    } as never)) as unknown as Answer;

    expect(
      textOf(answer),
      "the lookup was narrowed by a date, so an empty answer is about that date and not about the address",
    ).not.toMatch(/holds no capture of example\.com/);
  });

  it("asks again without the date and says the date was set aside", async () => {
    const answer = (await runGetSnapshot(holdsCapturesButNotAtADate(), {
      url: "example.com",
      at: "2013-07-30",
    } as never)) as unknown as Answer;

    expect(
      answer.isError,
      "the address is captured, so there is an answer to give",
    ).toBeUndefined();
    expect(
      notesOf(answer),
      "the caller has to be told the date did not govern this capture",
    ).toMatch(/2013-07-30/);
    expect(notesOf(answer)).toMatch(/without (the |a )?date|set aside|dropped/i);
  });

  it("still answers a genuine absence as an absence", async () => {
    const answer = (await runGetSnapshot(holdsNothing(), {
      url: "zzz-never-captured.invalid",
      at: "2013-07-30",
    } as never)) as unknown as Answer;

    expect(answer.isError).toBe(true);
    expect(textOf(answer)).toContain("[not_found]");
    expect(textOf(answer)).toContain("holds no capture of zzz-never-captured.invalid");
  });
});

describe("get_snapshot, a capture of a neighbouring address", () => {
  const elsewhere = () =>
    answersWith(
      capture({
        address: "https://example.com/",
        url: "http://web.archive.org/web/20260808040442/https://example.com/",
        capturedAt: "2026-08-08T04:04:42.000Z",
      }),
    );

  it("names the address the capture is of", async () => {
    const answer = (await runGetSnapshot(elsewhere(), {
      url: "http://invalid@example.com/",
    } as never)) as unknown as Answer;

    expect(
      (answer.structuredContent?.snapshot as Record<string, unknown> | undefined)?.address,
      "the payload has to carry what the capture is of, or nothing can tell the two apart",
    ).toBe("https://example.com/");
  });

  it("warns that the capture is not evidence about the address asked for", async () => {
    const answer = (await runGetSnapshot(elsewhere(), {
      url: "http://invalid@example.com/",
    } as never)) as unknown as Answer;

    expect(notesOf(answer)).toMatch(/https:\/\/example\.com\//);
    expect(notesOf(answer), "the index keeps these as separate addresses").toMatch(
      /separate|different address|another address/i,
    );
  });

  it("does not head the answer with the capture under the wording that was typed", async () => {
    const answer = (await runGetSnapshot(elsewhere(), {
      url: "http://invalid@example.com/",
    } as never)) as unknown as Answer;

    expect(
      textOf(answer).split("\n")[0],
      "a line reading 'http://invalid@example.com/ captured …' asserts a capture of an address nothing here describes",
    ).not.toMatch(/^http:\/\/invalid@example\.com\/ captured/);
  });

  it("says nothing of the sort when the capture is of the address asked for", async () => {
    const answer = (await runGetSnapshot(answersWith(capture()), {
      url: "example.com",
    } as never)) as unknown as Answer;

    expect(notesOf(answer), "a note carried by every answer is a note nobody reads").not.toMatch(
      /separate|different address|another address/i,
    );
  });

  it("reads the default port as the address it was asked about", async () => {
    // The capture index writes an early capture as http://example.com:80/,
    // which is the same address as example.com and not a neighbour of it.
    const answer = (await runGetSnapshot(
      answersWith(
        capture({
          address: "http://example.com:80/",
          url: "http://web.archive.org/web/20020120142510/http://example.com:80/",
          capturedAt: "2002-01-20T14:25:10.000Z",
        }),
      ),
      { url: "example.com" } as never,
    )) as unknown as Answer;

    expect(
      notesOf(answer),
      "a warning raised on a plain answer is a warning nobody reads",
    ).not.toMatch(/separate|different address|another address/i);
  });

  it("refuses an address carrying a line break instead of answering about another one", async () => {
    const answer = (await runGetSnapshot(answersWith(capture()), {
      url: "example.com\nother.example",
    } as never)) as unknown as Answer;

    expect(answer.isError).toBe(true);
    expect(textOf(answer)).toContain("[invalid_input]");
  });
});

const historyClient = (snapshots: Snapshot[]): ArchiveClient =>
  ({
    listSnapshots: async () => ({
      data: {
        url: "example.com",
        total: snapshots.length,
        rowsReceived: snapshots.length,
        resumeKey: null,
        first: snapshots[0]?.capturedAt ?? null,
        last: snapshots[snapshots.length - 1]?.capturedAt ?? null,
        snapshots,
      },
      cached: false,
    }),
  }) as unknown as ArchiveClient;

const row = (capturedAt: string, address: string): Snapshot => ({
  capturedAt,
  url: `https://web.archive.org/web/x/${address}`,
  status: 200,
  address,
});

describe("list_snapshots over several address forms", () => {
  const mixed = () =>
    historyClient([
      row("2013-07-29T19:51:51.000Z", "http://invalid@example.com/"),
      row("2013-07-30T16:02:40.000Z", "http://www.example.com/"),
      row("2013-07-30T21:46:25.000Z", "https://example.com/"),
      row("2013-07-30T22:10:12.000Z", "http://user:pass@example.com/"),
    ]);

  it("says the rows cover addresses the index keeps apart", async () => {
    const answer = (await runListSnapshots(mixed(), {
      url: "example.com",
      limit: 20,
    } as never)) as unknown as Answer;

    expect(
      notesOf(answer),
      "a count of these rows is a count of captures of four addresses at once",
    ).toMatch(/address/i);
    expect(notesOf(answer)).toContain("4");
  });

  it("carries the address of each capture in the payload", async () => {
    const answer = (await runListSnapshots(mixed(), {
      url: "example.com",
      limit: 20,
    } as never)) as unknown as Answer;

    const snapshots = answer.structuredContent?.snapshots as Array<Record<string, unknown>>;
    expect(snapshots.map((snapshot) => snapshot.address)).toContain("http://www.example.com/");
  });

  it("shows the address on each rendered row, since the dates alone read as one history", async () => {
    const answer = (await runListSnapshots(mixed(), {
      url: "example.com",
      limit: 20,
    } as never)) as unknown as Answer;

    expect(textOf(answer)).toContain("http://user:pass@example.com/");
  });

  it("leaves that note off a history of one address", async () => {
    const answer = (await runListSnapshots(
      historyClient([
        row("2013-07-29T19:51:51.000Z", "http://example.com/"),
        row("2013-07-30T21:46:25.000Z", "http://example.com/"),
      ]),
      { url: "example.com", limit: 20 } as never,
    )) as unknown as Answer;

    expect(notesOf(answer), "a note carried by every answer is a note nobody reads").not.toMatch(
      /keeps apart|separate addresses/i,
    );
  });

  it("does not promise that a new date means the page differed from the row above", () => {
    expect(
      listSnapshotsDescription,
      "the row above can be a capture of another address form entirely",
    ).not.toMatch(/differ from the previous one/);
    expect(listSnapshotsDescription, "the description has to name the address forms").toMatch(
      /address/i,
    );
  });
});

const booksClient = (books: Book[], total = books.length): ArchiveClient =>
  ({
    searchBooks: async () => ({ data: { total, books }, cached: false }),
  }) as unknown as ArchiveClient;

const work = (): Book => ({
  key: "/works/OL1W",
  title: "La Nausée",
  authors: ["Jean-Paul Sartre"],
  firstPublishedYear: 1938,
  editionCount: 12,
  archiveIdentifiers: [],
  pageCount: 250,
  subjects: [],
  sourceUrl: "https://openlibrary.org/works/OL1W",
});

describe("search_books with nothing to show", () => {
  it("says where it looked rather than leaving the emptiness to speak", async () => {
    const answer = (await runSearchBooks(booksClient([], 0), {
      query: "Sartre",
      language: "zzzz",
      sort: "relevance",
      limit: 5,
      page: 1,
    } as never)) as unknown as Answer;

    expect(
      notesOf(answer),
      "an answer with no rows and no note reads as 'Open Library holds no Sartre'",
    ).not.toBe("");
  });

  it("names the criteria that had to hold at once, one of which emptied it", async () => {
    const answer = (await runSearchBooks(booksClient([], 0), {
      query: "Sartre",
      language: "zzzz",
      sort: "relevance",
      limit: 5,
      page: 1,
    } as never)) as unknown as Answer;

    expect(notesOf(answer), "the language code is what a caller has to be pointed at").toMatch(
      /language/i,
    );
    expect(notesOf(answer)).toMatch(/three-letter|eng|fre/i);
  });

  it("keeps the note off an answer that found works", async () => {
    const answer = (await runSearchBooks(booksClient([work()]), {
      query: "Sartre",
      sort: "relevance",
      limit: 5,
      page: 1,
    } as never)) as unknown as Answer;

    expect(notesOf(answer), "a note carried by every answer is a note nobody reads").not.toMatch(
      /emptie|combined and all must hold/i,
    );
  });
});

const itemsClient = (total: number): ArchiveClient =>
  ({
    searchItems: async () => ({ data: { total, items: [] }, cached: false }),
  }) as unknown as ArchiveClient;

describe("search_items past the last page", () => {
  it("does not state that the catalogue holds nothing", async () => {
    const answer = (await runSearchItems(itemsClient(40), {
      query: "pequod moby",
      sort: "relevance",
      limit: 50,
      page: 100,
    } as never)) as unknown as Answer;

    expect(
      textOf(answer),
      "40 items match, and the rendered line is the one a client shows",
    ).not.toContain('Nothing in the catalogue for "pequod moby"');
  });

  it("says the page is past the end and where the rows are", async () => {
    const answer = (await runSearchItems(itemsClient(40), {
      query: "pequod moby",
      sort: "relevance",
      limit: 50,
      page: 100,
    } as never)) as unknown as Answer;

    expect(textOf(answer)).toMatch(/past the (end|last page)/i);
    expect(textOf(answer), "the last page holding rows is what a caller asks for next").toContain(
      "1",
    );
  });

  it("still reports a genuine absence as one", async () => {
    const answer = (await runSearchItems(itemsClient(0), {
      query: "qqzzxx-unlikely-token",
      sort: "relevance",
      limit: 10,
      page: 1,
    } as never)) as unknown as Answer;

    expect(textOf(answer)).toContain("Nothing in the catalogue");
  });
});
