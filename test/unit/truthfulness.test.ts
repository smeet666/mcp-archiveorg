/**
 * What this server is allowed to assert.
 *
 * Each test below names a sentence the caller would be told, and pins whether
 * the data supports it. A confident answer that the response does not justify
 * is the failure this whole server exists to avoid, so these come before any
 * question of coverage.
 */

import { describe, expect, it } from "vitest";
import { ArchiveError } from "../../src/errors.js";
import {
  toBooks,
  toInsideResults,
  toItemDetail,
  toSearchResults,
  toSnapshotHistory,
} from "../../src/ia/parse.js";
import { skipCounter } from "./helpers.js";

const URL_UNDER_TEST = "https://archive.org/probe";
const codeOf = (fn: () => unknown): string => {
  try {
    fn();
    return "no error";
  } catch (error) {
    return error instanceof ArchiveError ? error.code : "not an ArchiveError";
  }
};

/** The envelope a refused query comes back in: HTTP 200, and no rows. */
const refused = {
  response: {
    header: {
      succeeded: false,
      errors: [
        { message: "a structure was opened but not closed (quoted phrase open at position 1)" },
      ],
    },
    body: { hits: { total: null, hits: null } },
  },
};

describe("a query the site refused", () => {
  it("is not reported as a catalogue that holds nothing", () => {
    const { onSkip } = skipCounter();

    expect(codeOf(() => toSearchResults(refused, URL_UNDER_TEST, onSkip))).toBe("invalid_input");
  });

  it("is not reported as a corpus in which the phrase does not appear", () => {
    const { onSkip } = skipCounter();

    expect(codeOf(() => toInsideResults(refused, URL_UNDER_TEST, onSkip))).toBe("invalid_input");
  });

  it("hands back what the site said was wrong, so the caller can fix it", () => {
    const { onSkip } = skipCounter();
    try {
      toSearchResults(refused, URL_UNDER_TEST, onSkip);
      expect.unreachable("a refused query must not return");
    } catch (error) {
      expect((error as Error).message).toContain("quoted phrase open");
    }
  });
});

/** The same envelope, carrying a failure in the services behind the search. */
const brokeDown = {
  response: {
    header: {
      succeeded: false,
      errors: [
        {
          message:
            "The search backend encountered an exception (the FTS API request failed, the error reported was: HTTP 502)",
        },
      ],
    },
    body: { hits: { total: null, hits: null } },
  },
};

describe("a search whose backend failed", () => {
  it("is not reported as a query the caller wrote wrongly", () => {
    const { onSkip } = skipCounter();

    expect(
      codeOf(() => toInsideResults(brokeDown, URL_UNDER_TEST, onSkip)),
      "a well-formed search is not rewritten to repair a service behind the Archive",
    ).not.toBe("invalid_input");
  });

  it("names the service rather than the words that were searched for", () => {
    const { onSkip } = skipCounter();
    try {
      toInsideResults(brokeDown, URL_UNDER_TEST, onSkip);
      expect.unreachable("a failed search must not return");
    } catch (error) {
      expect((error as Error).message).toContain("A service behind the Internet Archive");
    }
  });
});

describe("a total that cannot be read", () => {
  it("is not rendered as zero, which reads as a proven absence", () => {
    const { onSkip } = skipCounter();
    const noTotal = { response: { body: { hits: { hits: [] } } } };

    expect(codeOf(() => toSearchResults(noTotal, URL_UNDER_TEST, onSkip))).toBe("parse_failure");
  });
});

describe("an envelope whose rows are not a list", () => {
  it("is a failure to read, not an empty answer", () => {
    const { onSkip } = skipCounter();
    const wrongShape = { response: { body: { hits: { total: 12, hits: 3 } } } };

    expect(codeOf(() => toSearchResults(wrongShape, URL_UNDER_TEST, onSkip))).toBe("parse_failure");
  });
});

