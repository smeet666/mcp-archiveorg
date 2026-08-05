/**
 * toBooks: Open Library works and editions.
 *
 * A work with neither a title nor a key cannot be cited, so it is dropped and
 * counted. The total stays the catalogue's own, because that is what a caller
 * pages through.
 */

import { describe, expect, it } from "vitest";
import { ArchiveError } from "../../src/errors.js";
import { toBooks } from "../../src/ia/parse.js";
import { bookUrl } from "../../src/ia/paths.js";
import { capture, fixture, skipCounter } from "./helpers.js";

const URL_UNDER_TEST = "https://openlibrary.org/search.json?q=salt";

const parse = (name: string) => {
  const skips = skipCounter();
  const data = toBooks(fixture(name), URL_UNDER_TEST, skips.onSkip);
  return { data, skips };
};

describe("toBooks, good path", () => {
  it("reports the catalogue's total, not the number of works returned", () => {
    const { data } = parse("books");
    expect(data.total, "numFound is what a caller pages through").toBe(1361);
    expect(data.books.length, "two of the three works could be published").toBe(2);
    expect(data.total).not.toBe(data.books.length);
  });

  it("reads the fields that identify a work", () => {
    const { data } = parse("books");
    const first = data.books[0]!;
    expect(first.key).toBe("/works/OL1W");
    expect(first.title).toBe("The Salt Almanac");
    expect(first.authors, "authors stay a list, because a work can have several").toEqual([
      "Ines Marchetti",
    ]);
    expect(first.firstPublishedYear).toBe(1893);
    expect(first.editionCount).toBe(44);
    expect(first.sourceUrl, "the work's page on Open Library is what a citation links to").toBe(
      bookUrl("/works/OL1W"),
    );
  });

  it("keeps the scan identifiers, which are what link a work to a readable copy", () => {
    const { data } = parse("books");
    expect(
      data.books[0]!.archiveIdentifiers,
      "each identifier here can be passed to get_item or searched inside",
    ).toEqual(["the-salt-almanac-1893", "saltalmanac0000marc"]);
  });

  it("says a work has no scan with an empty list rather than a missing field", () => {
    const { data } = parse("books");
    expect(
      data.books[1]!.archiveIdentifiers,
      "no scan is an empty list, which the tool reads to warn there is nothing to read",
    ).toEqual([]);
  });

  it("leaves an unknown first year and an empty author list as they came", () => {
    const { data } = parse("books");
    const second = data.books[1]!;
    expect(second.firstPublishedYear, "an unknown year is null, never a guess").toBeNull();
    expect(second.authors, "a work with no credited author has an empty list").toEqual([]);
    expect(second.editionCount).toBe(3);
  });
});

describe("toBooks, the work that cannot be read", () => {
  it("drops a work with no title and no key, and counts it", () => {
    const { data, skips } = parse("books");
    expect(
      data.books.every((book) => book.title.length > 0 && book.key.length > 0),
      "a work with nothing to cite it by must not be published",
    ).toBe(true);
    expect(skips.total(), "the dropped work must be counted so the caller can be told").toBe(1);
  });
});

describe("toBooks, the empty result", () => {
  it("reports no work found without failing", () => {
    const { data, skips } = parse("books-empty");
    expect(data.total, "an honest zero is the catalogue's own zero").toBe(0);
    expect(data.books).toEqual([]);
    expect(skips.total()).toBe(0);
  });
});

describe("toBooks, the shape that cannot be recognised", () => {
  const unrecognisable: Array<[string, unknown]> = [
    ["null", null],
    ["a bare string", "service unavailable"],
    ["an answer with no docs", { numFound: 5 }],
    ["docs that are not a list", { numFound: 5, docs: { "0": {} } }],
    ["a list where an object was due", []],
  ];

  for (const [label, payload] of unrecognisable) {
    it(`throws parse_failure for ${label}, never an empty result`, () => {
      const outcome = capture(() => toBooks(payload, URL_UNDER_TEST, () => undefined));
      expect(
        outcome.threw,
        `an unreadable answer must throw; it returned ${JSON.stringify(outcome.returned)}, ` +
          "and an empty list reads as 'no such book was ever written'",
      ).toBe(true);
      expect(outcome.error).toBeInstanceOf(ArchiveError);
      expect((outcome.error as ArchiveError).code).toBe("parse_failure");
    });
  }
});
