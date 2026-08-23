/**
 * toInsideResults and stripHighlightMarkers: the full-text index.
 *
 * Two things distinguish this parser from the catalogue one. The total counts
 * occurrences across the whole corpus and is not a number of results, and the
 * scanner's own notation for a match must be removed before anything is quoted.
 */

import { describe, expect, it } from "vitest";
import { ArchiveError } from "../../src/errors.js";
import { stripHighlightMarkers, toInsideResults } from "../../src/ia/parse.js";
import { itemUrl } from "../../src/ia/paths.js";
import { capture, fixture, skipCounter } from "./helpers.js";

const URL_UNDER_TEST = "https://archive.org/services/search/beta/page_production/?backend=fts";

const parse = (name: string) => {
  const skips = skipCounter();
  const data = toInsideResults(fixture(name), URL_UNDER_TEST, skips.onSkip);
  return { data, skips };
};

describe("stripHighlightMarkers", () => {
  it("removes the braces the scanner wraps a match in, keeping the words", () => {
    expect(
      stripHighlightMarkers("the wind came and {{{the lamps went out}}} one by one"),
      "the caller must never see the index's own notation",
    ).toBe("the wind came and the lamps went out one by one");
  });

  it("removes every marker in a passage, not only the first", () => {
    const stripped = stripHighlightMarkers("{{{a}}} then {{{b}}} then {{{c}}}");
    expect(stripped, "a passage can carry several matches").toBe("a then b then c");
    expect(stripped).not.toContain("{{{");
    expect(stripped).not.toContain("}}}");
  });

  it("leaves text that carries no marker untouched", () => {
    expect(stripHighlightMarkers("plain scanned text"), "nothing to strip, nothing to change").toBe(
      "plain scanned text",
    );
  });

  it("leaves a lone brace alone rather than eating punctuation", () => {
    expect(
      stripHighlightMarkers("a { b } c"),
      "only the triple-brace pair is notation; single braces are scanned characters",
    ).toBe("a { b } c");
  });
});

describe("toInsideResults, good path", () => {
  it("reports the corpus-wide occurrence count, which is not the number of hits", () => {
    const { data } = parse("inside");
    expect(data.total, "total counts occurrences across the whole corpus").toBe(4177);
    expect(data.hits.length, "this page carries two matches").toBe(2);
    expect(
      data.total === data.hits.length,
      "conflating the corpus count with the page size turns 'how common is this phrase' into 'how many results are on screen'",
    ).toBe(false);
  });

  it("publishes no page number, because the index reports none", () => {
    const { data } = parse("inside");
    // Every match carries page_num 1: the field indexes the search-text file
    // within the item, not a leaf of the book. Publishing it as a page would
    // let a passage from any chapter be cited as page one.
    expect(data.hits[0]!.sourceUrl, "the link must not assert a leaf").not.toMatch(/\/page\/n\d/);
    expect(data.hits[0]!.sourceUrl, "the item page is what can honestly be cited").toBe(
      itemUrl("the-salt-almanac-1893"),
    );
  });

  it("names the document a passage came from when the item bundles several", () => {
    const { data } = parse("inside");
    const second = data.hits[1]!;
    // The item's title, creator and year describe the container; the passage
    // belongs to something else inside it.
    expect(second.insideContainer, "a bundled match must say so").toBe(true);
    expect(second.matchedFile, "the matched document has to be named").toBe(
      "orchard-quarterly-1902-04",
    );
    expect(second.sourceUrl).toBe(itemUrl("orchard-quarterly-v3"));
  });

  it("never lets the highlight markers reach the caller", () => {
    const { data } = parse("inside");
    const excerpts = data.hits.flatMap((hit) => hit.excerpts);
    expect(excerpts.length, "every hit in the fixture carries at least one passage").toBe(3);
    for (const excerpt of excerpts) {
      expect(excerpt, "the opening marker is index notation, not scanned text").not.toContain(
        "{{{",
      );
      expect(excerpt, "the closing marker is index notation, not scanned text").not.toContain(
        "}}}",
      );
    }
    expect(
      excerpts[0],
      "stripping the markers must keep the matched words in place, not delete them",
    ).toContain("the lamps went out");
  });

  it("keeps every passage a hit was given", () => {
    const { data } = parse("inside");
    expect(data.hits[0]!.excerpts.length, "the first hit was sent two passages").toBe(2);
    expect(data.hits[1]!.excerpts.length, "the second hit was sent one").toBe(1);
  });

  it("reads the catalogue fields alongside the match", () => {
    const { data } = parse("inside");
    expect(data.hits[0]!.title).toBe("The Salt Almanac");
    expect(data.hits[0]!.creator).toBe("Ines Marchetti");
    expect(data.hits[0]!.year).toBe(1893);
    expect(
      data.hits[1]!.creator,
      "a hit with no creator says so rather than inventing one",
    ).toBeNull();
    expect(data.hits[1]!.year, "a year quoted as a string must still be a number").toBe(1902);
  });
});

describe("toInsideResults, the empty result", () => {
  it("reports nothing found without failing", () => {
    const { data, skips } = parse("search-empty");
    expect(data.total, "no occurrence anywhere in the corpus").toBe(0);
    expect(data.hits).toEqual([]);
    expect(skips.total()).toBe(0);
  });
});

describe("toInsideResults, the shape that cannot be recognised", () => {
  const unrecognisable: [string, unknown][] = [
    ["a response with no body node", fixture("search-no-body")],
    ["null", null],
    ["a bare string", "gateway timeout"],
    ["hits that are not a list", { response: { body: { hits: { hits: 7 } } } }],
  ];

  for (const [label, payload] of unrecognisable) {
    it(`throws parse_failure for ${label}, never an empty result`, () => {
      const outcome = capture(() => toInsideResults(payload, URL_UNDER_TEST, () => undefined));
      expect(
        outcome.threw,
        `an unreadable response must throw; it returned ${JSON.stringify(outcome.returned)}, ` +
          "which a caller cannot tell apart from 'no digitised page carries this phrase'",
      ).toBe(true);
      expect(outcome.error).toBeInstanceOf(ArchiveError);
      expect((outcome.error as ArchiveError).code, "an unreadable shape is a parse_failure").toBe(
        "parse_failure",
      );
    });
  }
});
