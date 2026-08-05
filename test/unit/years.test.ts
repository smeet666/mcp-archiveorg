/**
 * What counts as a year.
 *
 * The Archive fills a missing date with zeros rather than leaving it out, and a
 * zero read as a year sorts ahead of every real one: asked for the oldest
 * recording of an opera, a caller is handed the record that carries no date at
 * all and told it is the earliest.
 */

import { describe, expect, it } from "vitest";
import { toSearchResults } from "../../src/ia/parse.js";
import { skipCounter } from "./helpers.js";

const URL_UNDER_TEST = "https://archive.org/probe";

const answerWith = (fields: Record<string, unknown>) => ({
  response: {
    body: {
      hits: {
        total: 1,
        hits: [{ fields: { identifier: "an-item", title: "An Item", ...fields } }],
      },
    },
  },
});

const yearOf = (fields: Record<string, unknown>): number | null => {
  const { onSkip } = skipCounter();
  return toSearchResults(answerWith(fields), URL_UNDER_TEST, onSkip).items[0]?.year ?? null;
};

describe("a date the Archive filled with zeros", () => {
  it("is an absent year, not the year zero", () => {
    expect(
      yearOf({ date: "0000-01-01T00:00:00Z" }),
      "a zero sorts ahead of every real year and reads as the oldest",
    ).toBeNull();
  });

  it("is absent whichever field carries it", () => {
    expect(yearOf({ year: 0 })).toBeNull();
    expect(yearOf({ year: "0000" })).toBeNull();
    expect(yearOf({ year: "0" })).toBeNull();
  });
});

describe("a year that could not have happened", () => {
  it("is refused when it predates any way of writing one down", () => {
    expect(
      yearOf({ date: "0042-01-01T00:00:00Z" }),
      "a two-digit year is a data entry, not a date",
    ).toBeNull();
  });

  it("is refused when it is beyond any plausible publication", () => {
    expect(yearOf({ year: 9999 })).toBeNull();
  });
});

describe("a year the record really carries", () => {
  it("survives as a number", () => {
    expect(yearOf({ year: 1899 })).toBe(1899);
    expect(yearOf({ year: "1899" })).toBe(1899);
  });

  it("is read out of a full date when no year field is given", () => {
    expect(yearOf({ date: "1899-07-01T00:00:00Z" })).toBe(1899);
  });

  it("keeps a genuinely old one, since the Archive holds manuscripts", () => {
    expect(yearOf({ year: 1450 })).toBe(1450);
  });
});
