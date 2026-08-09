/**
 * A field carries what its name and its schema claim, and no less.
 *
 * A caller reads a field by its name and acts on it without opening the record
 * behind it, so a name is a promise. `days_from_requested` is a distance from
 * the moment that was asked about, `query` is what the caller asked for, and a
 * field typed as text holds text. Advice is held to the same standard: a tool
 * that points at a page its own schema refuses points nowhere.
 */

import { describe, expect, it } from "vitest";
import type { ArchiveClient } from "../../src/ia/client.js";
import { toItemDetail, toNearestSnapshot } from "../../src/ia/parse.js";
import { runSearchBooks } from "../../src/tools/searchBooks.js";
import { runSearchInside } from "../../src/tools/searchInside.js";
import type { Book, InsideResults } from "../../src/types.js";

interface Answer {
  content: Array<{ text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

const notesOf = (answer: Answer) =>
  ((answer.structuredContent?.notes as string[]) ?? []).join("\n");

const URL_UNDER_TEST = "https://archive.org/probe";

/** The Wayback answer for a capture taken at a given instant. */
const captureAt = (iso: string) => ({
  archived_snapshots: {
    closest: {
      available: true,
      status: "200",
      timestamp: iso.replace(/[-:TZ]/g, "").slice(0, 14),
      url: `http://web.archive.org/web/${iso.replace(/[-:TZ]/g, "").slice(0, 14)}/http://example.invalid/`,
    },
  },
});

const gapFor = (captured: string, asked: string) =>
  toNearestSnapshot(captureAt(captured), "example.invalid", new Date(asked), URL_UNDER_TEST)
    .daysFromRequested;

describe("days_from_requested", () => {
  it("is zero for a capture taken on the day that was asked about", () => {
    // A date with no time names a day, and the lookup resolves it to the first
    // instant of that day. A capture from the evening of that same day is a
    // capture of the day asked for, and a count of one day sends a caller
    // looking for a closer one that does not exist.
    expect(gapFor("2013-07-30T21:46:23Z", "2013-07-30T00:00:00Z")).toBe(0);
  });

  it("is zero for a capture barely an hour from the moment asked about", () => {
    expect(gapFor("2013-07-30T21:46:23Z", "2013-07-30T20:43:23Z")).toBe(0);
  });

  it("counts a day only once a whole day separates the two", () => {
    expect(gapFor("2013-07-31T21:46:23Z", "2013-07-30T00:00:00Z"), "45 hours").toBe(1);
    expect(gapFor("2013-08-09T21:46:23Z", "2013-07-30T00:00:00Z"), "ten days and some").toBe(10);
  });
});

describe("the query search_books reports", () => {
  const work = (): Book => ({
    key: "/works/OL1W",
    title: "A Work",
    authors: ["Someone"],
    firstPublishedYear: 1950,
    editionCount: 2,
    archiveIdentifiers: [],
    pageCount: null,
    subjects: [],
    sourceUrl: "https://openlibrary.org/works/OL1W",
  });

  const client = (): ArchiveClient =>
    ({
      searchBooks: async () => ({ data: { total: 1, books: [work()] }, cached: false }),
    }) as unknown as ArchiveClient;

  const run = async (over: Record<string, unknown>) =>
    (await runSearchBooks(client(), {
      sort: "relevance",
      limit: 10,
      page: 1,
      ...over,
    } as never)) as Answer;

  it("is null when the caller sent no free text", async () => {
    const answer = await run({ subject: "grief" });
    const structured = answer.structuredContent as { query: unknown; searched_for: string };

    expect(
      structured.query,
      "a caller who sent no words must not read words back as the ones searched for",
    ).toBeNull();
    expect(
      structured.searched_for,
      "what the answer is an answer to still has to be stated somewhere",
    ).toMatch(/grief/);
  });

  it("is the caller's own words, unwrapped, when free text was sent", async () => {
    const structured = (await run({ query: "sartre" })).structuredContent as {
      query: unknown;
      searched_for: string;
    };

    expect(structured.query).toBe("sartre");
  });

  it("puts no quotation marks around a value that was never quoted", async () => {
    // Double quotes are this server's own notation for holding words together,
    // so a value handed back inside them reads as a phrase the caller asked
    // for, beside a note explaining that the text is matched loosely.
    const answer = await run({ query: "sartre" });
    const structured = answer.structuredContent as { searched_for: string };

    expect(structured.searched_for).not.toContain('"');
    expect(notesOf(answer)).not.toContain('"sartre"');
  });
});

describe("a field typed as text", () => {
  const description = (value: unknown) =>
    toItemDetail({ metadata: { description: value, title: "x" } }, "id", URL_UNDER_TEST)
      .description;

  it("holds no markup once its escapes have been read", () => {
    // Reading "&amp;" back while leaving "<br/>" standing makes the value
    // neither the markup the source published nor the text a caller can show.
    expect(description("Rome &amp; Juliet<br/>Second line")).toBe("Rome & Juliet\nSecond line");
    expect(description('<p>A <a href="https://example.invalid">link</a></p>')).toBe("A link");
  });

  it("keeps angle brackets that are not markup", () => {
    // Removing anything shaped like a tag would delete words a record carries.
    expect(description("the <unknown> author")).toBe("the <unknown> author");
  });

  it("holds no markup in a title either", () => {
    const title = toItemDetail(
      { metadata: { title: "Sartre <i>libre</i> &amp; seul" } },
      "id",
      URL_UNDER_TEST,
    ).title;
    expect(title).toBe("Sartre libre & seul");
  });
});

describe("the page search_inside points at", () => {
  const client = (total: number): ArchiveClient =>
    ({
      searchInside: async (): Promise<{ data: InsideResults; cached: boolean }> => ({
        data: {
          total,
          hits: [
            {
              identifier: "item-1",
              title: "Item",
              creator: null,
              year: null,
              matchedFile: null,
              insideContainer: false,
              excerpts: ["a passage"],
              sourceUrl: "https://archive.org/details/item-1",
            },
          ],
        },
        cached: false,
      }),
    }) as unknown as ArchiveClient;

  const notesAt = async (page: number) =>
    notesOf(
      (await runSearchInside(client(4000), {
        query: "orchard",
        limit: 10,
        page,
        max_excerpt_chars: 300,
        max_excerpts_per_match: 3,
      } as never)) as Answer,
    );

  it("is a page the schema accepts", async () => {
    // The last page this tool serves is 100, so advising the page after it
    // spends a call on a refusal.
    const said = await notesAt(100);
    expect(said, "page 101 cannot be asked for").not.toContain("page 101");
    expect(said, "and a caller at the ceiling needs to know that paging stops there").toMatch(
      /100/,
    );
  });

  it("is the next one while there is a next one", async () => {
    expect(await notesAt(3)).toContain("page 4");
  });
});
