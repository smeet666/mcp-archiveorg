/**
 * What the tool descriptions promise.
 *
 * A model chooses a tool and reads its answer through these sentences, so a
 * promise the data cannot keep is acted on as though it could. These pin the
 * three the Archive cannot support.
 */

import { describe, expect, it } from "vitest";
import { searchInsideDescription } from "../../src/tools/searchInside.js";
import { listSnapshotsDescription } from "../../src/tools/listSnapshots.js";
import { INSTRUCTIONS } from "../../src/server.js";
import { runSearchInside } from "../../src/tools/searchInside.js";
import type { ArchiveClient } from "../../src/ia/client.js";

describe("what search_inside says it returns", () => {
  it("does not promise the page a passage is on", () => {
    // The index reports where the search text sits inside the item, which is 1
    // on nearly every match. There is no leaf number to give.
    expect(searchInsideDescription, "a page cannot be promised").not.toMatch(
      /the page it is on|returns the page|and the page/i,
    );
    expect(
      searchInsideDescription,
      "and its absence has to be stated, or a model will look for one",
    ).toMatch(/no page number/i);
  });

  it("says that the count is of documents, and that they page", () => {
    expect(
      searchInsideDescription,
      "the count pages cleanly, so telling a model not to page through it loses every result after the first ten",
    ).not.toMatch(/occurrences across the whole corpus|not a number of results to page through/i);
    expect(searchInsideDescription).toMatch(/document/i);
  });

  it("warns that a title may describe the container rather than the match", () => {
    expect(searchInsideDescription).toMatch(/inside|bundl|container/i);
  });

  it("does not promise that quoting matches the spelling that was typed", () => {
    // The index folds accents, case and punctuation before it matches, so a
    // quoted "bûcher" comes back on pages carrying Bücher and Bucher. A
    // description promising a phrase matched whole sends a caller to quote a
    // word the page does not print.
    expect(
      searchInsideDescription,
      "quoting fixes the order of the words and not their letters",
    ).not.toMatch(/match it whole|matches? the phrase whole|exactly as (written|typed)/i);
  });

  it("says what quoting does do, since a caller reaches for it to be precise", () => {
    expect(searchInsideDescription, "quoting holds the words in the order given").toMatch(
      /in that order|one after another|in the order/i,
    );
    expect(searchInsideDescription, "and the index folds the spelling before matching").toMatch(
      /accent|diacritic|fold/i,
    );
  });
});

describe("what list_snapshots says the dates mean", () => {
  it("does not claim they mark when a page changed", () => {
    // A capture records when a crawler visited. A change happened somewhere
    // between two visits, and nothing here can say when.
    expect(listSnapshotsDescription).not.toMatch(/the page actually changed/i);
  });
});

describe("what the server instructions promise", () => {
  it("does not claim every result carries a source_url", () => {
    // The capture tools return the capture's own address instead.
    expect(INSTRUCTIONS).not.toMatch(/Every result carries a source_url/i);
  });

  it("still tells a model to credit the Archive and link what it uses", () => {
    expect(INSTRUCTIONS).toMatch(/credit/i);
    expect(INSTRUCTIONS).toMatch(/link/i);
  });

  it("does not describe search_inside's count as corpus occurrences", () => {
    expect(INSTRUCTIONS).not.toMatch(/occurrences across the whole corpus/i);
  });
});

describe("what the notes of an answer say", () => {
  const client = (hits: number, total: number): ArchiveClient =>
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

  const notesOf = async (hits: number, total: number) => {
    const result: any = await runSearchInside(client(hits, total), {
      query: '"a phrase"',
      limit: 10,
      page: 1,
      max_excerpt_chars: 300,
      max_excerpts_per_match: 3,
    } as never);
    return (result.structuredContent.notes as string[]).join(" ");
  };

  it("counts documents rather than occurrences, as the description does", async () => {
    // A note repeating what the description was corrected for undoes the
    // correction: a model reads whichever it sees.
    expect(await notesOf(4, 341)).not.toMatch(/occurrence/i);
    expect(await notesOf(4, 341)).toMatch(/document/i);
  });

  it("tells a caller how to reach the rest, since the count pages", async () => {
    expect(await notesOf(4, 341)).toMatch(/page/i);
  });

  it("does not advise narrowing a phrase that already matched", async () => {
    expect(await notesOf(4, 341), "narrowing loses results that are there").not.toMatch(
      /narrow the phrase/i,
    );
  });
});
