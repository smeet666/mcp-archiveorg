/**
 * Finding a book you cannot name.
 *
 * A title lookup answers "where is this book". A reader more often arrives with
 * a shape instead: a subject, a period, a setting, a length they will actually
 * finish. Open Library indexes those separately from the free text, so asking
 * for them means naming the field rather than hoping a word lands in it.
 *
 * Two rules hold throughout. A criterion the caller gave must reach the query,
 * and a field the caller filtered on must come back in the answer: filtering on
 * a page count that is never returned is a promise the result cannot keep.
 */

import { describe, expect, it } from "vitest";
import { booksUrl } from "../../src/ia/urls.js";
import { BOOK_FIELD } from "../../src/ia/paths.js";
import { toBooks } from "../../src/ia/parse.js";

const params = (url: string) => new URL(url).searchParams;
const q = (criteria: Parameters<typeof booksUrl>[0]) => params(booksUrl(criteria, 10, 1)).get("q");

describe("the query sent to Open Library", () => {
  it("still passes free text through untouched", () => {
    expect(q({ query: "the mill on the floss" })).toBe("the mill on the floss");
  });

  it("names the field for each criterion rather than hoping free text finds it", () => {
    expect(q({ subject: "grief" })).toBe('subject:"grief"');
    expect(q({ place: "Shanghai" })).toBe('place:"Shanghai"');
    expect(q({ time: "20th century" })).toBe('time:"20th century"');
    expect(q({ person: "Napoleon" })).toBe('person:"Napoleon"');
    expect(q({ language: "eng" })).toBe('language:"eng"');
  });

  it("joins several criteria so each one narrows the last", () => {
    const query = q({ subject: "spy stories", language: "eng", place: "Berlin" }) ?? "";

    expect(query).toContain('subject:"spy stories"');
    expect(query).toContain('language:"eng"');
    expect(query).toContain('place:"Berlin"');
    expect(query.split(" AND ")).toHaveLength(3);
  });

  it("keeps free text alongside the criteria, rather than dropping one of them", () => {
    const query = q({ query: "cold war", subject: "espionage" }) ?? "";

    expect(query).toContain("cold war");
    expect(query).toContain('subject:"espionage"');
  });

  it("writes a year range the index understands", () => {
    expect(q({ year_from: 2000, year_to: 2020 })).toBe("first_publish_year:[2000 TO 2020]");
  });

  it("leaves an open-ended range open", () => {
    expect(q({ year_from: 1990 })).toBe("first_publish_year:[1990 TO *]");
    expect(q({ year_to: 1900 })).toBe("first_publish_year:[* TO 1900]");
  });

  it("writes a page range on the field the index actually carries", () => {
    expect(q({ pages_max: 250 })).toBe("number_of_pages_median:[* TO 250]");
  });

  it("quotes a value so its spaces and colons cannot become operators", () => {
    // "spy stories" unquoted searches for "spy" in subject and "stories"
    // anywhere, which silently answers a different question.
    expect(q({ subject: 'a "quoted" word' })).toBe('subject:"a \\"quoted\\" word"');
  });
});

describe("the sort asked for", () => {
  const sortOf = (sort: string) =>
    params(booksUrl({ subject: "x", sort } as never, 10, 1)).get("sort");

  it("maps each choice onto what Open Library names it", () => {
    expect(sortOf("newest")).toBe("new");
    expect(sortOf("oldest")).toBe("old");
    expect(sortOf("rating")).toBe("rating");
    expect(sortOf("readers")).toBe("readinglog");
  });

  it("sends no sort at all for relevance, which is the index's own order", () => {
    expect(sortOf("relevance")).toBeNull();
  });
});

describe("the fields requested of the index", () => {
  it("asks for the page count, so a filter on it can be shown", () => {
    expect(Object.values(BOOK_FIELD)).toContain("number_of_pages_median");
  });

  it("asks for the subjects, which are what a discovery query matched on", () => {
    expect(Object.values(BOOK_FIELD)).toContain("subject");
  });
});

describe("a work read back from the index", () => {
  const payload = {
    numFound: 713,
    docs: [
      {
        key: "/works/OL16239762W",
        title: "A Monster Calls",
        author_name: ["Patrick Ness"],
        first_publish_year: 2011,
        edition_count: 42,
        number_of_pages_median: 224,
        subject: ["Grief", "Fiction", "Juvenile fiction"],
      },
    ],
  };

  it("carries the page count", () => {
    const { books } = toBooks(payload, "https://example.test", () => undefined);

    expect(books[0]!.pageCount).toBe(224);
  });

  it("carries the subjects, capped so a heavily tagged work cannot swamp the answer", () => {
    const many = {
      numFound: 1,
      docs: [{ ...payload.docs[0], subject: Array.from({ length: 200 }, (_, i) => `tag ${i}`) }],
    };
    const { books } = toBooks(many, "https://example.test", () => undefined);

    expect(books[0]!.subjects.length).toBeGreaterThan(0);
    expect(books[0]!.subjects.length).toBeLessThanOrEqual(12);
  });

  it("reports no page count rather than zero when the index holds none", () => {
    const without = { numFound: 1, docs: [{ key: "/works/OL1W", title: "Untitled" }] };
    const { books } = toBooks(without, "https://example.test", () => undefined);

    expect(books[0]!.pageCount).toBeNull();
    expect(books[0]!.subjects).toEqual([]);
  });
});