describe("a metadata document that cannot be read", () => {
  it("is not reported as an item the Archive does not hold", () => {
    expect(codeOf(() => toItemDetail({ metadata: "gone" }, "x", URL_UNDER_TEST))).toBe(
      "parse_failure",
    );
  });

  it("is still an absence when the document is genuinely empty", () => {
    expect(codeOf(() => toItemDetail({}, "x", URL_UNDER_TEST))).toBe("not_found");
  });

  it("does not turn an error page into a claim about the catalogue", () => {
    expect(
      codeOf(() =>
        toItemDetail({ error: "the service is temporarily unavailable" }, "x", URL_UNDER_TEST),
      ),
    ).toBe("parse_failure");
  });
});

describe("a collection asked for as an item", () => {
  const collection = {
    is_collection: true,
    files_count: 9,
    item_size: 134_265,
    files: [{ name: "a.txt", format: "Text", size: "10" }],
    metadata: { identifier: "nasa", title: "NASA", mediatype: "collection" },
  };

  it("says so, rather than letting the counts describe what it contains", () => {
    const detail = toItemDetail(collection, "nasa", URL_UNDER_TEST);

    expect(detail.isCollection, "a collection record must announce itself").toBe(true);
  });

  it("reports the file count the Archive states, not the rows that parsed", () => {
    const detail = toItemDetail(collection, "nasa", URL_UNDER_TEST);

    expect(detail.fileCount, "one file parsed, and the record states nine").toBe(9);
  });
});

describe("a match inside a scan", () => {
  const hit = {
    response: {
      body: {
        hits: {
          total: 884,
          hits: [
            {
              fields: {
                identifier: "time-magazine-1966",
                title: "Time Magazine, 4 March 1966",
                year: 1966,
                page_num: 1,
                result_in_subfile: true,
                file_basename: "Monster World 09 [1966-07]",
              },
              highlight: { text: ["a passage {{{the drama's done}}} and the rest"] },
            },
          ],
        },
      },
    },
  };

  it("does not present the search-text file index as the page of the passage", () => {
    const { onSkip } = skipCounter();
    const results = toInsideResults(hit, URL_UNDER_TEST, onSkip);

    expect(
      (results.hits[0] as unknown as Record<string, unknown>).page,
      "page_num indexes the search-text file and is 1 on every hit, so it cannot be published as a page number",
    ).toBeUndefined();
  });

  it("does not build a link that corroborates a page it does not know", () => {
    const { onSkip } = skipCounter();
    const results = toInsideResults(hit, URL_UNDER_TEST, onSkip);

    expect(results.hits[0]?.sourceUrl, "a /page/nN link asserts a leaf number").not.toMatch(
      /\/page\/n\d/,
    );
  });

  it("says when the passage came from a document inside the item", () => {
    const { onSkip } = skipCounter();
    const results = toInsideResults(hit, URL_UNDER_TEST, onSkip);

    expect(
      results.hits[0]?.matchedFile,
      "the title and year describe the container, so the matched document has to be named",
    ).toBe("Monster World 09 [1966-07]");
    expect(results.hits[0]?.insideContainer).toBe(true);
  });
});

describe("the capture index", () => {
  it("counts the rows it could not read, like every other parser here", () => {
    const counter = skipCounter();
    const rows = [
      ["timestamp", "original", "statuscode"],
      ["20010428102248", "http://example.invalid/", "200"],
      ["not-a-stamp", "http://example.invalid/", "200"],
    ];

    toSnapshotHistory(rows, "example.invalid", URL_UNDER_TEST, counter.onSkip);

    expect(counter.total(), "a dropped row that nobody counts ends paging early").toBe(1);
  });

  it("reports how many rows the site sent, so paging follows that", () => {
    const counter = skipCounter();
    const rows = [
      ["timestamp", "original", "statuscode"],
      ["20010428102248", "http://example.invalid/", "200"],
      ["not-a-stamp", "http://example.invalid/", "200"],
    ];

    const history = toSnapshotHistory(rows, "example.invalid", URL_UNDER_TEST, counter.onSkip);

    expect(history.rowsReceived, "two rows arrived, whatever survived reading").toBe(2);
  });
});

describe("a book search whose total is missing", () => {
  it("is a failure to read rather than a total invented from the rows", () => {
    const { onSkip } = skipCounter();
    const noTotal = { docs: [{ key: "/works/OL1W", title: "A Work" }] };

    expect(codeOf(() => toBooks(noTotal, URL_UNDER_TEST, onSkip))).toBe("parse_failure");
  });
});
