/**
 * toSearchResults: the catalogue index.
 *
 * The invariant under test throughout is that a total is what the site
 * reported, never what this server managed to read: paging is driven by the
 * former, and a caller who sees the latter is told the corpus is smaller than
 * it is.
 */

import { describe, expect, it } from "vitest";
import { ArchiveError } from "../../src/errors.js";
import { toSearchResults } from "../../src/ia/parse.js";
import { itemUrl } from "../../src/ia/paths.js";
import { capture, fixture, skipCounter } from "./helpers.js";

const URL_UNDER_TEST = "https://archive.org/services/search/beta/page_production/?x=1";

const parse = (name: string) => {
  const skips = skipCounter();
  const data = toSearchResults(fixture(name), URL_UNDER_TEST, skips.onSkip);
  return { data, skips };
};

describe("toSearchResults, good path", () => {
  it("reports the catalogue's own total, not the number of rows returned", () => {
    const { data } = parse("search-catalogue");
    expect(data.total, "total must be the count the catalogue reported").toBe(431);
    expect(
      data.items.length,
      "the page holds fewer items than the corpus, and the two numbers must not be conflated",
    ).toBe(2);
    expect(data.total).not.toBe(data.items.length);
  });

  it("keeps the identifier and derives the citable page from it", () => {
    const { data } = parse("search-catalogue");
    const first = data.items[0]!;
    expect(first.identifier, "the identifier is what get_item takes").toBe(
      "the-glass-orchard-1971",
    );
    expect(first.sourceUrl, "every row must carry the page it can be cited from").toBe(
      itemUrl("the-glass-orchard-1971"),
    );
  });

  it("reads a creator given as a list without losing the names", () => {
    const { data } = parse("search-catalogue");
    const first = data.items[0]!;
    expect(typeof first.creator, "creator is published as a string or null, never an array").toBe(
      "string",
    );
    expect(
      first.creator,
      "a creator list must not be stringified into an object tag",
    ).not.toContain("[object");
    expect(first.creator, "the first credited creator must survive the flattening").toContain(
      "Vashti Reame",
    );
  });

  it("reads a creator given as a single string unchanged", () => {
    const { data } = parse("search-catalogue");
    expect(data.items[1]!.creator, "a lone creator string passes through as itself").toBe(
      "Ines Marchetti",
    );
  });

  it("turns numeric fields sent as strings into numbers", () => {
    const { data } = parse("search-catalogue");
    const second = data.items[1]!;
    expect(second.year, "a year quoted as a string must still be a number").toBe(1954);
    expect(second.downloads, "downloads quoted as a string must still be a number").toBe(311);
    expect(data.items[0]!.year, "a year already numeric is left alone").toBe(1971);
    expect(data.items[0]!.downloads).toBe(8421);
  });

  it("carries the media type through, which is what makes a mixed list readable", () => {
    const { data } = parse("search-catalogue");
    expect(data.items[0]!.mediaType).toBe("movies");
    expect(data.items[1]!.mediaType).toBe("texts");
  });

  it("leaves a field the row never sent as null rather than inventing one", () => {
    const { data } = parse("search-catalogue");
    expect(data.items[1]!.mediaType).toBe("texts");
    expect(data.items[1]!.downloads).toBe(311);
    expect(
      Object.values(data.items[0]!).every((value) => value !== undefined),
      "an absent field is null, never undefined, so the shape is stable",
    ).toBe(true);
  });
});

describe("toSearchResults, the row that cannot be read", () => {
  it("skips a row with no identifier and counts it, rather than failing the page", () => {
    const { data, skips } = parse("search-catalogue");
    expect(
      data.items.every((item) => item.identifier.length > 0),
      "a row with no identifier cannot be linked to and must not be published",
    ).toBe(true);
    expect(skips.total(), "the unreadable row must be counted so the caller can be told").toBe(1);
  });

  it("refuses the page when the site sent rows and none of them could be read", () => {
    // A page of results none of which can be published is not a page with
    // nothing on it: the shape has changed, and saying "nothing found" would
    // state an absence that was never established.
    const outcome = capture(() => parse("search-unreadable").data);
    expect(
      outcome.threw,
      `a page whose every row was unreadable must throw; it returned ${JSON.stringify(outcome.returned)}`,
    ).toBe(true);
    expect(outcome.error, "the refusal must be an ArchiveError").toBeInstanceOf(ArchiveError);
    expect((outcome.error as ArchiveError).code, "wholly unreadable rows are a parse_failure").toBe(
      "parse_failure",
    );
    expect(
      (outcome.error as ArchiveError).message,
      "the message must say how many rows the site sent, so the failure can be diagnosed",
    ).toContain("2");
  });
});

describe("toSearchResults, the empty result", () => {
  it("reports nothing found without reporting a failure", () => {
    const { data, skips } = parse("search-empty");
    expect(data.total, "an honest zero is the site's own zero").toBe(0);
    expect(data.items).toEqual([]);
    expect(skips.total(), "nothing was skipped, so nothing must be counted").toBe(0);
  });
});

describe("toSearchResults, the shape that cannot be recognised", () => {
  const unrecognisable: [string, unknown][] = [
    ["a response with no body node", fixture("search-no-body")],
    ["null", null],
    ["a bare string", "service unavailable"],
    ["an array where an object was due", []],
    ["an envelope whose hits are not a list", { response: { body: { hits: { hits: 3 } } } }],
  ];

  for (const [label, payload] of unrecognisable) {
    it(`throws parse_failure for ${label}, never an empty result`, () => {
      const skips = skipCounter();
      const outcome = capture(() => toSearchResults(payload, URL_UNDER_TEST, skips.onSkip));
      expect(
        outcome.threw,
        `an unreadable response must throw; it returned ${JSON.stringify(outcome.returned)}, ` +
          "and an empty result is indistinguishable from an absence and will be reported as one",
      ).toBe(true);
      expect(
        outcome.error,
        "the failure must be an ArchiveError the tool layer can map",
      ).toBeInstanceOf(ArchiveError);
      expect((outcome.error as ArchiveError).code, "an unreadable shape is a parse_failure").toBe(
        "parse_failure",
      );
    });
  }

  it("names the address in the failure, so a bug report can be made from it", () => {
    const outcome = capture(() =>
      toSearchResults(fixture("search-no-body"), URL_UNDER_TEST, () => undefined),
    );
    expect(outcome.threw, "an unreadable envelope must throw").toBe(true);
    expect(
      (outcome.error as ArchiveError).details.url,
      "the failing address travels with the error",
    ).toBe(URL_UNDER_TEST);
  });
});
