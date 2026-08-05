/**
 * Walking through more results than one answer holds.
 *
 * A caller that follows what a tool hands back must end up somewhere new. A
 * cursor that returns the same rows is worse than no cursor at all: it reads as
 * further history, so the same captures get reported twice as though they were
 * different ones.
 */

import { describe, expect, it } from "vitest";
import { toSnapshotHistory } from "../../src/ia/parse.js";
import { historyUrl } from "../../src/ia/urls.js";
import { runSearchInside } from "../../src/tools/searchInside.js";
import type { ArchiveClient } from "../../src/ia/client.js";
import { skipCounter } from "./helpers.js";

const URL_UNDER_TEST = "https://web.archive.org/cdx/search/cdx";

describe("the capture index", () => {
  it("is asked to hand back a key that resumes where the window stopped", () => {
    // The index ignores an offset: the same rows come back whatever it is set
    // to. What moves through the history is the key it emits.
    expect(historyUrl("example.invalid", 10)).toContain("showResumeKey=true");
  });

  it("carries a caller's cursor back to the index", () => {
    const url = historyUrl("example.invalid", 10, "eJxLK9LJSc3N");

    expect(url).toContain("resumeKey=eJxLK9LJSc3N");
  });

  it("takes no offset, because the index has no notion of one", () => {
    expect(historyUrl("example.invalid", 10)).not.toContain("offset");
  });

  it("reads the key out of the answer, so a caller can continue", () => {
    const counter = skipCounter();
    // The key arrives as a final row, after a blank one.
    const rows = [
      ["timestamp", "original", "statuscode"],
      ["19961019022423", "http://example.invalid/", "200"],
      [],
      ["eJxLK9LJSc3Nz0tJ1dRXMLS0NDcwMzIyNDE0MTABAHR-BzM"],
    ];

    const history = toSnapshotHistory(rows, "example.invalid", URL_UNDER_TEST, counter.onSkip);

    expect(history.resumeKey, "without the key there is no way further back").toBe(
      "eJxLK9LJSc3Nz0tJ1dRXMLS0NDcwMzIyNDE0MTABAHR-BzM",
    );
    expect(history.snapshots.length, "the key is not a capture").toBe(1);
    expect(counter.total(), "nor is it an unreadable row").toBe(0);
  });

  it("counts a capture once, however many rows the index holds for it", () => {
    const counter = skipCounter();
    // The index can hold two rows for the same visit, identical to the second
    // and pointing at the same capture. Printed twice, they read as two visits
    // and inflate any count made from the list.
    const rows = [
      ["timestamp", "original", "statuscode"],
      ["19990117081702", "http://www.gallica.bnf.fr:80/", "200"],
      ["19990117081702", "http://www.gallica.bnf.fr:80/", "200"],
      ["19990125095518", "http://www.gallica.bnf.fr:80/", "200"],
    ];

    const history = toSnapshotHistory(rows, "gallica.bnf.fr", URL_UNDER_TEST, counter.onSkip);

    expect(history.snapshots.length, "the same capture is one capture").toBe(2);
    expect(history.total).toBe(2);
    expect(history.rowsReceived, "paging still follows what the index sent").toBe(3);
    expect(counter.total(), "a duplicate is not an unreadable row").toBe(0);
  });

  it("reports no key when the index reached the end", () => {
    const counter = skipCounter();
    const rows = [
      ["timestamp", "original", "statuscode"],
      ["19961019022423", "http://example.invalid/", "200"],
    ];

    const history = toSnapshotHistory(rows, "example.invalid", URL_UNDER_TEST, counter.onSkip);

    expect(history.resumeKey, "a missing key is the end of the history").toBeNull();
  });
});

describe("passages returned per match", () => {
  const client = (): ArchiveClient =>
    ({
      searchInside: async () => ({
        data: {
          total: 4177,
          hits: [
            {
              identifier: "a-long-book",
              title: "A Long Book",
              creator: null,
              year: 1893,
              matchedFile: null,
              insideContainer: false,
              excerpts: ["one", "two", "three", "four", "five"],
              sourceUrl: "https://archive.org/details/a-long-book",
            },
          ],
        },
        cached: false,
      }),
    }) as unknown as ArchiveClient;

  const run = (args: Record<string, unknown> = {}) =>
    runSearchInside(client(), {
      query: '"a phrase"',
      limit: 10,
      page: 1,
      max_excerpt_chars: 300,
      max_excerpts_per_match: 3,
      ...args,
    } as never);

  it("does not return every passage the index found", async () => {
    // The index returns several passages per match, so a full page multiplies
    // by that factor: fifty matches of five passages is a wall of scanned text
    // nobody asked for.
    const result: any = await run();

    expect(
      result.structuredContent.hits[0].excerpts.length,
      "the number of passages needs a ceiling of its own",
    ).toBe(3);
  });

  it("says that passages were left out", async () => {
    const result: any = await run();

    expect((result.structuredContent.notes as string[]).join(" ")).toMatch(/passage/i);
  });

  it("says nothing when every passage was returned", async () => {
    const result: any = await run({ max_excerpts_per_match: 10 });

    expect((result.structuredContent.notes as string[]).join(" ")).not.toMatch(
      /passages were left out/i,
    );
  });
});
